/* ---------- Firebase 初期化 ---------- */
// firebaseConfig は firebase-config.js で定義されています
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const placesCol = db.collection("places");

/* ---------- 定数 ---------- */

const WEATHER_LABELS = {
  sunny: "☀️ 晴れの日",
  rainy: "☔ 雨の日",
  cold: "❄️ 寒い日",
  hot: "🔥 暑い日",
};
const TYPE_LABELS = {
  pool: { icon: "🏊", label: "プール" },
  park: { icon: "🌳", label: "公園" },
  other: { icon: "📍", label: "その他" },
};

/* ---------- 状態 ---------- */

let places = [];
let loaded = false;
let query = "";
let typeFilter = "all";
let weatherFilter = new Set();

let draft = null;      // フォームで編集中のデータ
let editingId = null;  // null なら新規追加

/* ---------- ユーティリティ ---------- */

function emptyDraft() {
  return {
    name: "",
    type: "pool",
    address: "",
    weather: { sunny: false, rainy: false, cold: false, hot: false },
    distanceKm: "",
    travelTimeMin: "",
    highwayToll: "",
    overallStars: 0,
    changingRoomStars: 0,
    poolFeatures: [],
    reservationRequired: false,
    timeLimit: "",
    price: "",
    parkingCapacity: "",
    parkingEaseStars: 0,
    notes: "",
  };
}

function mapsDirectionsUrl(place) {
  const q = place.address || place.name;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function showStatus(msg) {
  const el = document.getElementById("statusMsg");
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
  } else {
    el.hidden = false;
    el.textContent = msg;
  }
}

/* ---------- Firestore 読み込み（リアルタイム同期） ---------- */

placesCol.orderBy("createdAt", "desc").onSnapshot(
  (snapshot) => {
    places = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    loaded = true;
    showStatus("");
    render();
  },
  (err) => {
    console.error(err);
    showStatus("データの読み込みに失敗しました。firebase-config.js の設定と、Firestoreのセキュリティルールを確認してください。");
    document.getElementById("loadingMsg").hidden = true;
  }
);

async function saveToFirestore(id, data) {
  try {
    if (id) {
      await placesCol.doc(id).update(data);
    } else {
      await placesCol.add({ ...data, createdAt: Date.now() });
    }
    showStatus("");
  } catch (e) {
    console.error(e);
    showStatus("保存に失敗しました。通信状態を確認してください。");
  }
}

async function deleteFromFirestore(id) {
  try {
    await placesCol.doc(id).delete();
    showStatus("");
  } catch (e) {
    console.error(e);
    showStatus("削除に失敗しました。通信状態を確認してください。");
  }
}

/* ---------- 星の描画 ---------- */

function renderStars(container, value, interactive, onChange) {
  container.innerHTML = "";
  for (let n = 1; n <= 5; n++) {
    const span = document.createElement("span");
    span.className = "oz-star" + (n <= value ? " filled" : "");
    span.textContent = "★";
    if (interactive) {
      span.addEventListener("click", () => {
        onChange(n === value ? 0 : n);
      });
    }
    container.appendChild(span);
  }
}

/* ---------- 一覧の描画 ---------- */

