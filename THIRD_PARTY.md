# Third-party software and design references

## Runtime dependency

`@live-codes/crystal-wasm` **0.4.0**, by the LiveCodes/browser-crystal contributors:
https://github.com/live-codes/browser-crystal/tree/main/packages/crystal-wasm

The package wrapper is MIT-licensed. Its bundled compiler/toolchain has its own
license notices. A normal build copies the complete installed package, including
`THIRD-PARTY-NOTICES.md`, upstream source and notices, to `dist/vendor/crystal/`.
**Retain all those files when distributing the site.** Do not treat the wrapper's
MIT license as replacing the licenses of LLVM, LLD, Crystal, WASI and other
bundled components. See the package's own notices for authoritative attribution.
The explicit CDN build loads that same fixed package version from jsDelivr.

Playwright Test 1.65.0 is a development-only Apache-2.0-licensed dependency:
https://github.com/microsoft/playwright
It is used for browser regression tests and is not copied into the built site.

No editor/renderer JavaScript libraries, remote fonts, analytics, tracking code,
Hydra runtime, p5.js runtime or media assets are embedded by this project.

## Acknowledgments, not bundled implementations

- Hydra / Olivia Jack and contributors: https://hydra.ojack.xyz/ and
  https://github.com/hydra-synth/hydra . The composable video-synthesizer model,
  recognizable operation vocabulary, modulation and feedback inspire this DSL.
- Processing and p5.js: https://processing.org/ and https://p5js.org/ . Basic
  geometry and scalar mapping/interpolation inform the small supplemental API.
- Crystal Observatory: https://github.com/kojix2/crystal-observatory . Reference
  for a browser-only Crystal compilation workflow.

This is an independent renderer and original sample collection, **not** an
upstream Hydra port, an official Hydra product, or a pixel-compatible reimplementation.
No Hydra or p5.js implementation files are copied into this repository. Do not
add AGPL/LGPL implementation code later without reviewing the applicable license
and distribution requirements.

The uploaded ZIP archives could not be read from the working execution environment;
public upstream sources were used to inspect APIs instead. No archive-derived code
is asserted to be included.
