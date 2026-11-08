import { OPERATIONS } from './operations.js';

// Signatures/defaults come from the operation schema; only documentation lives here.
const textureDocs = {
    osc: [['Horizontal cycles per unit width.', 'Animation cycles per second.', 'RGB phase spacing in radians; 0 produces grayscale.'], 'osc(10, 0.1, 1.4).out'],
    noise: [['Spatial frequency; larger values give smaller features.', 'Rate of motion through the noise field.'], 'noise(4, 0.2).out'],
    voronoi: [['Cell density; absolute value, at least 0.001.', 'Seed animation speed in radians per second.', 'Mix grayscale distances with cell colors, clamped to 0…1.'], 'voronoi(5, 0.3, 0.8).out'],
    shape: [['Polygon sides; absolute value rounded down, at least 3.', 'Distance from the center to an edge, in image-height units.', 'Edge softness in image-height units; at least one pixel.'], 'shape(5, 0.3, 0.01).out'],
    solid: [['Red channel.', 'Green channel.', 'Blue channel.', 'Opacity; 0 is transparent and 1 is opaque.'], 'solid(0.2, 0.5, 0.9, 1).out'],
    gradient: [['Hue cycles per second; 0 makes the gradient static.'], 'gradient(0.1).out'],
    circle: [['Radius in image-height units.', 'Edge softness; absolute value, at least one pixel.'], 'circle(0.3, 0.01).out'],
    rect: [['Full width in image-height units; absolute value.', 'Full height in image-height units; absolute value.', 'Edge softness; absolute value, at least one pixel.'], 'rect(0.6, 0.3, 0.01).out'],
    rotate: [['Initial angle in radians.', 'Additional radians per second.'], 'osc(8).rotate(0.2, 0.1).out'],
    scale: [['Common zoom factor; 2 zooms in, negative values mirror.', 'Additional horizontal factor.', 'Additional vertical factor.'], 'osc(8).scale(1.5, 1, 0.8).out'],
    scroll_x: [['Horizontal UV offset; 1 is one texture width.', 'Additional texture widths per second; coordinates wrap.'], 'osc(8).scroll_x(0.1, 0.05).out'],
    scroll_y: [['Vertical UV offset; 1 is one texture height.', 'Additional texture heights per second; coordinates wrap.'], 'noise(4).scroll_y(0.1, 0.05).out'],
    repeat: [['Horizontal repeat factor.', 'Vertical repeat factor; coordinates wrap.'], 'shape(4).repeat(3, 2).out'],
    pixelate: [['Horizontal grid cells; absolute value, at least 1.', 'Vertical grid cells; absolute value, at least 1.'], 'noise(5).pixelate(24, 14).out'],
    kaleid: [['Mirrored radial sectors; absolute value, at least 1.'], 'osc(8).kaleid(6).out'],
    color: [['Red multiplier.', 'Green multiplier.', 'Blue multiplier.', 'Alpha multiplier.'], 'osc(8).color(1, 0.5, 0.2, 1).out'],
    brightness: [['Offset added to RGB; 0 leaves it unchanged. Alpha is preserved.'], 'osc(8).brightness(0.2).out'],
    contrast: [['RGB scale around 0.5; 1 leaves it unchanged, 0 gives gray.'], 'noise(4).contrast(2).out'],
    saturate: [['Mix from grayscale (0) to original color (1); values above 1 intensify color.'], 'osc(8).saturate(0).out'],
    invert: [['Mix original (0) with inverted RGB (1). Alpha is preserved.'], 'osc(8).invert(0.7).out'],
    hue: [['Hue shift in turns; 1 is a complete cycle.'], 'osc(8).hue(time * 0.1).out'],
    colorama: [['Adds (amount, amount × 0.7, amount × 0.3) to HSV, then wraps each component.'], 'noise(3).colorama(0.3).out'],
    posterize: [['Number of color levels; absolute value, at least 2.', 'Gamma before quantization, reversed afterward; absolute value, at least 0.01.'], 'osc(8).posterize(4, 0.8).out'],
    thresh: [['Luminance cutoff, usually 0…1.', 'Soft transition half-width around the cutoff; absolute value, at least 0.00001.'], 'noise(4).thresh(0.5, 0.05).out'],
    luma: [['Luminance cutoff for opacity, usually 0…1.', 'Soft transition half-width; RGB is preserved.'], 'osc(8).luma(0.4, 0.1).layer(circle(0.2)).out'],
    blend: [['Interpolation amount: 0 keeps this texture, 1 selects other; values are not clamped.'], 'osc(8).blend(noise(3), 0.5).out'],
    add: [['Multiplier for other RGB before addition; alpha is the larger input alpha.'], 'osc(8).add(noise(3), 0.3).out'],
    sub: [['Multiplier for other RGB before subtraction; this texture’s alpha is preserved.'], 'osc(8).sub(noise(3), 0.3).out'],
    mult: [['Mix the RGB multiplier from 1 (amount 0) to other RGB (amount 1).'], 'osc(8).mult(noise(3), 0.8).out'],
    diff: [[], 'osc(8).diff(gradient(0.1)).out'],
    mask: [[], 'osc(8).mask(circle(0.3)).out'],
    layer: [[], 'solid(0.1, 0.2, 0.3).layer(shape(3, 0.2)).out'],
    modulate: [['UV displacement multiplier for (other.rg − 0.5).'], 'osc(8).modulate(noise(3), 0.2).out'],
    modulate_scale: [['Multiplier for centered other red/green channels.', 'Base x/y zoom factor added before centered scaling.'], 'osc(8).modulate_scale(noise(3), 0.5, 1).out'],
    modulate_rotate: [['Radians multiplied by (other.r − 0.5).', 'Base rotation in radians.'], 'osc(8).modulate_rotate(noise(3), 1, 0.2).out'],
    modulate_pixelate: [['Multiplier for other red/green channels to get x/y grid cells.', 'Base cells added before taking absolute values; at least 1 cell.'], 'osc(8).modulate_pixelate(noise(3), 30, 3).out'],
};

