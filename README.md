# hydra / crystal

**A browser-only visual synthesizer. Write real Crystal, compile it to WebAssembly,
and compose a live WebGL 2 signal graph.**

[日本語](README.ja.md) · [DSL reference](docs/DSL.md) · [Architecture](docs/ARCHITECTURE.md) · [Validation status](docs/VALIDATION.md)

```crystal
frequency = param("frequency", 8.0, min: 1.0, max: 40.0, step: 0.1)

osc(frequency, 0.045, 1.4)
  .modulate(noise(2.8, 0.12), 0.22)
  .rotate(0.0, 0.04)
  .kaleid(5)
  .color(0.8, 0.65, 1.3)
  .out
```

The editor is Crystal, **not a regex-based Crystal-to-JavaScript translator**.
`@live-codes/crystal-wasm` compiles and links the code in a Worker; the resulting
Wasm program constructs a checked graph. JavaScript generates GLSL from the
validated graph, and WebGL animates it without rerunning Crystal each frame.

**Verification:** JavaScript unit tests, actual Crystal/Wasm compilation of all
examples, native Crystal specs, and Playwright tests over HTTP have passed.
Browser tests exercise real compilation, GPU pixels, cancellation, and UI actions.
See [the exact record and remaining limits](docs/VALIDATION.md), including the
native Ameba version constraint. Compiler binaries are not in the source ZIP.

## Features

- Split editor/preview, Crystal highlighting, line numbers, indentation, error markers.
- 36 Hydra-inspired texture operations, plus `src`, `out`, and four outputs `o0…o3`.
- Feedback with double-buffered textures; deterministic previous-frame sampling.
- Live slider parameters, `time`, `frame`, normalized mouse coordinates and math expressions.
- Four image/video/camera input slots; microphone RMS and 32-band FFT expressions.
- Speed, seconds seek, frame stepping, and BPM-driven `beat` expressions.
- 12 original examples with immediately available, explicitly labeled **preset previews**.
- Run / cancel / pause / reset, resolution selection, PNG capture, source save/open.
- Compressed URL-fragment sharing; shared code **never runs automatically**.
- JSON graph / GLSL export, an in-app reference, local draft recovery.
- English (default), Japanese, Simplified Chinese, Korean, Spanish, French,
  German, Brazilian Portuguese, Russian. All nine UI dictionaries are complete.
- Static GitHub Pages deployment. No backend, account, API key or analytics.

This is an **independent Hydra-inspired renderer**, not a drop-in Hydra port.
Noise, color math, geometry and feedback semantics intentionally differ; see the
reference before translating an existing Hydra patch. The project does not bundle
Hydra or p5.js implementation code. [Attribution and licenses](THIRD_PARTY.md).

## Run locally

Use **Node.js 24** for development/CI (Node 22 can run the static build tools).
Native Crystal is needed only for native specs/lint, not for ordinary app use.

With Node.js and Make installed, start from a downloaded source directory with:

```sh
make
```

This installs the pinned npm dependencies on first use, builds the app with its
compiler assets, and starts `http://127.0.0.1:4173/`. Stop it with Ctrl+C.
Subsequent runs reuse installed dependencies and rebuild local changes.
Use `PORT=4180 make` to change the port, and `make help` to list the build and
test commands. Native Crystal is not required for this startup path.
The first setup requires network access to the npm registry.

Without Make, run the same steps directly:

```sh
npm ci --ignore-scripts
npm run build
npm run dev
```

Open `http://127.0.0.1:4173/`. Use HTTP/HTTPS, **not** `file://`.
The normal build copies the pinned compiler package and its assets into `dist/`;
compiler code and Wasm files then load from the **same origin** as the page.
The first Run loads the upstream toolchain (roughly 23 MB compressed in the
inspected upstream release). Loading/compiling/linking/running are shown separately.
Stop terminates the compiler Worker, including an infinite Crystal loop.

For an explicitly CDN-backed build, without copying the compiler into `dist/`:

```sh
npm run build:cdn
npm run dev
```

This variant requires jsDelivr access on first Run. It pins the same version and
labels itself **CDN assets** in the footer. It is not the deployment used by CI.
It never silently substitutes sample graphs when compilation is unavailable.

## GitHub Pages

1. Create a repository and commit this directory, including `package-lock.json`
   and `shard.lock`. Keep `dist/`, `node_modules/`, `lib/` and `bin/` out of Git.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. Push to `main`, or run **Publish GitHub Pages** manually on `main`.

`pages.yml` calls the reusable `ci.yml`. Native format/Ameba/spec checks,
JavaScript tests, actual Crystal/Wasm compilation of every example, WebGL tests,
and a browser compilation must all pass before the checked static artifact is
published. Only the final deploy job gets `pages: write` / `id-token: write`.
Project sites such as `/my-repository/` use relative URLs; no repository-name
replacement is necessary. No custom COOP/COEP headers or service worker is needed.

## Editing

