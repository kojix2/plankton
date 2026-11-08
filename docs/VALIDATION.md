# Validation report — 2026-11-08

## Current verification

The downloaded project was installed, built with the same-origin compiler, and
started with `make`. Actual Crystal compilation and browser interaction have now
been tested over HTTP, including the `/repository/` project-site subpath. These
checks use the real compiler, Worker, module requests, CSP, and WebGL renderer;
they do not substitute an offline fixture or preset for compiled code.

Environment: macOS arm64, Node.js 26.13.0, Crystal 1.22.2, Playwright Test 1.65.0,
and locally installed Chromium (`CHROME_BIN`). Browser rendering uses SwiftShader;
this is not a hardware-GPU compatibility check. Node.js 24 remains the recommended
development version and the version pinned by CI.

The minimal interface revision was checked with `npm run check` and the complete
15-test Playwright suite. Desktop, Japanese mobile, and media-input dialog
screenshots were inspected after removing decorative styling and moving preview
metadata outside the rendered image.

## Results

| Check | Observed result |
| --- | --- |
| `make` | Installed dependencies, built local compiler assets, started `http://127.0.0.1:4173/` |
| `make setup` again | Reused installed dependencies without another `npm ci` |
| `make test` | Syntax/JSON/generated API checks passed; 63 unit tests passed, no skips |
| `make test-wasm` | 16 actual Crystal/Wasm programs passed, plus three negative checks |
| All 12 Crystal examples | Compiled output exactly matched the bundled graph JSON |
| `make test-browser` | 62 real HTTP/WebGL/UI checks passed, then actual browser compilation passed |
| `make test-playwright` | Fifteen end-to-end tests passed, including the existing 62-check browser suite |
| `crystal tool format --check src spec examples` | Passed |
| `crystal spec --error-trace` | 16 examples, no failures or errors |
| `make check-crystal` / Ameba | Blocked: pinned Ameba 1.6.4 does not build with local Crystal 1.22.2 |

Saved command output:

- [JavaScript checks and unit tests](validation/node-tests.log)
- [Real compiler tests](validation/wasm-tests.log)
- [HTTP/WebGL browser tests and compilation](validation/browser-tests.log)
- [Playwright interaction tests](validation/playwright-tests.log)

## Playwright coverage

`test/app.pw.mjs` opens the actual HTTP application. Each main test page fails on
unhandled page errors, failed asset requests, or HTTP error responses. Each test
starts with a fresh browser context. The tests cover:

- Real framebuffer pixels for all 36 operations, scalar expressions, feedback,
  slider uniforms, invalid graph recovery, and all 12 presets.
- The initial example's Run button: Crystal → Wasm → graph → animated GPU output,
  with the **Compiled Crystal** badge.
- A user-authored parameter controlling a solid color: keyboard interaction with
  its slider changes real pixels without recompiling.
- A Crystal type error displaying diagnostics while preserving the last image.
- An infinite Crystal loop reaching execution, Stop terminating its Worker, and
  successful compilation after cancellation.
- Actual shared-link navigation and draft recovery without automatic compilation.
- All nine locales, gallery selection, Japanese UI, resolution changes, PNG
  download, and a 390 px mobile viewport without horizontal overflow.
- Four simultaneous image inputs reaching independent GPU output buffers, upright
  image upload, live replacement, invalid-file recovery, and clearing to black.
- Real WebM decoding; file video pause, playback speed, seek and frame stepping.
- Camera capture via Chromium's fake test device, with actual track cleanup on Stop.
- A generated 440 Hz audio stream through the real Web Audio analyser and shader
  uniforms; FFT band location, RMS, gain, and microphone-track cleanup.
- Recoverable permission denial and a late camera permission grant after Stop.
- Compiled time/beat/delta expressions under speed, BPM, seek, step and reset.
- Reload/shared-link behavior that never reacquires devices automatically.

Screenshots of startup, compiled output, and Japanese mobile layout, plus a PNG
download, are saved under `test-results/`. Failed tests retain a Playwright trace.
Camera/microphone tests use fake devices or generated streams; physical capture
hardware is not accessed or claimed as tested. The regression suite is also
required by `.github/workflows/ci.yml`.

The compiler issue found during this verification was `Number | Signal`, which
Crystal rejects because `Number` is an abstract type that cannot be used in that
union. `Scalar` now uses `Int::Primitive | Float::Primitive | Signal`; both native
specs and the actual browser/Wasm compiler accept it.

## Reproduce

Install Node.js >= 22 (24 recommended) and Make, then run:

```sh
make                        # setup, build, serve; Ctrl+C to stop
make test
make test-wasm
make setup-browser          # one-time Playwright Chromium installation
make test-playwright        # builds and starts/stops its own HTTP server
```

For an existing Chrome/Chromium installation, skip `make setup-browser` and use:

```sh
CHROME_BIN=/path/to/chrome make test-playwright
CHROME_BIN=/path/to/chrome make test-browser
```

The Playwright server uses port 4187 under `/repository/`; the ordinary app uses
port 4173, configurable with `PORT=4180 make`. Initial dependency/browser downloads
require network access. The npm lockfile includes registry integrity metadata.

Native checks additionally require Crystal and shards:

```sh
make check-crystal
```

CI pins Crystal 1.17.0 with Ameba 1.6.4. This machine's Crystal 1.22.2 passes
format/spec checks, but that older Ameba fails to build because
`Crystal::Lexer#next_string_array_token` is unavailable. Consequently native lint
has not passed here, and a CI run on its pinned compiler is still required.
The browser application does not require native Crystal or Ameba.

## Remaining limits and historical evidence

GitHub Actions, Pages publishing, Firefox, Safari, physical camera/microphone
hardware, and a hardware GPU matrix were not run. No claim is made that a hosted
release was deployed or that all native
lint checks passed.

The original [browser.json](validation/browser.json) and
[Japanese screenshot](preview-ja.png) are historical offline-fixture evidence.
The screenshot shows a preset preview. They are separate from the new real HTTP
browser/compiler checks above. `test/offline_browser.py` remains an optional
renderer/UI debugging harness and is not used as proof of compiler success.