const entry = (id, signature, description, example, args = [], members = []) =>
    ({ id, signature, description, example, args, members });
const scalar = 'Crystal integer, float, or live Signal; constants must be finite and within ±1e9.';
const signalExample = expression => `osc(8 + (${expression}) * 4).out`;
const textureEntries = kind => OPERATIONS.filter(op => op.kind === kind).map(op => {
    const [descriptions, example] = textureDocs[op.name] ?? [[], ''];
    const args = op.args.map((arg, i) => [arg.name, descriptions[i]]);
    if (kind === 'combine') args.unshift(['other', 'Another Texture from this sketch.']);
    const signature = [...(kind === 'combine' ? ['other : Texture'] : []),
        ...op.args.map(arg => `${arg.name} : Scalar = ${arg.default}`)].join(', ');
    return { ...entry(op.name, `${kind === 'source' ? '' : '.'}${op.name}(${signature}) : Texture`,
        op.description, example, args), operation: op.name };
});

export const REFERENCE_SECTIONS = [
    { id: 'routing', key: 'apiRouting', entries: [
        entry('src-output', 'src(output : Output = o0) : Texture',
            'Read an output’s previous frame, including self-feedback. All four outputs sample the same previous frame and update together. Unassigned outputs are black.',
            'src(o0).scale(1.01).blend(osc(8), 0.05).out', [['output', 'o0…o3; omitted means o0.']], ['DSL.src']),
        entry('src-input', 'src(input : Input) : Texture',
            'Read an image, video or camera slot. Empty slots are opaque black. Choose files/devices in Inputs; code never requests access. Inputs stretch to UV coordinates. Videos are muted and loop.',
            'src(s0).kaleid(4).out', [['input', 's0…s3, populated through Inputs.']], ['DSL.src']),
        entry('out', '.out(output : Output = o0) : Texture',
            'Assign this texture to an output and return the same Texture. At least one .out is required. A later assignment replaces the earlier one for that output.',
            'osc(8).out(o0)\nnoise(3).out(o1)\nrender(o1)', [['output', 'Destination o0…o3; omitted means o0.']], ['Texture.out']),
        entry('render', 'render(output : Output = o0) : Nil',
            'Select the output initially displayed after Run. It does not control execution order or start an animation loop. The Buffer control can change it afterward.',
            'osc(8).out(o1)\nrender(o1)', [['output', 'Displayed output o0…o3.']], ['DSL.render']),
        entry('param', 'param(key : String, value : Number, min : Number = 0.0, max : Number = 1.0, step : Number = 0.01) : Signal',
            'Create a live slider, updated without recompiling. Bounds/defaults are ordinary Crystal numbers, not Signals. Names match [A-Za-z][A-Za-z0-9_]{0,31}. At most 16 parameters; identical definitions deduplicate, conflicting definitions fail. Run preserves current values by name; selecting an example restores defaults. Shares contain source defaults, not current slider positions.',
            'speed = param("speed", 0.2, min: 0.0, max: 1.0, step: 0.01)\nosc(8).rotate(time * speed).out',
            [['key', 'Unique slider name, 1…32 characters.'], ['value', 'Initial value, within min…max.'], ['min', 'Lower bound; must be less than max.'], ['max', 'Upper bound.'], ['step', 'Positive slider increment. All numbers must be finite and within ±1e9.']], ['DSL.param']),
        entry('outputs', 'o0, o1, o2, o3 : Output', 'The four feedback/output handles. These are not textures or input slots; use src(output) to read one and .out(output) to write one.',
            'osc(8).out(o2)\nrender(o2)', [], ['DSL.o0', 'DSL.o1', 'DSL.o2', 'DSL.o3']),
        entry('inputs', 's0, s1, s2, s3 : Input', 'The four external-media handles. Load an image/video or enable a camera in Inputs. Swapping media updates the texture without recompiling. Stop releases devices; reload does not restore media or device access.',
            'src(s0).blend(src(s3), 0.5).out', [], ['DSL.s0', 'DSL.s1', 'DSL.s2', 'DSL.s3']),
    ] },
    { id: 'sources', key: 'apiSource', entries: textureEntries('source') },
    { id: 'transforms', key: 'apiTransform', entries: textureEntries('transform') },
    { id: 'combines', key: 'apiCombine', entries: textureEntries('combine') },
    { id: 'signals', key: 'apiSignals', entries: [
        entry('time', 'time : Signal', 'Animation seconds, 0…86400. Transport speed scales its advancement; pause freezes it. Seek/Reset clear feedback, and Reset returns time/frame to zero.', 'osc(8).rotate(time * 0.2).out', [], ['DSL.time']),
        entry('frame', 'frame : Signal', 'Render count, including explicit redraws caused by parameter changes; not wall-clock time. Reset returns it to zero.', 'osc(8).rotate(frame * 0.01).out', [], ['DSL.frame']),
        entry('delta', 'delta : Signal', 'Seconds advanced by this render, including speed scaling. Zero on redraws without time advancement. Real frame time is capped at 0.1 seconds before scaling. +1 frame advances exactly 1/60 second, independent of speed.', 'solid(delta * 10, 0, 0).out', [], ['DSL.delta']),
        entry('beat', 'beat : Signal', 'Continuous beat count: time × BPM / 60. Not a beat detector. BPM is set in the transport (20…300, default 120); changing it may jump the phase. beat.fract repeats from 0 to 1.', 'osc(8).rotate(beat * 0.1).out', [], ['DSL.beat']),
        entry('mouse', 'mouse : Mouse', 'Pointer position over the displayed image; use .x or .y for live numeric signals.', 'osc(4 + mouse.x * 20).out', [], ['DSL.mouse']),
        entry('mouse-x', 'mouse.x : Signal', 'Horizontal image position, clamped to 0…1, increasing from left to right.', 'osc(4 + mouse.x * 20).out', [], ['Mouse.x']),
        entry('mouse-y', 'mouse.y : Signal', 'Vertical image position, clamped to 0…1, increasing from bottom to top.', 'circle(0.1 + mouse.y * 0.3).out', [], ['Mouse.y']),
        entry('audio', 'audio : Audio', 'Microphone analysis handle. Enable the microphone in Inputs; audio is not sent to speakers. Gain scales and clamps both .level and .fft to 0…1. Video-file audio is not analyzed.', 'osc(6 + audio.level * 20).out', [], ['DSL.audio']),
        entry('audio-level', 'audio.level : Signal', 'Microphone waveform RMS volume after gain, normalized to 0…1; zero while disabled. A relative visual control, not a calibrated physical measurement.', 'solid(audio.level, 0, 0).out', [], ['Audio.level']),
        entry('audio-fft', 'audio.fft(index : Int32) : Signal', 'One of 32 logarithmic bands, from low (0) to high (31), covering 20 Hz…Nyquist. Values are 0…1 after gain; disabled microphone gives zero. Sampling uses a 2048-point FFT with smoothing 0.7; low bands may share bins.', 'osc(6 + audio.fft(8) * 24).out', [['index', 'A compile-time Crystal integer from 0 to 31; a Signal is not allowed.']], ['Audio.fft']),
    ] },
    { id: 'methods', key: 'apiMethods', entries: [
        ...[['+', 'Addition.', 'time + 1'], ['-', 'Subtraction.', 'time - 1'], ['*', 'Multiplication.', 'time * 0.1'], ['/', 'Division. Denominators with magnitude below 1e-6 are replaced by a signed 1e-6.', 'time / 2']].map(([op, description, example]) =>
            entry(`signal-${op}`, `signal ${op} other : Signal`, description + ' Crystal numbers work on either side of a Signal. Ordinary numeric arithmetic keeps Crystal semantics.', signalExample(example), [['signal', 'A live Signal.'], ['other', scalar]], [`Signal.${op}`])),
        entry('signal-negate', '-signal : Signal', 'Unary negation.', signalExample('-time'), [['signal', 'A live Signal.']], ['Signal.-']),
        ...[['sin', 'Sine of the signal in radians, returning −1…1.'], ['cos', 'Cosine in radians, returning −1…1.'], ['abs', 'Absolute value.'], ['floor', 'Round down toward negative infinity.'], ['fract', 'Fractional part x − floor(x), in [0, 1), including for negative inputs.'], ['sqrt', 'Square root; negative inputs are clamped to zero.']].map(([name, description]) =>
            entry(`signal-${name}`, `signal.${name} : Signal`, description, signalExample(`time.${name}`), [['signal', 'A live Signal.']], [`Signal.${name}`])),
        entry('signal-pow', 'signal.pow(exponent : Scalar) : Signal', 'Power with safeguards: the base becomes max(abs(signal), 1e-6), and exponent is clamped to −16…16. Negative bases therefore lose their sign.', signalExample('time.sin.pow(2)'), [['signal', 'Base Signal.'], ['exponent', scalar]], ['Signal.pow']),
        entry('signal-min', 'signal.min(other : Scalar) : Signal', 'The smaller of two values.', signalExample('time.min(2)'), [['signal', 'A live Signal.'], ['other', scalar]], ['Signal.min']),
        entry('signal-max', 'signal.max(other : Scalar) : Signal', 'The larger of two values.', signalExample('time.max(2)'), [['signal', 'A live Signal.'], ['other', scalar]], ['Signal.max']),
        entry('signal-clamp', 'signal.clamp(low : Scalar = 0.0, high : Scalar = 1.0) : Signal', 'Clamp between two bounds; either bound order is accepted.', signalExample('time.sin.clamp(0, 1)'), [['signal', 'A live Signal.'], ['low', 'One bound; ' + scalar], ['high', 'The other bound; ' + scalar]], ['Signal.clamp']),
        entry('signal-lerp', 'signal.lerp(other : Scalar, amount : Scalar) : Signal', 'Linear interpolation: signal × (1 − amount) + other × amount. amount is not clamped; values outside 0…1 extrapolate.', signalExample('time.sin.lerp(1, 0.5)'), [['signal', 'First endpoint Signal.'], ['other', 'Second endpoint; ' + scalar], ['amount', 'Interpolation weight; ' + scalar]], ['Signal.lerp']),
        entry('signal-map', 'signal.map(in_low : Scalar, in_high : Scalar, out_low : Scalar, out_high : Scalar) : Signal', 'Remap ranges linearly, without clamping; reversed ranges are supported. Avoid equal input endpoints: division uses the 1e-6 denominator safeguard.', 'circle(time.sin.map(-1, 1, 0.1, 0.4)).out', [['signal', 'Value to remap.'], ['in_low', 'Input start; ' + scalar], ['in_high', 'Input end; ' + scalar], ['out_low', 'Output start; ' + scalar], ['out_high', 'Output end; ' + scalar]], ['Signal.map']),
    ] },
    { id: 'helpers', key: 'apiHelpers', entries: [
        entry('helper-sin', 'sin(value : Scalar) : Signal', 'Top-level equivalent of Signal.cast(value).sin; angle in radians. Use Math.sin only with ordinary Crystal numbers, not live Signals.', signalExample('sin(time)'), [['value', scalar]], ['DSL.sin']),
        entry('helper-cos', 'cos(value : Scalar) : Signal', 'Top-level equivalent of Signal.cast(value).cos; angle in radians.', signalExample('cos(time)'), [['value', scalar]], ['DSL.cos']),
        entry('helper-constrain', 'constrain(value : Scalar, low : Scalar = 0.0, high : Scalar = 1.0) : Signal', 'Equivalent to Signal.cast(value).clamp(low, high). Bounds may be given in either order.', signalExample('constrain(time.sin, 0, 1)'), [['value', scalar], ['low', 'One bound.'], ['high', 'The other bound.']], ['DSL.constrain']),
        entry('helper-lerp', 'lerp(first : Scalar, second : Scalar, amount : Scalar) : Signal', 'Equivalent to Signal.cast(first).lerp(second, amount). All three arguments accept numbers or Signals; the interpolation amount is not clamped.', 'osc(lerp(4, 12, time.sin * 0.5 + 0.5)).out', [['first', 'First endpoint.'], ['second', 'Second endpoint.'], ['amount', '0 selects first; 1 selects second; outside 0…1 extrapolates.']], ['DSL.lerp']),
        entry('helper-map', 'map(value : Scalar, in_low : Scalar, in_high : Scalar, out_low : Scalar, out_high : Scalar) : Signal', 'Equivalent to Signal.cast(value).map(in_low, in_high, out_low, out_high). All five arguments accept numbers or Signals. Results are not clamped.', 'circle(map(time.sin, -1, 1, 0.1, 0.4)).out', [['value', 'Value to remap.'], ['in_low', 'Input start.'], ['in_high', 'Input end; avoid equal input endpoints.'], ['out_low', 'Output start.'], ['out_high', 'Output end.']], ['DSL.map']),
    ] },
    { id: 'types', key: 'apiNative', entries: [
        entry('scalar', 'Plankton::Scalar = Int::Primitive | Float::Primitive | Signal', 'Every texture operation’s Scalar argument accepts an integer, float or live Signal. Named arguments are supported. Angles use radians; hue uses turns. Colors are usually 0…1 and clamp at each RGBA8 output. Graph construction runs once in Crystal; Signals update on the GPU. They cannot control a Crystal if/loop, and arbitrary blocks/Procs are not per-frame callbacks. Limits: 64 KiB source, 128 nodes, 16 parameters, expression depth 32 and 1920×1080 output; depth/evaluation-work limits can reject a graph before it reaches 128 nodes.', 'osc(frequency: 8, sync: 0.1).rotate(time * 0.2).out'),
        entry('texture', 'Plankton::Texture', 'Immutable texture expression: transforms/combinations return a new Texture; .out returns self. Reusing a texture shares its graph node. .id is its node index and .graph is the owning Graph; textures from different graphs cannot be combined. Graph records are implementation details; prefer the sketch API.', 'base = osc(8)\nbase.rotate(time * 0.1).out(o0)\nbase.kaleid(4).out(o1)'),
        entry('signal-cast', 'Plankton::Signal.cast(value : Number) : Signal; Plankton::Signal.cast(value : Signal) : Signal', 'Wrap a finite numeric constant, or return an existing Signal unchanged. Constants must be within ±1e9. Signal exposes .op, .args, .value and .key for inspection; these are symbolic records, not live numerical values.', 'x = Plankton::Signal.cast(0.5)\nsolid(Plankton::Signal.cast(x), 0, 0).out', [['value', 'A Crystal number or Signal.']], ['Signal.cast']),
        entry('signal-new', 'Plankton::Signal.new(op : String, args : Array(Signal) = [], value : Float64 = 0.0, key : String = "") : Signal', 'Low-level symbolic expression constructor. Prefer operators, helpers or .cast. The emitted graph validates operation names, arity, values and references; arbitrary op strings are not shader code.', 'wave = Plankton::Signal.new("sin", [time])\nosc(8 + wave * 4).out', [['op', 'Validated expression opcode, such as sin.'], ['args', 'Operand Signals.'], ['value', 'Literal value for const/fft.'], ['key', 'Name for a previously defined param.']], ['Signal.new']),
        entry('input-new', 'Plankton::Input.new(index : Int32) : Input', 'Construct an input handle, equivalent to s0…s3. .index returns its slot index; constructing the handle does not load media or request permissions.', 'src(Plankton::Input.new(0)).out', [['index', '0…3; all other indices raise ArgumentError.']], ['Input.new']),
        entry('output-new', 'Plankton::Output.new(index : Int32) : Output', 'Construct an output handle, equivalent to o0…o3. .index returns its buffer index.', 'osc(8).out(Plankton::Output.new(1))\nrender(o1)', [['index', '0…3; all other indices raise ArgumentError.']], ['Output.new']),
        entry('graph', 'Plankton.graph : Graph', 'Inspect the current graph: .nodes (ordered Node records with op/args/inputs), .params (Parameter records with key/value/min/max/step), .outputs (four node indices or nil), and writable .display (selected output index). Prefer the ordinary DSL to modifying these records.', 'osc(8).out\nputs Plankton.graph.nodes.size', [], ['Plankton.graph']),
        entry('graph-new', 'Plankton::Graph.new : Graph', 'Create an independent graph builder with no nodes/parameters, four nil outputs and display 0. DSL source functions always use Plankton.graph; textures from independent graphs cannot be mixed.', 'graph = Plankton::Graph.new\nputs graph.nodes.size\nosc(8).out'),
        entry('graph-add', 'graph.add(op : String, args : Array(Signal), inputs : Array(Int32) = []) : Texture', 'Low-level node builder; prefer named texture operations. Appends a node and returns its Texture. At most 128 nodes per graph. The browser validates opcode, exact argument/input counts, and references to earlier nodes.', 'values = [1.0, 0.5, 0.0, 1.0].map { |v| Plankton::Signal.cast(v) }\nPlankton.graph.add("solid", values).out', [['op', 'Texture opcode, such as solid.'], ['args', 'Scalar operands wrapped as Signals.'], ['inputs', 'Earlier texture node indices in this graph.']], ['Graph.add']),
        entry('graph-param', 'graph.param(key : String, value : Number, min : Number, max : Number, step : Number) : Signal', 'Low-level equivalent of param; all five arguments are required. Uses the same name, bounds, deduplication and 16-parameter limit.', 'red = Plankton.graph.param("red", 0.5, 0.0, 1.0, 0.01)\nsolid(red, 0, 0).out', [['key', 'Slider name.'], ['value', 'Initial value.'], ['min', 'Lower bound.'], ['max', 'Upper bound.'], ['step', 'Positive increment.']], ['Graph.param']),
        entry('graph-json', 'graph.to_json : String; graph.to_json(json : JSON::Builder) : Nil', 'Serialize version, nodes, outputs, display and params. The compiler driver uses Plankton.emit to add protocol framing; an ordinary JSON string printed as a diagnostic is not that framing.', 'osc(8).out\nputs Plankton.graph.to_json', [['json', 'Optional Crystal JSON builder for streaming serialization.']], ['Graph.to_json']),
        entry('signal-json', 'signal.to_json : String; signal.to_json(json : JSON::Builder) : Nil', 'Serialize a symbolic expression: op plus operands, or a constant/FFT value or parameter key. This does not evaluate the signal.', 'puts time.sin.to_json\nosc(8).out', [['json', 'Optional Crystal JSON builder.']], ['Signal.to_json']),
        entry('texture-new', 'Plankton::Texture.new(graph : Graph, id : Int32) : Texture', 'Low-level handle for an existing node; this creates no new node. Prefer source functions and transformations, which create valid handles automatically.', 'base = osc(8)\nPlankton::Texture.new(base.graph, base.id).out', [['graph', 'The graph that owns the node.'], ['id', 'An existing node index in that graph.']], ['Texture.new']),
        { ...entry('reset', 'Plankton.reset : Nil', 'Replace the Crystal graph builder. Native/library use only; this does not clear browser GPU feedback or reset its clock. In the editor use Reset for the renderer. Do not reuse old Texture values after resetting the graph.', 'require "./src/plankton"\nPlankton.reset\nosc(8).out\nPlankton.emit'), native: true },
        { ...entry('emit', 'Plankton.emit : Nil', 'Native/library use: write one versioned graph to stdout. At least one .out is required. The browser compiler calls this automatically: do not call it in an editor sketch. Plankton::DSL is included by the prelude.', 'require "./src/plankton"\nosc(8).out\nPlankton.emit'), native: true },
    ] },
];
