# Crystal DSL, version 1

The in-app Reference lists the complete sketch API, including signatures, argument
types/defaults, return types and runnable examples. Search by name or description;
expand an entry for its details. Technical descriptions remain in English.

The editor supplies the standard `Plankton::DSL` context automatically. Do not add
`Plankton.emit` yourself: the compiler driver emits exactly one graph at the end.
When using the library in a native program, `require "./src/plankton"`, write the
sketch, then call `Plankton.emit` once. `puts` can write ordinary diagnostic lines.
Avoid `print` without a terminating newline immediately before the emitted graph.

## Textures and outputs

A source returns `Plankton::Texture`; transformations return a new texture. Existing
textures do not mutate, so a shared expression can be reused in several branches.
`.out` assigns a texture to output `o0` by default. `.out(o1)` writes another
buffer. `render(o1)` selects the initially displayed output, not an execution order.
There are exactly four outputs. A later assignment to the same output replaces
its earlier assignment. Intermediate nodes still count toward the 128-node limit.

```crystal
base = osc(8)
base.kaleid(4).out(o0)
base.modulate(noise(3), 0.3).out(o1)
render(o1)
```

`src(o0)` reads the **previous rendered frame**, including on the first Run after
an edit. This is a texture reference, not a cycle in the JSON graph. All four
outputs sample the same previous-frame state and swap together after rendering.
Unlike engines with sequential output evaluation, output declaration order does
not expose another output's current-frame result. Unassigned outputs are black.

```crystal
memory = param("memory", 0.94, min: 0.5, max: 0.99, step: 0.01)
src(o0).scale(1.015).rotate(0.012)
  .blend(osc(7, 0.04, 1.6).kaleid(5), 1.0 - memory)
  .out
```

Run preserves GPU feedback buffers when possible, even though the Crystal graph
is reconstructed. Reset or choosing another sample clears buffers and resets
`time`/`frame`. Changing rendering resolution also clears texture contents.
Output format is RGBA8, clamped to [0,1] at each output, not HDR. The canvas
composites output alpha over black.

## Images, video and cameras

Open **Inputs**, select `s0`…`s3`, and load a local image/video or enable a camera.
The same `src` function distinguishes input slots from output feedback:

```crystal
src(s0).kaleid(5).modulate(noise(3), 0.1).out
# src(o0) still reads the previous rendered output frame.
```

An empty input is opaque black. Swapping a file or enabling a camera updates the
texture without recompiling. Inputs stretch to normalized UV coordinates; they do
not automatically crop or preserve aspect ratio. Images/video frames above 2048 px
on either axis are scaled down, preserving aspect ratio before GPU upload.
File codec support is determined by the browser. SVGs load as images, not executable
documents. Video files are muted and loop; their audio is not analyzed or played.

The transport controls also pause/resume video files, adjust playback rate, and
seek them to `time % duration` when duration metadata is available. Playback rates
below 0.0625× use the browser's minimum 0.0625× rate with periodic clock correction.
Live cameras remain live while the graph clock is paused; the frozen output is
redrawn only on an explicit update. Stop releases cameras and the microphone,
but keeps file inputs available. Clearing a slot revokes its file URL and releases
camera tracks. Page exit releases all devices, URLs and audio resources.

Neither a sketch nor a shared URL can open files or request device access.
Permission requests happen only through the Inputs buttons. Browser permissions
require HTTPS or localhost. Reloading does not restore files or enable devices;
shared code must be accompanied by instructions for the recipient's inputs.

## Microphone and FFT

Enable the microphone in **Inputs**. It feeds Web Audio's real `AnalyserNode`
(`fftSize = 2048`, smoothing 0.7), without connecting to speakers. The 32 FFT bands
cover 20 Hz to Nyquist on a logarithmic scale. Each is the RMS of the analyser's
normalized byte magnitudes, rather than a calibrated physical level; low bands may
share bins because of the FFT's frequency resolution. Gain scales the bands and
RMS volume, clamped to 0…1. Disabled inputs are zero.

```crystal
osc(6 + audio.fft(0) * 24, 0.08, 1.4)
  .brightness(audio.level * 0.6)
  .rotate(beat * 0.08)
  .out

# Combine a camera with audio-reactive processing:
# src(s0).kaleid(3 + audio.fft(8) * 8).out
```

