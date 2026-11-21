# FPS-calculator

競技プログラミング向けの形式冪級数（FPS）計算ノートです。TypeScript + Vite で作成し、計算はブラウザの Web Worker 内で行います。サーバーやAPIキーは不要です。

Desmosのように左側へ式や変数定義を並べ、右側で選択した式の係数を確認できます。厳密な計算に加え、循環定義・連立方程式・数列解析・コメント付きサンプルを利用できます。

## ドキュメントの読み方

| 文書 | 内容・更新先 |
| --- | --- |
| [README](README.md) | 起動・公開手順、基本操作、サンプルファイルの管理、開発向けの案内 |
| [機能リファレンス](docs/reference.md) | 利用可能な全構文・関数・別名・機能の説明、例・定義域・制限 |
| [設計書](docs/architecture.md) | ファイルの責務、計算と精度の設計、保存・履歴・UIの内部契約 |
| [検証ガイド](docs/testing.md) | 開発時のコマンド、変更内容に応じたテスト・ブラウザ確認 |
| [ロードマップ](docs/roadmap.md) | 未実装の機能、優先度・依存関係・完了基準 |
| [AGENTS.md](AGENTS.md) | エージェントの作業ルールと参照先 |

同じ仕様や手順の詳細は上記の更新先に集約し、ほかの文書からリンクします。上限の実装値は[共有上限](src/config/limits.ts)、関数名・別名・引数数は[組み込み関数定義](src/language/builtins.ts)を参照してください。

## 起動

Node.js 24以上とnpmを使用します（`.nvmrc` は24）。

まず `node --version` を確認してください。nvmを利用している場合は `nvm install` → `nvm use` で切り替えられます。

Linux/macOSでNode.jsが古い場合は、次の手順でプロジェクト専用のNode.jsを導入できます。

```sh
bash scripts/setup-node.sh
export PATH="$PWD/.local/node/bin:$PATH"
npm ci
npm run dev
```

セットアップはNode.js公式配布のSHA-256を検証し、Git管理外の `.local/node/` に配置します。システムのNode.jsやシェル設定は変更しません。導入後は、元のNode.jsが古いシェルからでも `npm run dev` などのプロジェクトコマンドが `.local/node/` を自動的に選びます。`npm ci` / `npm install` 自体には上記のPATH設定またはバージョン管理ツールによる切り替えが必要です。

Node.js 24以上が既に利用できる場合は、通常どおり起動できます。

```sh
npm ci
npm run dev
```

表示されたローカルURL（通常 `http://127.0.0.1:5173`）をブラウザで開きます。`index.html` の直接オープンではなく開発サーバーを使用してください。