function filteredPlaces() {
  return places
    .filter((p) => {
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (weatherFilter.size > 0) {
        const w = p.weather || {};
        let match = false;
        weatherFilter.forEach((k) => { if (w[k]) match = true; });
        if (!match) return false;
      }
      if (query) {
        const hay = `${p.name || ""}${p.address || ""}`.toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => (b.overallStars || 0) - (a.overallStars || 0));
}

function weatherBadgesHtml(weather) {
  const w = weather || {};
  const active = Object.keys(WEATHER_LABELS).filter((k) => w[k]);
  if (active.length === 0) {
    return `<span class="oz-muted">天気タグ未設定</span>`;
  }
  return `<div class="oz-badge-row">${active
    .map((k) => `<span class="oz-badge ${k}">${WEATHER_LABELS[k]}</span>`)
    .join("")}</div>`;
}

function infoRowHtml(icon, label, value) {
  if (value === undefined || value === null || value === "") return "";
  return `<div class="oz-info-row"><span>${icon}</span><span class="oz-info-value">${escapeHtml(value)}</span></div>`;
}

function starsStaticHtml(value, size) {
  let html = `<span class="oz-stars stars-${size}">`;
  for (let n = 1; n <= 5; n++) {
    html += `<span class="oz-star${n <= (value || 0) ? " filled" : ""}">★</span>`;
  }
  html += `</span>`;
  return html;
}

function cardHtml(place) {
  const t = TYPE_LABELS[place.type] || TYPE_LABELS.pool;
  return `
    <div class="oz-card" data-id="${place.id}">
      <div class="oz-card-top">
        <span class="oz-type-pill ${place.type}">${t.icon} ${t.label}</span>
        ${starsStaticHtml(place.overallStars, "sm")}
      </div>
      <h3 class="oz-card-title">${escapeHtml(place.name) || "名前未設定"}</h3>
      ${place.address ? `<div class="oz-address">📍 <span>${escapeHtml(place.address)}</span></div>` : ""}
      ${weatherBadgesHtml(place.weather)}
      <div class="oz-info-grid">
        ${infoRowHtml("📏", "距離", place.distanceKm ? `${place.distanceKm} km` : "")}
        ${infoRowHtml("⏱", "移動", place.travelTimeMin ? `${place.travelTimeMin} 分` : "")}
        ${infoRowHtml("💴", "高速代", place.highwayToll ? `${place.highwayToll} 円` : "")}
        ${infoRowHtml("🚗", "駐車場", place.parkingCapacity)}
      </div>
      <div class="oz-card-actions">
        <a class="oz-btn oz-btn-ghost" href="${mapsDirectionsUrl(place)}" target="_blank" rel="noopener noreferrer">🧭 道順を見る</a>
        <button type="button" class="oz-btn oz-btn-primary" data-open-id="${place.id}">くわしく見る</button>
      </div>
    </div>
  `;
}

function render() {
  document.getElementById("loadingMsg").hidden = loaded;
  const grid = document.getElementById("grid");
  const emptyMsg = document.getElementById("emptyMsg");

  if (!loaded) {
    grid.innerHTML = "";
    emptyMsg.hidden = true;
    return;
  }

  const list = filteredPlaces();
  const hasFilters = typeFilter !== "all" || weatherFilter.size > 0 || query;

  if (list.length === 0) {
    grid.innerHTML = "";
    emptyMsg.hidden = false;
    if (places.length === 0) {
      emptyMsg.innerHTML = `<p>まだおでかけスポットが登録されていません。</p><p>「＋ 追加する」からお気に入りの場所を登録しましょう。</p>`;
    } else {
      emptyMsg.innerHTML = hasFilters
        ? `<p>条件に合うスポットが見つかりませんでした。</p>`
        : `<p>登録されたスポットがありません。</p>`;
    }
    return;
  }

  emptyMsg.hidden = true;
  grid.innerHTML = list.map(cardHtml).join("");

  grid.querySelectorAll("[data-open-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open-id");
      const place = places.find((p) => p.id === id);
      if (place) openForm(place);
    });
  });
}

/* ---------- フィルターバーの操作 ---------- */

document.getElementById("searchInput").addEventListener("input", (e) => {
  query = e.target.value;
  render();
});

document.getElementById("typeFilterRow").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-type-filter]");
  if (!btn) return;
  typeFilter = btn.getAttribute("data-type-filter");
  document.querySelectorAll("#typeFilterRow [data-type-filter]").forEach((b) => {
    b.classList.toggle("is-active", b === btn);
  });
  render();
});

document.getElementById("weatherFilterRow").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-weather-filter]");
  if (!btn) return;
  const key = btn.getAttribute("data-weather-filter");
  if (weatherFilter.has(key)) {
    weatherFilter.delete(key);
    btn.classList.remove("is-active");
  } else {
    weatherFilter.add(key);
    btn.classList.add("is-active");
  }
  render();
});

/* ---------- フォームの操作 ---------- */

const overlay = document.getElementById("overlay");