`audio.fft(index)` requires a Crystal integer from 0 to 31.
`audio.level` is the waveform's RMS volume. These are Signals, so changes reach
GPU uniforms every frame without rerunning Crystal. Pausing freezes animation
and continuous audio-reactive redraws; device capture stays active until disabled
or Stop is pressed.

## Clock and transport

Speed controls `time` advancement from 0× to 4×; at 0× the renderer and audio can
still update while animation time stays fixed. Pause freezes continuous rendering.
Seek accepts seconds from 0 to 86400 and clears feedback buffers because it cannot
reconstruct past feedback. Reset sets time/frame to zero and clears feedback.
**+1 frame** pauses playback and advances exactly 1/60 second regardless of speed,
preserving feedback. This is a fixed simulation step, not the video's native FPS.
The clock caps at 86400 seconds. Reverse playback and historical feedback seeking
are not provided.

`beat` is `time * BPM / 60` (a continuous beat count, not a beat detector).
Changing BPM changes this expression immediately and may jump its phase.
`beat.fract` makes a repeating 0…1 phase. `delta` is scaled elapsed seconds for the
current render, zero for a redraw without time advancement. Real frame deltas are
capped at 0.1 seconds before speed scaling to avoid large jumps after backgrounding.

## Live scalar expressions

A `Plankton::Signal` is a symbolic float expression evaluated per fragment on the GPU,
not a numeric value evaluated by Crystal on each frame.

| Expression | Meaning |
|---|---|
| `time` | Animation seconds; does not advance while paused |
| `frame` | Render count, including redraws after parameter changes |
| `delta` | Scaled seconds advanced by the current render |
| `beat` | Continuous beat count at the transport BPM |
| `audio.fft(0)` … `audio.fft(31)` | Microphone's 32 normalized spectral bands |
| `audio.level` | Normalized RMS microphone volume |
| `mouse.x` | Horizontal canvas position, clamped to 0…1 |
| `mouse.y` | Vertical position, 0 at bottom and 1 at top |
| `param("name", value, min: 0.0, max: 1.0, step: 0.01)` | Named live slider |
| `+`, `-`, `*`, `/`, unary `-` | Scalar arithmetic; numeric operands work on either side |
| `.sin`, `.cos`, `.abs`, `.floor`, `.fract`, `.sqrt` | Scalar transformations |
| `.pow(value)`, `.min(value)`, `.max(value)` | Binary scalar operations |
| `.clamp(low, high)` | Clamp to bounds |
| `.lerp(other, amount)` | Linear interpolation |
| `.map(in_low, in_high, out_low, out_high)` | Range remapping, not automatically clamped |

Top-level helpers: `sin(value)`, `cos(value)`, `constrain(value, low, high)`,
`lerp(first, second, amount)`, and `map(value, in_low, in_high, out_low, out_high)`.
For ordinary numeric calculations, Crystal's standard `Math` remains available.

```crystal
radius = (time * 0.7).sin.map(-1.0, 1.0, 0.16, 0.38)
circle(radius).diff(circle(radius * 0.8)).mult(gradient(0.08)).out
```

Use `time.sin`, not `Math.sin(time)`: the latter expects a concrete Crystal number.
Likewise `if time > 3` and an arbitrary Crystal block/Proc are not runtime GPU
programs. Use ordinary Crystal `def`, arrays, classes, branches and loops to build
a graph **once**; use Signals for animated scalar inputs. The `crystal-petals`
example demonstrates real Crystal iteration and a helper method.

Parameter names match `[A-Za-z][A-Za-z0-9_]{0,31}`. Identical declarations deduplicate;
conflicting definitions raise an error. On successful Run, current slider values
are preserved by name and clamped to new bounds. Selecting an example resets
sliders to that example's defaults. Parameter values are not saved in shared URLs;
source defaults are the reproducible starting point.

Safeguards intentionally differ from exact real-number arithmetic: division uses
a signed minimum denominator of 1e-6; square roots clamp the input to nonnegative;
`.pow` uses absolute base ≥1e-6 and exponent clamped to ±16. Clamp accepts bounds in
either order. Huge intermediate arithmetic can still lose precision or overflow.

## Texture API

