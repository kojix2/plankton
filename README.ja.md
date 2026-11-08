# hydra / crystal

**Crystalで映像を書く、ブラウザ完結のビジュアル・シンセサイザー。**
Hydra型のメソッドチェーンを使い、Crystal → WebAssembly → 映像グラフ →
WebGL 2という経路で動作します。GitHub Pagesだけで配信する設計です。

[English](README.md) · [DSL仕様](docs/DSL.md) · [構造](docs/ARCHITECTURE.md) · [検証状況](docs/VALIDATION.md)

```crystal
frequency = param("frequency", 8.0, min: 1.0, max: 40.0, step: 0.1)

osc(frequency, 0.045, 1.4)
  .modulate(noise(2.8, 0.12), 0.22)
  .rotate(0.0, 0.04)
  .kaleid(5)
  .color(0.8, 0.65, 1.3)
  .out
```

`frequency`は画面上のスライダーになります。`time`、`mouse.x`、`mouse.y`や
スライダーの値はGPUのuniformとして更新されるため、映像を変えるたびに
Crystalを再コンパイルする必要はありません。

**検証状況：** JavaScript単体テスト、全サンプルの実Crystal→Wasmコンパイル、
ネイティブCrystal spec、HTTP経由のPlaywrightテストを実行済みです。
Runによる実コンパイル、画素の変化、停止、主要UI操作まで確認しています。
AmebaのCrystalバージョン制約など、詳細は[検証記録](docs/VALIDATION.md)を参照してください。
ソースZIPにコンパイラのWasm本体は含めず、`make`または`npm ci`で取得します。

## 主な機能

左にコード、右に映像の2ペイン。Crystalの色分け、行番号、エラー行、インデント、
Run/Stop、描画の一時停止とリセット、PNG保存、`.cr`保存・読込み、GLSL/JSON出力、
URL共有、ブラウザ内の下書き保存を備えます。

36個のテクスチャ操作に加えて、`src`、`.out`、`o0`〜`o3`を実装しました。
フィードバック、複数出力、動的な時刻・マウス・数式、16個までのスライダーが使えます。
画像・動画・Webカメラ用の4入力、マイク音量・32帯域FFT、速度・シーク・
1フレーム送り・BPMにも対応します。
万華鏡、Voronoi、フィードバック・トンネル、残像など12本の独自サンプルを同梱します。

UIは英語がデフォルト。日本語・簡体字中国語・韓国語・スペイン語・フランス語・
ドイツ語・ブラジルポルトガル語・ロシア語にも切り替えられます。
コンパイラ診断とAPIの技術説明は英語のままです。

**Hydraの完全互換移植ではありません。** Hydraの構成思想とAPIを参考にした
独立実装であり、Hydra/p5.js本体のコードは組み込んでいません。
`noise`や色変換、座標変換、フィードバック順序は本実装の仕様です。

## 起動

開発・CIの推奨はNode.js 24です。

Node.js（22以上、24推奨）とMakeがあれば、ダウンロードしたフォルダで次を実行するだけです。

```sh
make
```

初回は固定バージョンの依存パッケージを取得し、コンパイラ込みでビルドして、
`http://127.0.0.1:4173/`でサーバーを起動します。終了はCtrl+Cです。
2回目以降はインストール済みの依存を再利用し、変更をビルドして起動します。
初回セットアップにはnpmレジストリへのネット接続が必要です。
通常の起動にネイティブのCrystalは不要です。

ポートを変える場合は`PORT=4180 make`、コマンド一覧は`make help`を実行します。
`make test`でJavaScriptの検査・単体テスト、`make test-wasm`で実コンパイラの検証、
`make test-browser`でChromeの描画・コンパイル検証を実行できます。
Chromeの場所が自動検出されない場合は`CHROME_BIN`を指定してください。

Playwrightで操作・実コンパイルを検証する場合は、次を実行します。

```sh
make setup-browser    # 初回のみChromiumを取得
make test-playwright # ビルドしてブラウザ試験を実行
```

既存のChrome/Chromiumを使う場合は、`CHROME_BIN`に実行ファイルのパスを指定すると
ブラウザの取得は不要です。試験用サーバーは`127.0.0.1:4187/repository/`で起動し、
試験後に自動終了します。スクリーンショットと失敗時のトレースは`test-results/`へ保存します。
描画試験にはソフトウェアWebGLを使用します。

Makeを使わない場合は、同じ手順を直接実行できます。

```sh
npm ci --ignore-scripts
npm run build
npm run dev
```

