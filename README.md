# Plankton

A browser-only visual synthesizer. Write Crystal, compile it to WebAssembly,
and animate textures with WebGL 2. Simple is best: a minimal interface,
no backend, accounts, or API keys.

```crystal
frequency = param("frequency", 8.0, min: 1.0, max: 40.0)
osc(frequency, 0.045, 1.4).modulate(noise(3), 0.2).kaleid(5).out
```

## Run

Use the latest Node.js release (>= 22) and Make. Native Crystal is not needed
to run the app.

```sh
make
```

Open `http://127.0.0.1:4173/`; Ctrl+C stops the server. First startup installs
dependencies and builds the app, including its compiler assets. Use
`PORT=4180 make` to change the port, or `make help` for available commands.

Without Make:

```sh
npm ci --ignore-scripts
npm run build
npm run dev
```

`npm run build:cdn` uses the same pinned libgc fork commit from jsDelivr instead of bundling it.
Generated Wasm programs use experimental Boehm garbage collection in both modes.
For GitHub Pages, select **GitHub Actions** in the repository's Pages settings
and push to `main`; the workflow tests, builds, and publishes the site.

## Use

- Write code and press **Run** (Ctrl/Cmd+Enter). Examples initially show a
  **Preset preview**; successful compilation shows **Compiled Crystal**.
- Combine 36 texture operations, four output buffers, feedback, live parameters,
  time and mouse signals. **Inputs** adds images, videos, cameras and microphone
  analysis; transport controls provide speed, seek, frame stepping and BPM.
- Save/open `.cr` files, capture PNGs, export JSON/GLSL, or share code by URL.
  Drafts are saved locally. Shared code and recovered drafts never run automatically.
  The interface supports nine languages.

See the [DSL reference](docs/DSL.md) for operations, media inputs and limits,
and [Architecture](docs/ARCHITECTURE.md) for the compiler and renderer design.

## Development

`make test` runs syntax, generated-code and JavaScript checks. Use `make help`
for Wasm, browser and native Crystal test commands.
Operation signatures live in `schema/operations.json`; run `npm run generate`
after changing them. `npm run presets` regenerates example sources and graphs.

## License

Plankton is [MIT-licensed](LICENSE). Its DSL is inspired by
[Hydra](https://hydra.ojack.xyz/), by Olivia Jack and contributors; this independent
renderer does not bundle Hydra or p5.js code and is not fully compatible with Hydra.

The compiler package is the GC-enabled fork of [`@live-codes/crystal-wasm` 0.4.0](https://github.com/kojix2/browser-crystal/tree/31842b98e395a818a9351b370f41c5f26f4861f5),
pinned to commit `31842b9` from its `libgc` branch. `package-lock.json` verifies the
release archive, and `package.json` records the source revision used by CDN builds.
It is MIT-licensed; its bundled toolchain has separate licenses. Builds preserve the
complete package in `dist/vendor/crystal/`. Retain its `LICENSE`,
`THIRD-PARTY-NOTICES.md` and bundled license files when distributing the site.
The CDN build uses the same source commit and assets.
The compiler adds BDWGC and Binaryen assets and their license notices.
The fork retains an existing limitation for exceptions propagating through nested
`ensure` blocks; see its `docs/GC.md`. Playwright (Apache-2.0) is used only for tests.
