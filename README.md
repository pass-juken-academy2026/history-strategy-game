# 歴史戦略 — 分岐する年代記

歴史の分岐をテーマにした、ブラウザ向けターン制ストラテジーゲームです。

## 現在の機能
- 妨害派と史実派の2陣営
- CPU対戦（初級・標準・上級）と同じ端末での2人対戦
- 6地域のマップ、地域支配、兵力、資金、食料、開発レベル
- 兵力増強、地域開発、外交交渉、歴史工作、史実保護、地域への攻勢
- ターン進行、年代記イベント、歴史点、勝利判定、行動ログ
- スマートフォン向けレイアウト
- 端末内の自動セーブと保存データからの再開
- PWA manifest、Service Worker、バージョン確認と更新案内
- Node.jsによる構文・スモークテスト
- テスト成功後にGitHub Pagesへ公開するGitHub Actionsワークフロー
- CapacitorでAndroidプロジェクトを生成し、AAB候補を作るワークフロー

## ブラウザで起動
`index.html` をブラウザで開いて遊べます。PWAのインストールやService WorkerはHTTPSで配信した場合に利用できます。

## テスト
Node.js 22以降を用意し、次を実行します。

```sh
npm run check
npm test
```

## Androidビルド候補
Node.js、Java 21、Android SDKを用意し、次を実行します。

```sh
npm install
npm run android:init
cd android
./gradlew bundleRelease
```

この成果物は公開前の候補です。Google Playへ提出するには、実機テスト、正式な署名済みAAB、プライバシーポリシーの公開、Play Consoleの各申告・審査が別途必要です。リポジトリのGitHub Actionsワークフローは、現状では**署名していないAAB候補**を作成します。

## 未実装
- インターネット越しのオンライン対戦、認証、マッチング、リアルタイム同期
- ランキング、ルーム管理、クラウドセーブ、対戦履歴
- サーバー側の不正対策や切断復帰
- 自動生成されたゲーム内容の安全な検証・承認・公開の完全な仕組み
- 100個の自動化案すべての完成実装

## Google Play公開準備
- [公開チェックリスト](RELEASE_CHECKLIST.md)
- [プライバシーポリシー草案](PRIVACY.md)（公開前に内容と問い合わせ先を確認する必要があります）
- [自動化100案ロードマップ](ROADMAP_100.md)

オンライン機能や外部通知は、対応するサーバー・サービス・認証情報が必要です。GitHubにコードを追加したことだけでは、これらの機能が稼働していることにはなりません。


## ウェブ公開の確認

- [GitHub Actions の実行履歴](https://github.com/pass-juken-academy2026/history-strategy-game/actions)で、最新の「Test and deploy web game」の `test` と `deploy` が両方成功していることを確認します。
- [GitHub Pages の設定](https://github.com/pass-juken-academy2026/history-strategy-game/settings/pages)に表示される「Visit site」から公開URLを開きます。公開URLは、実際にPagesが有効化されデプロイが成功するまでは公開済みと扱いません。
- 公開後はスマートフォンとPCでゲーム開始、CPU難易度選択、ターン進行、セーブ・再開、更新後の表示を確認します。