開発時の型検査・テスト・ビルドは[検証ガイド](docs/testing.md#基本コマンド)を参照してください。

Vite内で `SyntaxError: Unexpected token '.'` が出る場合は、古いNode.jsでViteを起動している可能性があります。`.nvmrc` と `engines` は自動ではNode.jsを切り替えません。上記のセットアップまたはnvmによる切り替えを実施してください。起動スクリプトもバージョンを確認し、対応するNode.jsが見つからなければセットアップ方法を表示して停止します。

`dist/` を静的ホスティングすればブラウザだけで動作します。サブパスへの配置では Vite の `base` を配信先に合わせて設定してください。KaTeXと数式用フォントも同梱し、実行時のCDN・外部APIへのアクセスはありません。

## GitHub Pagesへの公開

初回はリポジトリの [Settings → Pages](https://github.com/soryuusi0219/FPS-calculator/settings/pages) で、**Build and deployment → Source** を **GitHub Actions** に設定してください。

`.github/workflows/deploy.yml` を含む変更を `main` にマージすると、テストと型検査・ビルドに成功した後、`dist/` をGitHub Pagesへ公開します。公開先は https://soryuusi0219.github.io/FPS-calculator/ です。以降は `main` の更新で自動公開し、Actionsの **Deploy to GitHub Pages → Run workflow** から `main` を選んで再公開もできます。手動実行でも `main` 以外のブランチは公開しません。

公開ワークフローのアーティファクトと権限の設計は[設計書](docs/architecture.md#公開ワークフロー)を参照してください。

旧ワークフローで `Multiple artifacts named "github-pages"` が出た実行を再実行しても、新しい設定には切り替わりません。現在のワークフロー設定をmainへ反映した後、**Run workflow**でmainから新しい実行を開始してください。同名アーティファクトの重複が原因であり、`punycode`の非推奨警告とは別のエラーです。

ビルド時に `--base=/FPS-calculator/` を渡し、JavaScript・Worker・CSS・KaTeXフォントを配信先のサブパスから読み込みます。リポジトリ名や公開先を変更する場合は、この指定も変更してください。ローカルでは次のコマンドで同じ構成を確認できます。

```sh
npm run build -- --base=/FPS-calculator/
npm run preview -- --base=/FPS-calculator/
```

ブラウザで `http://127.0.0.1:4173/FPS-calculator/` を開いてください。`dist/` のコミットや手動アップロードは不要です。公開処理の結果とURLはActionsの実行結果で確認できます。

## 使い方

1行に1つの式、または`F = 1/(1-X)`のような定義を入力し、行を選ぶと係数を表示します。Enterで編集中の行の直後に空行を追加します。

- 係数体は有理数または素数mod、表示はOGF/EGF・係数表/級数を選べます。
- 入力と結果は独立して縦スクロールし、長い式は行内で横スクロールできます。
- 式の複製・並べ替え・コメント、undo/redo、JSON保存/読み込み・URL共有・名前変更を利用できます。
- サンプル集には、基本数列・組合せ論・木・グラフ・連立系の説明付きノートがあります。

ヘッダーの **「ドキュメント」** から、[機能リファレンス](docs/reference.md)を計算ノート上のダイアログで開けます。目次で移動し、閉じるボタンまたはEscapeでノートへ戻ります。本文のMarkdownも保存できます。閲覧中も式・履歴・計算設定は保持します。

全構文・関数の引数と条件・使用例、キーボード操作、保存と共有、制限とエラーの詳細は、このリファレンスを更新先とします。

## 現在の範囲

単変数のスカラー・FPS・Laurent級数を、有理数または素数modで厳密に計算します。上記の式言語・正則な代数/微積分系・次数順に決まる循環定義、保存/共有/編集支援を実装済みです。

一般の関数方程式・非因果的な循環・特異系全般・Laurent/Puiseux級数の方程式解・多変数には未対応です。NTT等による高速化、履歴の永続化、自動同期、ブラウザE2EのCI化も未実装です。追加機能の優先度と完了基準は[ロードマップ](docs/roadmap.md)にまとめています。数列の推測や指定精度までの一致は、数学的な証明とは区別します。

## サンプル集

登録内容・分類件数・数え上げの規約・読み込み方法は[機能リファレンスのサンプル集](docs/reference.md#サンプル集)を参照してください。追加時の[採用基準](docs/architecture.md#サンプル集の内容と採用基準)は設計書にまとめています。

### サンプルの管理

本文は保存ボタンで出力するJSONと同じ`{format:"fps-calculator", version:1, data, view}`形式で、サンプルごとに管理します。例えば[samples/tree/labeled-trees.json](samples/tree/labeled-trees.json)、[samples/graphs/dag.json](samples/graphs/dag.json)です。コメント・初期値・連立設定・表示基底も含み、そのまま「JSON読み込み」で開けます。

分類と一覧のメタデータは[samples/index.json](samples/index.json)に集約します。`categories`は分類のIDと表示名、`samples`は各サンプルの`id`・`title`・`description`・`category`・`file`（samplesからの相対パス）を持ちます。配列の順序が表示順です。

追加・編集するときは、アプリでノートを作ってJSON保存し、対応するディレクトリへ配置してください。新規追加時はindex.jsonへメタデータを登録し、最初に表示したい級数を本文の先頭行へ置きます。TypeScriptへの個別importやノート生成コードの追加は不要です。参照切れ・未登録JSON・ID/ファイルの重複・不正なノートは共通検証で拒否します。独立期待値の追加などの[採用基準](docs/architecture.md#サンプル集の内容と採用基準)も維持してください。

## 入力と計算の上限

数値上限は[機能リファレンスの上限一覧](docs/reference.md#上限)、実装値は[config/limits.ts](src/config/limits.ts)、[combinatorics.ts](src/core/combinatorics.ts)、[calculation-client.ts](src/app/calculation-client.ts)等を参照してください。

## 開発向けの案内

[設計書の構成と責務](docs/architecture.md#構成と責務)にファイルの対応、精度伝播、循環系、保存・履歴・UIの設計をまとめています。変更時に実行する検証は[検証ガイド](docs/testing.md)、今後の拡張は[ロードマップ](docs/roadmap.md)を参照してください。
