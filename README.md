# おでかけずかん セットアップ手順

このアプリは以下の2つを組み合わせて動きます。

- **GitHub Pages** … アプリ本体（HTML/CSS/JS）を公開する場所（無料）
- **Firebase Firestore** … データを保存する場所（無料枠内）。これがあるので、スマホで登録した内容がPCにも反映されます。

順番に進めれば完了します。だいたい15〜20分くらいです。

---

## 1. Firebaseプロジェクトを作る

1. https://console.firebase.google.com/ を開き、Googleアカウントでログイン
2. 「プロジェクトを作成」→ 好きな名前を入力（例：`odekake-zukan`）→ そのまま進めて作成完了
3. 左メニューの「構築」→「Firestore Database」を開く
4. 「データベースの作成」→ ロケーションは `asia-northeast1`（東京）を選択
5. セキュリティルールは、最初は **「テストモードで開始」** を選んでOK（あとで手順4で正式なルールに差し替えます）

## 2. Webアプリとして登録し、設定値を取得する

1. Firebaseの「プロジェクトの概要」画面で `</>`（Webアプリを追加）のアイコンをクリック
2. アプリのニックネームを適当に入力（例：`odekake-web`）→ 登録
3. 表示される `firebaseConfig = { apiKey: ..., authDomain: ..., ... }` の中身をコピー
4. このフォルダの **`firebase-config.js`** を開き、コピーした値ですべて書き換える

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "odekake-zukan-xxxx.firebaseapp.com",
  projectId: "odekake-zukan-xxxx",
  storageBucket: "odekake-zukan-xxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
};
```

## 3. GitHubにアップロードしてPagesを公開する

1. https://github.com で新しいリポジトリを作成（例：`odekake-zukan`）。公開・非公開どちらでもOK
2. このフォルダの中身（`index.html`, `style.css`, `app.js`, `firebase-config.js`）を全部そのリポジトリにアップロード
   - GitHubの画面から「Add file」→「Upload files」でドラッグ＆ドロップするのが簡単です
3. リポジトリの「Settings」→「Pages」を開く
4. 「Branch」を `main`（または `master`）、フォルダを `/ (root)` にして保存
5. 数分待つと、`https://ユーザー名.github.io/odekake-zukan/` のようなURLが発行されます

このURLをスマホのホーム画面に追加すれば、アプリのように開けます（Safari/Chromeの「ホーム画面に追加」機能）。

## 4. セキュリティルールを本番用に直す（大事）

テストモードのルールは30日ほどで自動的に閉じてしまい、それ以降は誰も読み書きできなくなります。以下のルールに差し替えておいてください。

Firestoreの「ルール」タブで、内容を次のように変更して「公開」します。

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /places/{placeId} {
      allow read, write: if true;
    }
  }
}
```

**注意**：これは「URLとFirebaseの接続情報を知っている人なら誰でも読み書きできる」設定です。プールや公園のメモ程度なら大きなリスクはありませんが、他人に見られたくない場合は、Firebase Authentication（匿名認証やメール認証）を追加してアクセス制限することもできます。必要であれば追加の手順をご案内します。

## 5. 動作確認

1. 発行されたURLをスマホとPCそれぞれのブラウザで開く
2. どちらかで1件スポットを登録
3. もう片方の画面を更新（リロード）して、同じデータが表示されればOKです

---

### 困ったときは

- 画面が真っ白 / データが読み込めない → `firebase-config.js` の値が正しくコピーされているか確認
- 「保存に失敗しました」と出る → Firestoreのルールがテストモードのまま期限切れになっていないか確認（手順4を実施）
- スマホとPCでデータが違う → 両方とも同じURLを開いているか確認