`http://127.0.0.1:4173/`を開きます。`file://`では動きません。
初回Runでコンパイラを読み込みます。通常ビルドはコンパイラと依存アセットを
`dist/vendor/crystal/`にコピーするため、配信後にCDNへ依存しません。

同梱の静的サイト版や、明示的にCDNを使う軽量ビルドでは次を使います。

```sh
npm run build:cdn
npm run dev
```

この場合、RunにはjsDelivrへの接続が必要です。画面下に「CDN assets」と表示します。
コンパイルが失敗した際にサンプルへ自動置換するような代替実行は行いません。

## プレビューとコンパイルの区別

サンプル選択直後は、あらかじめ用意したJSONグラフを描画し「Preset preview」と
表示します。これはコンパイル成功の表示ではありません。
Runで本物のCrystalコンパイラを実行し、生成したWasmを実行したときにだけ
「Compiled Crystal」に変わります。コードが変われば表示は未反映状態になります。

共有URLのコードと復元された下書きは**自動実行しません**。RunはCtrl/Cmd+Enter。
文法・型エラー時にも直前の映像を維持し、StopはコンパイラWorkerを終了します。

## 映像・音声入力と時間制御

画面上部の「入力」でスロット`s0`〜`s3`を選び、画像・動画を読み込むか、
Webカメラを有効にします。マイクも同じ画面で個別に有効化できます。

```crystal
src(s0)
  .kaleid(3 + audio.fft(8) * 8)
  .brightness(audio.level * 0.5)
  .rotate(beat * 0.08)
  .out
```

`audio.fft(0)`〜`audio.fft(31)`は低音から高音の32対数帯域、`audio.level`はRMS音量です。
値は0〜1で、入力を入れ替えたり音量が変わったりしても再コンパイルは不要です。
入力なしのスロットは黒、マイク無効時の音声値は0です。「入力コードを書く」などで
コード例をエディタに入れ、「実行」でコンパイルできます。

映像の下に速度（0〜4倍）・秒数への移動・1フレーム送り・BPMがあります。
`beat`は`time * BPM / 60`、`delta`はその描画で進んだ秒数です。
動画ファイルも一時停止・再生・速度・シークに追従します。動画の音声は出力しません。
シークはフィードバックを消去し、1フレーム送りは維持します。逆再生は未対応です。
詳しくは[DSL仕様](docs/DSL.md)を参照してください。

カメラ・マイクは有効化ボタンを押した場合だけ権限を要求し、「停止」で解放します。
HTTPSまたはlocalhostで使用してください。共有URLや下書きにファイル・デバイスは含めず、
再読み込みや共有リンクから自動的にカメラ・マイクを開始することもありません。

## GitHub Pages

1. このフォルダの内容をリポジトリへ配置します。`dist`、`node_modules`、`lib`、
   `bin`はコミットしません。二つのlockfileはコミットします。
2. Settings → Pages → Build and deploymentで **GitHub Actions**を選びます。
3. `main`へpushします。

公開workflowは共通CIを呼び、Ameba、Crystal spec、JavaScript、実Wasmコンパイル、
実ブラウザ試験がすべて通った静的成果物だけを公開します。
`/リポジトリ名/`配下にそのまま設置できます。サーバー処理・特別なHTTPヘッダー・
APIキーは不要です。GitHubへの実際のアップロードや公開操作は行っていません。

## 開発時の検証

```sh
npm run check
npm test
npm run test:wasm
npm run build
npm run test:browser

shards install --frozen
crystal tool format --check src spec examples
bin/ameba
crystal spec --error-trace
```

Amebaはブラウザへ搭載せず、開発時とGitHub Actionsで実行します。
エディタのRun時にはCrystalコンパイラ自身が文法・型を検査します。
`src/hydra/`がDSL、`web/js/shader.js`がGLSL生成、`renderer.js`がGPU描画です。
詳細は英語版READMEと`docs/`を参照してください。

音声の合成・出力、任意GLSL・3D・Processingの`draw`ループは未実装です。
また、上流Wasm環境のGC制約がなくなったわけではありません。毎フレームCrystalの
オブジェクトを作らない設計ですが、巨大な処理やメモリ確保を無制限に許すものでは
ありません。初版の範囲と制限を明示した実装です。

`package-lock.json`はコンパイラとPlaywrightのバージョン・取得先・integrity値を固定しています。
`make setup`または`npm ci --ignore-scripts`で同じ依存関係を取得できます。
