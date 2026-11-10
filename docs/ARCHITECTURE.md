# Architecture

```text
Crystal source editor                 trusted static assets
         │                                   │
         ▼                                   ▼
CompilerClient ──► dedicated module Worker ──► crystal-wasm 0.4.0 / libgc fork
                   Crystal compiler.wasm → object → LLD → GC instrumentation → sketch.wasm
                                                             │
                                                   one-shot WASI execution
                                                             │
                                               marker + versioned JSON graph
                                                             │
                                                             ▼
               UI ◄──── validated result ◄──── graph validator
                │
          transactional shader compile/link
                │
                ▼
       WebGL 2 signal-graph renderer
       4 outputs × 2 framebuffer textures
       time / beat / mouse / audio / parameters as uniforms
       4 user-selected media textures (s0…s3)
```

## Ownership and lifetime

The compiler Worker remains idle between successful compiles so the pinned
compiler/toolchain can be reused. Each `run` executes a newly compiled
program instance. Stop and the watchdog terminate the Worker; a later Run creates
a new one. This is separate from the WebGL animation loop on the main thread.
A compile error does not replace the last good graph. A late result is discarded
if the request was superseded or source changed while it was compiling.

The graph builder is normal Crystal code in `src/plankton`. It allocates node and
expression records, serializes once, and exits. The generated Wasm uses experimental Boehm GC; unreachable allocations can be
reused while building the graph. The compiler itself keeps its existing allocator.
GC instrumentation runs after linking and before execution, and is included in
reported build time. There is no JS interpreter for a
subset of Crystal, no `eval` of editor source, and no per-frame callback into Wasm.
The user can write regular Crystal helpers, loops and types, within the upstream
WASI/toolchain limitations. Dynamic GPU expressions are explicitly represented
by `Signal`, not magically extracted from arbitrary Crystal expressions.

`schema/operations.json` is the single source of truth for method signatures and
node arity. `scripts/generate.mjs` produces the Crystal wrappers and JS registry.
The shader backend is intentionally handwritten and independent of Hydra's
runtime. One GLSL function per node limits shader *text* growth; recursive
render-cost limits also bound repeated evaluation through branching graphs.
GLSL compilation still happens synchronously through WebGL and can be expensive.

## Protocol and isolation

The driver mounts `plankton.cr`, `plankton/core.cr`, `plankton/generated.cr`, and `sketch.cr`
in the compiler's in-memory filesystem. The main file requires the DSL and sketch,
then calls `Plankton.emit`. The emitted line is prefixed by
`__PLANKTON_GRAPH_V1__`. There must be exactly one such line. Other lines become
console output, never HTML. Output is bounded before parsing.

Graph version 1 contains `nodes`, four `outputs`, `display`, and `params`. Node
operands must reference earlier node indices. Feedback uses a special `src` node
with a constant output index, not a recursive graph edge. Validation checks opcode
and signal allowlists, exact arity, finite literals, parameter definitions, graph
and expression depths, counts and expansion cost. Sanitized graph objects are
constructed rather than reusing untrusted objects. Shader identifiers use validated
numeric indices; arbitrary text from a sketch is not inserted into GLSL.

`src(s0)`…`src(s3)` emit a distinct `input` opcode with a constant slot index.
`src(o0)` still emits the feedback `src` opcode. The input textures occupy GPU
units 4…7, separate from the previous-frame output textures on units 0…3. Uploads
flip DOM media vertically to match GLSL UV coordinates; oversized media are scaled
to at most 2048 px on the larger axis. Empty slots bind opaque black. Uniform
signals `fft` (a validated constant band 0…31), `audio_level`, `beat` and `delta`
are validated independently of arbitrary source strings.

`Inputs` owns file object URLs, media elements, device streams and Web Audio
resources. DOM controls alone request file/device inputs; Crystal graph execution
cannot open a device. Replacing or clearing a slot releases its previous resources.
Per-slot revisions discard late file/permission results, and abort controllers stop
loading streams immediately when cleared or stopped. A late permission grant is
released without starting the stream. Page exit disposes all input resources.
No source files or device handles are serialized into drafts/shares.

The microphone is connected only to an `AnalyserNode`, not the audio destination.
Each render samples 32 logarithmic bands plus waveform RMS into GPU uniforms.
The transport owns the clock, BPM and speed; file videos follow it through playback
rate, pause, seek and periodic drift correction. Cameras and microphones are live
devices, not seekable media. Seeking clears feedback; stepping preserves it.

Each frame binds four previous-frame textures, renders assigned outputs into their
opposite buffers, swaps all outputs together, and presents the selected texture.
An output is never simultaneously attached for writing and sampled for reading.
Resize allocates new targets before freeing old ones; shader replacement compiles
and links the new program before deleting the old one. Context loss is reported;
when restored, resources and the graph are recreated (feedback contents are lost).

The browser source runs in WASI, with only the host imports provided by the pinned
pinned compiler package. This is not a security guarantee for arbitrary native
libraries or future compiler versions. A Worker is not a separate-process memory
budget. Heavy compilation or memory allocation may still stress the browser.
Do not advertise the node caps/watchdog as a complete denial-of-service defense.

## Static build and Pages

`npm run build` copies the entire installed compiler package into `dist/vendor/crystal`.
The npm dependency is a release archive from `kojix2/browser-crystal` at a fixed
`libgc` commit, with its integrity pinned in `package-lock.json`. `package.json`
records the expected package version, repository and commit separately from the
archive URL. Both the local build and jsDelivr build enable
`gc: 'boehm-experimental'` using the shared compiler options module; the CDN
URL uses the full commit rather than a moving branch name. Build metadata records
that revision and GC mode.
The upstream loader verifies asset bytes against its embedded receipts and inflates
`.gz` itself; no server-side gzip configuration, credentials or special response
headers are needed. All application URLs are relative and tested at `/repository/`
by the HTTP browser CI runner. `build:cdn` is an explicitly separate, labeled mode.
No CDN fallback happens in a normal same-origin build.

The frontend has a restrictive CSP; Wasm compilation is allowed with
`wasm-unsafe-eval`, not general `unsafe-eval`. CDN script/fetch origin is allowed
only for the optional pinned compiler mode. No service worker is installed, so
there is no service-worker update/cache state to migrate. Ordinary browser HTTP
caching can still cache static assets.

Drafts use localStorage on this origin; shares put compressed source in the URL
fragment, not a remote database. Opening a share never executes code. Someone
holding the full URL can read the source, so share links are not secret/encrypted.
The renderer and editor need no third-party runtime packages or fonts.

## Boundaries of this implementation

The renderer supports procedural textures, local image/video files, cameras and
microphone analysis. Remote media URLs, audio synthesis/output, animation export,
reverse playback and a full scene-graph editor are outside this version.
The editor is a lightweight highlighting textarea, not a language
server. Browser-side Ameba would require an additional Wasm port; this project uses
Ameba in development/CI and real compiler diagnostics in the browser.

`test/browser-suite.mjs` contains renderer/UI tests. `scripts/test-browser.mjs`
serves the real static app under a project subpath, drives Chrome through CDP,
and performs a real compiler integration step. `test/offline_browser.py` can inject
local assets into a blank page when a test environment forbids even localhost
navigation. Its source-module adaptation and fetch fixtures are **test-only**, not
part of `web/` or `dist/`, and do not validate HTTP/CSP/Worker/compiler behavior.