function openForm(place) {
  editingId = place ? place.id : null;
  draft = place
    ? {
        name: place.name || "",
        type: place.type || "pool",
        address: place.address || "",
        weather: { sunny: false, rainy: false, cold: false, hot: false, ...(place.weather || {}) },
        distanceKm: place.distanceKm || "",
        travelTimeMin: place.travelTimeMin || "",
        highwayToll: place.highwayToll || "",
        overallStars: place.overallStars || 0,
        changingRoomStars: place.changingRoomStars || 0,
        poolFeatures: place.poolFeatures || [],
        reservationRequired: !!place.reservationRequired,
        timeLimit: place.timeLimit || "",
        price: place.price || "",
        parkingCapacity: place.parkingCapacity || "",
        parkingEaseStars: place.parkingEaseStars || 0,
        notes: place.notes || "",
      }
    : emptyDraft();

  document.getElementById("formTitle").textContent = place ? "スポットを編集" : "おでかけを追加";
  document.getElementById("deleteBtn").hidden = !place;
  document.getElementById("nameError").hidden = true;

  document.getElementById("f-name").value = draft.name;
  document.getElementById("f-address").value = draft.address;
  document.getElementById("f-distance").value = draft.distanceKm;
  document.getElementById("f-time").value = draft.travelTimeMin;
  document.getElementById("f-toll").value = draft.highwayToll;
  document.getElementById("f-timeLimit").value = draft.timeLimit;
  document.getElementById("f-price").value = draft.price;
  document.getElementById("f-parkingCapacity").value = draft.parkingCapacity;
  document.getElementById("f-notes").value = draft.notes;
  document.getElementById("f-reservation").checked = draft.reservationRequired;

  updateTypeUI();
  updateWeatherFormUI();
  updateFeatureUI();
  wireStars();

  overlay.hidden = false;
}

function wireStars() {
  renderStars(document.getElementById("f-overallStars"), draft.overallStars, true, (v) => {
    draft.overallStars = v;
    wireStars();
  });
  renderStars(document.getElementById("f-changingRoomStars"), draft.changingRoomStars, true, (v) => {
    draft.changingRoomStars = v;
    wireStars();
  });
  renderStars(document.getElementById("f-parkingEaseStars"), draft.parkingEaseStars, true, (v) => {
    draft.parkingEaseStars = v;
    wireStars();
  });
}

function updateTypeUI() {
  document.querySelectorAll("#typeSegment [data-type-option]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-type-option") === draft.type);
  });
  document.getElementById("poolSection").classList.toggle("hidden", draft.type !== "pool");
}

function updateWeatherFormUI() {
  document.querySelectorAll("#weatherFormRow [data-weather-option]").forEach((btn) => {
    const key = btn.getAttribute("data-weather-option");
    btn.classList.toggle("is-active", !!draft.weather[key]);
  });
}

function updateFeatureUI() {
  document.querySelectorAll("#featureRow [data-feature]").forEach((btn) => {
    const key = btn.getAttribute("data-feature");
    btn.classList.toggle("is-active", draft.poolFeatures.includes(key));
  });
}

document.getElementById("typeSegment").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-type-option]");
  if (!btn || !draft) return;
  draft.type = btn.getAttribute("data-type-option");
  updateTypeUI();
});

document.getElementById("weatherFormRow").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-weather-option]");
  if (!btn || !draft) return;
  const key = btn.getAttribute("data-weather-option");
  draft.weather[key] = !draft.weather[key];
  updateWeatherFormUI();
});

document.getElementById("featureRow").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-feature]");
  if (!btn || !draft) return;
  const key = btn.getAttribute("data-feature");
  const idx = draft.poolFeatures.indexOf(key);
  if (idx >= 0) draft.poolFeatures.splice(idx, 1);
  else draft.poolFeatures.push(key);
  updateFeatureUI();
});

function closeForm() {
  overlay.hidden = true;
  draft = null;
  editingId = null;
}

document.getElementById("openAddBtn").addEventListener("click", () => openForm(null));
document.getElementById("closeBtnLeft").addEventListener("click", closeForm);
document.getElementById("closeBtnRight").addEventListener("click", closeForm);
document.getElementById("cancelBtn").addEventListener("click", closeForm);

document.getElementById("saveBtn").addEventListener("click", async () => {
  draft.name = document.getElementById("f-name").value.trim();
  if (!draft.name) {
    document.getElementById("nameError").hidden = false;
    return;
  }
  draft.address = document.getElementById("f-address").value.trim();
  draft.distanceKm = document.getElementById("f-distance").value;
  draft.travelTimeMin = document.getElementById("f-time").value;
  draft.highwayToll = document.getElementById("f-toll").value;
  draft.timeLimit = document.getElementById("f-timeLimit").value.trim();
  draft.price = document.getElementById("f-price").value.trim();
  draft.parkingCapacity = document.getElementById("f-parkingCapacity").value.trim();
  draft.notes = document.getElementById("f-notes").value.trim();
  draft.reservationRequired = document.getElementById("f-reservation").checked;

  await saveToFirestore(editingId, draft);
  closeForm();
});

document.getElementById("deleteBtn").addEventListener("click", async () => {
  if (!editingId) return;
  if (!confirm("このスポットを削除しますか？")) return;
  await deleteFromFirestore(editingId);
  closeForm();
});

/* ---------- 初期描画 ---------- */

render();