**Run:** Ctrl/Cmd+Enter. **Save `.cr`:** Ctrl/Cmd+S. Tab/Shift+Tab indent;
Ctrl/Cmd+/ toggles comments. Sliders do not recompile. Code changes take effect
only after Run succeeds; an invalid edit leaves the last working visual intact.

Choosing an example loads its source and a bundled expected graph; the badge says
**Preset preview**, not **Compiled Crystal**. The CI Wasm suite compares each
expected graph with output from the real compiler. Changing source marks the view
as stale until it is compiled. Reloading recovers the local draft but does not run
it automatically. Clear browser site storage to remove drafts.

## Media, sound and time

Open **Inputs**, select `s0`…`s3`, then load a local image/video or enable a camera.
Enable the microphone separately to drive the graph with real Web Audio analysis:

```crystal
src(s0)
  .kaleid(3 + audio.fft(8) * 8)
  .brightness(audio.level * 0.5)
  .rotate(beat * 0.08)
  .out
```

`audio.fft(0…31)` gives 32 logarithmic frequency bands and `audio.level` gives RMS
volume, all normalized to 0…1. File/camera textures and audio uniforms update
without recompiling. Empty slots are black; disabled microphone values are zero.
The Inputs dialog can write a starter sketch; press Run to compile it.

Speed (0×…4×), seconds seek, +1 frame, and BPM controls sit below the preview.
Video files follow pause/resume, playback speed and seeking; their audio is muted.
`beat` is `time * BPM / 60`, and `delta` is the current scaled frame duration.
Seeking clears feedback; frame stepping preserves it. Reverse playback is not
implemented. See [the media and clock semantics](docs/DSL.md) for details.

Only explicit UI actions request camera/microphone permissions; HTTPS or localhost
is required. Stop releases device tracks. Files and device access are not restored
or included in share URLs. Reloading and opening a share never enable a device.

## Checks

```sh
npm run check                   # JS syntax, JSON and generated API consistency
npm test                        # unit / protocol / sharing / translation / worker tests
npm run test:wasm               # actual compiler; requires installed package
npm run build
npm run test:browser            # real Chrome, WebGL and actual browser compilation
make setup-browser              # install Playwright Chromium once
make test-playwright            # build; test real compilation and UI over HTTP

shards install --frozen
crystal tool format --check src spec examples
bin/ameba
crystal spec --error-trace
```

Set `CHROME_BIN` when Chrome is not at a usual Linux path. `test:browser` normally
requires the same-origin build; `--skip-compiler` skips **only** the final real
browser compilation, useful for renderer debugging but not a release check.
The optional offline UI harness in `test/offline_browser.py` serves in-memory
fixtures into a blank Chromium page. It does not test HTTP, CSP, module fetching
or the compiler; see its header and validation report.

`make test-playwright` starts its own HTTP server at
`http://127.0.0.1:4187/repository/` and shuts it down after the tests. It covers
the 62 existing WebGL/UI checks plus Run, live sliders, invalid code, infinite-loop
cancellation, shared links/drafts, Japanese UI, PNG capture, and mobile layout.
It also tests all four media inputs, real video decoding and transport, camera
track cleanup, microphone FFT/RMS/gain using generated sound, and device permission
failure/cancellation. Device tests use fake capture devices, not physical hardware.
Screenshots and failure traces go to `test-results/`. To use an existing Chrome
or Chromium instead of downloading Playwright's browser, set `CHROME_BIN` to its
executable path. These browser tests use software WebGL rendering.

The operation signatures/defaults live in `schema/operations.json`.
Run `npm run generate` after changing them; implement corresponding GLSL in
`web/js/shader.js`. `npm run presets` deliberately rewrites the bundled sample
recipes and expected graphs. Wasm tests must still match them.

## Limits

The browser toolchain is not the full native Crystal environment. No native C
shards, arbitrary filesystem/network/process access, audio synthesis/output, user
GLSL injection, 3D scene API, or Processing `setup`/`draw` loop is provided.
This version builds a graph once; it does not preserve arbitrary Crystal objects
across recompiles. Native libraries added to the DSL must first support Wasm/WASI.
The upstream target has no general-purpose GC: one-shot graph execution avoids
per-frame Crystal allocations but does **not** make arbitrary memory-heavy code
safe. Worker cancellation is not a hard process-memory quota.

Source: 64 KiB; serialized stdout: 1 MiB; 128 nodes; 16 parameters; scalar depth
32; graph-depth/work caps; 1920×1080 rendering limit. Large shaders can still be
expensive. Use lower resolution on older GPUs. Shader behavior is not guaranteed
identical across GPU drivers. Browser compatibility is subject to the upstream
Wasm toolchain plus WebGL 2 and `DecompressionStream` support.

The included `package-lock.json` pins exact compiler and Playwright versions,
tarball URLs, and registry integrity hashes. Use `npm ci --ignore-scripts` (or
`make setup`) for reproducible dependency installation.
