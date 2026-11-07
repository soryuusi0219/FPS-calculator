# 検証ガイド

この文書は開発時のコマンドと検証項目の更新先。[起動手順](../README.md#起動)、[内部設計](architecture.md)、[利用仕様と上限](../README.md#入力と計算の上限)はそれぞれの文書を参照する。

## 基本コマンド

Node.js 24以上に切り替えてからnpm ciで依存を導入する。Linux/macOSの専用ランタイムはGit管理外の.local/node/に置く。システムに古いNode.jsがある環境では、必要に応じて次を先に実行する。

```sh
export PATH="$PWD/.local/node/bin:$PATH"
node --version
npm ci
```

通常のコード変更では次を実行する。

```sh
npm run check
npm test
npm run build
```

- checkはTypeScriptの型検査。buildも型検査を行ってからViteでdistを生成する。
- testはtests/直下の*.test.tsを実行する。Nodeのテストランナーを使い、ブラウザ・ネットワークを必要としない。
- 起動・ビルド・テストの入口とランタイム選択は[scripts/run.cjs](../scripts/run.cjs)。Node.js 12でも解析できるCommonJSに保ち、実ツールは24以上で実行する。
- 起動処理を変更した場合は、新旧Node.jsを入口に使い、専用ランタイムの選択・未導入時の案内・dev/check/test/build/previewを確認する。

CIは[ci.yml](../.github/workflows/ci.yml)でnpm ci→npm test→npm run buildを実行する（buildに型検査を含む）。Pages配信の検証は[公開ワークフロー](architecture.md#公開ワークフロー)と[READMEのローカル再現手順](../README.md#github-pagesへの公開)を参照する。

## 自動テストの対応表

| 対象 | テスト | 主な回帰条件 |
| --- | --- | --- |
| 係数体・基本演算 | [calculator.test.ts](../tests/calculator.test.ts) | 厳密値、幾何級数・exp/log、形式的恒等式、前方参照、型/上限とエラー |
| 型付き言語・特殊級数・TeX | [language.test.ts](../tests/language.test.ts) | 平方根/有理数乗/FPS乗、整数引数・組合せ、Catalan/LambertW、ラムダ/map/遅延分岐、乗算省略、長い加算式のTeX |
| Laurent | [laurent.test.ts](../tests/laurent.test.ts) | x/x・1/x、正負の位数の商と負べき、零除算、負の係数抽出、極・内部精度・積分のlog項 |
| 代数系 | [implicit.test.ts](../tests/implicit.test.ts) | 既知関数・閉形式・各解法・残差、初期値と枝、SCC/行順/束縛/グループ間依存、特異性、延長失敗後のキャッシュ |
| 数列・復元 | [sequences.test.ts](../tests/sequences.test.ts) | 一般/線形漸化式、過去参照、推測の未使用検証項、有限精度比較、変換、p-recursiveの作用素と初期境界項 |
| 微積分系 | [differential.test.ts](../tests/differential.test.ts) | ODE/積分再帰・初期jet・高階/混在系、非線形な最高階定数、特異性、必要な行/次数だけの線形系と残差 |
| 総和・総積・次数依存 | [aggregates.test.ts](../tests/aggregates.test.ts) | 空範囲と型、有限化の証明/拒否、捕捉/ネスト、生成範囲、Euler変換、合成/map/ラムダを含む循環、未来/同次数参照 |
| EGF・三角関数・revert循環 | [analytic.test.ts](../tests/analytic.test.ts) | 通常係数と重み、範囲・小標数、関数群の枝/極/恒等式、逆合成の両方向、初期値・定義域検証 |
| コメント | [comments.test.ts](../tests/comments.test.ts) | 型/容量、計算・名前変更との独立性、保存/JSON/URL、行操作/複製/履歴 |
| アプリ・Worker | [app.test.ts](../tests/app.test.ts) | 旧保存形式・保存拒否、移動後の削除/選択、最後の空行、複製とID、コピー、旧/重複応答・中断・時間超過と回復 |
| 履歴 | [history.test.ts](../tests/history.test.ts) | 行/設定/初期値/連立の復元、集約境界・分岐・上限、スナップショット独立性、session参照、再計算要否、IME保護 |
| JSON・共有・編集支援 | [notebook-tools.test.ts](../tests/notebook-tools.test.ts) | 往復/旧形式/Unicode/不正データ/容量、ASTの範囲、名前変更の束縛・捕獲・部分反映拒否、補完/括弧/診断 |
| サンプル | [templates.test.ts](../tests/templates.test.ts) | 全件の係数/残差/TeX、N=1・パラメータ境界・基底/mod、JSON/URL/undo、カタログ独立性、頂点数4以下のグラフ/木/森/写像グラフの全列挙 |

サンプルの固定期待値は[template-expectations.ts](../tests/fixtures/template-expectations.ts)。登録数の正は[READMEの一覧](../README.md#サンプル集)と実カタログを照合し、テスト件数を文書へ固定しない。

計算の変更では、既知の先頭係数だけでなく、最後に表示する係数、N=1、必要な追加精度、小さい素数の分母0、初期値・枝・未対応入力も選ぶ。特にexp(X)/X、X^(-2)*exp(X)、平方根・隣接係数map、循環系の外側の微分/抽出で末尾を失わないことを確認する。比較・推測の結果を無限級数の証明と表示しない。

高速化では素朴版とランダムな小入力を照合し、演算数・有理数のビット長・実時間を測る。リファクタリングでは必要に応じて変更前後のCalculationResult全体（型・係数・TeX・診断・解析・解法情報）やJSON/共有URLを比較する。

## ブラウザ確認

UIを変更した場合は、利用可能な実ブラウザで該当項目を確認する。ブラウザE2EのCI化は未実装であり、下表は手動確認の基準。利用できない環境では未確認項目を報告する。

| 変更箇所 | 確認する操作と状態 |
| --- | --- |
| 共通 | 計算Workerの結果・旧応答の拒否・エラーからの回復、係数体/基底、保存と再読み込み、320px以上の画面 |
| 数式入力・構文支援 | 連続入力/貼り付け、フォーカス/カーソル/選択/横スクロール、括弧・補完のEnter/Tab/クリック確定と履歴、エラー位置、IME確定/取消と変換中のEnter保護 |
| 初期値・連立欄 | scalar/seqの初期jet、変数/方程式/解法の編集と結果参照、複数行の補完/位置診断、IME、保存・undo/redo |
| コメント | 改行・IME、開閉維持、選択と縦スクロール復元、複製/移動・保存/共有・履歴、編集だけではWorkerを再起動しないこと |
| 行・幅 | 追加/複製/削除、マウス/タッチ/キーでの並べ替えと自動スクロール、Escape/pointercancel、移動後のID・選択結果・削除位置、ドラッグで文字選択を妨げないこと、幅の保存 |
| 独立スクロール | PCと上下分割画面で入力/結果をホイール・タッチ・キーで別々に動かす。端で他方へ連鎖しないこと、係数表の末尾/フッタ・下の入力へ到達できること、入力がパネル外へ出たら補完が閉じること、回転・低い画面・横のはみ出し |
| 履歴 | ボタン・Ctrl/Meta+Z・Shift+Z・Ctrl+Y、連続編集の集約と区切り、IME中、計算中/エラー後、フォーカス/選択/スクロール、保存復元 |
| ノート入出力・名前変更 | ファイル入出力、読み込み/名前変更のundo、読み込み中の世代チェック、不正データで部分変更しないこと、共有リンクの復元 |
| サンプル | 分類/複数語・式/コメント検索、件数・一覧スクロール・選択フォーカス、説明付きプレビュー、設定/連立/コメントを含む読み込みとundo、元カタログの独立性 |
| 数列解析・結果表示 | 解析レポート、有理式追加、コピー/TeX、係数表/級数/OGF/EGF、Laurentの負次数と最低次数付きコピー |

## 文書だけの変更

ローカルリンク・見出し・参照ファイルの存在、実装済み/未実装の区別、構文例・共有上限・カタログ件数をソースと照合する。実装ファイルを変更していなければ、UI操作を再検証する必要はない。外部資料の内容を確認していない場合、リンク先まで検証済みとは報告しない。
