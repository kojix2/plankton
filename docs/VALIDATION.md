# Validation

Run these checks from the project root. Generated logs, screenshots and traces
belong in the ignored `test-results/` directory, rather than in the source tree.

```sh
make test                   # syntax, JSON, generated API and JavaScript unit tests
make test-wasm              # real Crystal/Wasm compilation, including every example
make setup-browser          # one-time Playwright Chromium installation
make test-browser           # HTTP, WebGL and actual browser compilation
make test-playwright        # UI, media inputs and compiler regression tests
make check-crystal          # native Crystal format, Ameba and specs
```

Node.js >= 22 (24 recommended) and Make are required. Native checks additionally
require Crystal >= 1.17 and shards. Dependency and browser installation require
network access. Both lockfiles are committed; use `make setup` or
`npm ci --ignore-scripts` to install the pinned npm dependencies.

To use an existing Chrome/Chromium instead of downloading Playwright's browser:

```sh
CHROME_BIN=/path/to/chrome make test-browser
CHROME_BIN=/path/to/chrome make test-playwright
```

The Playwright server starts and stops automatically at
`http://127.0.0.1:4187/repository/`, exercising GitHub Pages project subpaths.

## Coverage

- JavaScript: graph and protocol validation, sharing, translations, compiler
  lifecycle, media resource cleanup and the static HTTP server.
- Crystal/Wasm: all twelve examples must match the bundled preview graphs;
  generated operations, live signals and media expressions compile with the real
  compiler; invalid types, invalid FFT bands and missing outputs are rejected.
- Browser: all 36 operations, feedback, live parameters and presets reach real
  WebGL pixels. Run compiles actual Crystal; invalid code preserves the last
  image; Stop cancels an infinite program and allows another compilation.
- UI: shared links and drafts never execute automatically; all nine locales,
  gallery selection, PNG export, resolution and mobile layout remain usable.
- Inputs: four image slots, video decoding and transport, camera track cleanup,
  microphone FFT/RMS/gain, permission failure and cancellation, time/beat/delta,
  and reload/share behavior without automatic device access.

Screenshots, downloads and failure traces go to `test-results/`. Browser tests
use software WebGL and fake capture devices or generated sound. They do not
establish physical-device, hardware-GPU, Firefox or Safari compatibility.

`test/offline_browser.py` remains an optional renderer/UI debugging harness for
environments that forbid localhost navigation. It injects fixtures into a blank
page and can regenerate gallery thumbnails. It does not test HTTP, CSP, Worker
fetching or real compilation, and is not a substitute for the browser checks.

GitHub Actions runs the checks configured in `.github/workflows/ci.yml` before
Pages deployment. Local results do not establish that a hosted release was
published.