The signatures/defaults below are generated from the canonical operation schema.
All scalar arguments accept Crystal numbers or Signals. Angles use radians,
hue uses turns, speeds use seconds. Position/radius use normalized coordinates.
`circle`, `rect`, rotation and kaleidoscope coordinates compensate for aspect ratio;
`repeat` and source functions otherwise use the normalized texture coordinates.
Geometry has transparent background. `scale(2)` zooms in around the center;
`scale(1, 2, 1)` changes the x factor. Colors are float RGBA, usually 0…1.

### Sources

**`osc(frequency = 10, sync = 0.1, offset = 1)`** — Animated RGB oscillator.

**`noise(scale = 10, speed = 0.1)`** — Smooth, animated value noise (not Hydra simplex noise).

**`voronoi(scale = 5, speed = 0.3, blending = 0.3)`** — Animated cellular distance field.

**`shape(sides = 3, radius = 0.3, smoothing = 0.01)`** — Antialiased regular polygon, with transparent background.

**`solid(r = 0, g = 0, b = 0, a = 1)`** — Solid RGBA color.

**`gradient(speed = 0.1)`** — Animated spectral gradient.

**`circle(radius = 0.3, smoothing = 0.01)`** — Aspect-correct circle with transparent background.

**`rect(width = 0.5, height = 0.5, smoothing = 0.01)`** — Aspect-correct centered rectangle.

### Transforms

**`rotate(angle = 0, speed = 0)`** — Rotate by radians, with optional radians per second.

**`scale(amount = 1, x = 1, y = 1)`** — Scale around the center; amount is the common factor.

**`scroll_x(amount = 0, speed = 0)`** — Horizontal offset and scrolling speed.

**`scroll_y(amount = 0, speed = 0)`** — Vertical offset and scrolling speed.

**`repeat(x = 3, y = 3)`** — Repeat a texture in a grid.

**`pixelate(x = 20, y = 20)`** — Quantize coordinates into a grid.

**`kaleid(sides = 4)`** — Mirror radial sectors into a kaleidoscope.

**`color(r = 1, g = 1, b = 1, a = 1)`** — Multiply RGBA channels.

**`brightness(amount = 0)`** — Add to RGB channels.

**`contrast(amount = 1)`** — Adjust contrast about 0.5.

**`saturate(amount = 1)`** — Adjust saturation about luminance.

**`invert(amount = 1)`** — Mix with the inverted color.

**`hue(amount = 0)`** — Shift hue in turns.

**`colorama(amount = 0.1)`** — Shift hue and fold saturation/brightness.

**`posterize(bins = 3, gamma = 1)`** — Reduce the number of color levels.

**`thresh(threshold = 0.5, tolerance = 0.04)`** — Black/white luminance threshold.

**`luma(threshold = 0.5, tolerance = 0.1)`** — Turn luminance into an alpha mask.

### Combines

**`blend(texture, amount = 0.5)`** — Interpolate between two textures.

**`add(texture, amount = 1)`** — Add another texture.

**`sub(texture, amount = 1)`** — Subtract another texture.

**`mult(texture, amount = 1)`** — Multiply by another texture.

**`diff(texture)`** — Absolute color difference.

**`mask(texture)`** — Use another texture’s luminance and alpha as a mask.

**`layer(texture)`** — Alpha-composite another texture over this texture.

**`modulate(texture, amount = 0.1)`** — Warp coordinates using centered red/green channels.

**`modulate_scale(texture, amount = 0.5, offset = 1)`** — Scale coordinates using another texture.

**`modulate_rotate(texture, amount = 1, offset = 0)`** — Rotate coordinates using another texture.

**`modulate_pixelate(texture, multiple = 10, offset = 3)`** — Modulate the pixel grid resolution.

## Deliberate differences from Hydra

`noise` is smooth value noise, not Hydra's simplex implementation. Modulation uses
centered red/green displacement (`channels - 0.5`). `gradient`, HSV color transforms,
polygon geometry, alpha blending and kaleidoscope math are independently written.
`modulate_scale` has its own defaults. Methods use Crystal snake_case. Sequencer
arrays, arbitrary JavaScript callbacks and `setFunction` are not implemented.
Media and microphone analysis use Plankton's Inputs UI and `src(s0)` / `audio`
signals rather than Hydra's JavaScript media APIs. Do not expect existing
JavaScript/Hydra programs or exact Hydra screenshots to translate unchanged.
