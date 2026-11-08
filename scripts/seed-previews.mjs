// Fixed gallery previews, NOT a parser or interpreter for edited Crystal.
// test:wasm compares these graphs with the actual compiled Crystal examples.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ops = JSON.parse(await readFile(path.join(root, 'schema/operations.json'), 'utf8'));
const literal = (x) => typeof x === 'number' ? { op: 'const', value: x } : x;
const e = (op, ...args) => args.length ? { op, args: args.map(literal) } : { op };
function builder() {
    const graph = { version: 1, nodes: [], outputs: [null, null, null, null], display: 0, params: [] };
    class Texture {
        constructor(id) { this.id = id; }
        out(index = 0) { graph.outputs[index] = this.id; return this; }
    }
    const add = (op, args, inputs = []) => { graph.nodes.push({ op, args: args.map(literal), inputs }); return new Texture(graph.nodes.length - 1); };
    const b = { graph, src: (i = 0) => add('src', [i]), param(key, value, min, max, step) {
            graph.params.push({ key, value, min, max, step });
            return { op: 'param', key };
        } };
    for (const op of ops) {
        const values = (args) => op.args.map((arg, i) => args[i] ?? arg.default);
        if (op.kind === 'source')
            b[op.name] = (...args) => add(op.name, values(args));
        else if (op.kind === 'combine')
            Texture.prototype[op.name] = function (other, ...args) { return add(op.name, values(args), [this.id, other.id]); };
        else
            Texture.prototype[op.name] = function (...args) { return add(op.name, values(args), [this.id]); };
    }
    return b;
}
const samples = [
    ['chromatic-tide', 'color', `# Chromatic tide · change the sliders without recompiling
frequency = param("frequency", 8.0, min: 1.0, max: 40.0, step: 0.1)
folds = param("folds", 5.0, min: 1.0, max: 12.0, step: 1.0)

osc(frequency, 0.045, 1.4)
  .modulate(noise(2.8, 0.12), 0.22)
  .rotate(0.0, 0.04)
  .kaleid(folds)
  .color(0.8, 0.65, 1.3)
  .out
`, (b) => {
            const frequency = b.param('frequency', 8, 1, 40, .1), folds = b.param('folds', 5, 1, 12, 1);
            b.osc(frequency, .045, 1.4).modulate(b.noise(2.8, .12), .22).rotate(0, .04).kaleid(folds).color(.8, .65, 1.3).out();
        }],
    ['glass-garden', 'color', `# Cellular color, folded into a glass garden
cells = param("cells", 6.0, min: 2.0, max: 16.0, step: 0.1)

voronoi(cells, 0.22, 0.75)
  .modulate(osc(4.0, 0.05, 0.7), 0.12)
  .kaleid(8)
  .hue(time * 0.025)
  .contrast(1.4)
  .out
`, (b) => { const p = b.param('cells', 6, 2, 16, .1); b.voronoi(p, .22, .75).modulate(b.osc(4, .05, .7), .12).kaleid(8).hue(e('mul', e('time'), .025)).contrast(1.4).out(); }],
    ['orbital-bloom', 'geometry', `# Transparent polygons, repeated and gently distorted
shape(7, 0.23, 0.015)
  .repeat(4, 3)
  .rotate(0.0, 0.12)
  .color(0.12, 0.9, 0.72)
  .modulate(noise(3, 0.1), 0.18)
  .out
`, (b) => b.shape(7, .23, .015).repeat(4, 3).rotate(0, .12).color(.12, .9, .72).modulate(b.noise(3, .1), .18).out()],
    ['feedback-tunnel', 'feedback', `# src(o0) samples the PREVIOUS frame; clear buffers to restart
memory = param("memory", 0.94, min: 0.5, max: 0.99, step: 0.01)

src(o0)
  .scale(1.015)
  .rotate(0.012)
  .blend(osc(7, 0.06, 1.8).kaleid(5), 1.0 - memory)
  .saturate(1.01)
  .out(o0)
`, (b) => { const p = b.param('memory', .94, .5, .99, .01); b.src(0).scale(1.015).rotate(.012).blend(b.osc(7, .06, 1.8).kaleid(5), e('sub', 1, p)).saturate(1.01).out(); }],
    ['neon-lattice', 'geometry', `# A simple geometry chain becomes a colored lattice
shape(4, 0.27, 0.012)
  .repeat(7, 5)
  .rotate(0.785, 0.025)
  .mult(osc(4, 0.08, 1.8).rotate(0.6))
  .out
`, (b) => b.shape(4, .27, .012).repeat(7, 5).rotate(.785, .025).mult(b.osc(4, .08, 1.8).rotate(.6)).out()],
    ['mouse-mirror', 'interaction', `# Pointer x/y are normalized 0..1; y increases upward
osc(mouse.x * 24.0 + 2.0, 0.04, 1.7)
  .modulate(noise(3, 0.1), mouse.y * 0.6)
  .kaleid(6)
  .color(0.65, 1.0, 1.2)
  .out
`, (b) => b.osc(e('add', e('mul', e('mouse_x'), 24), 2), .04, 1.7).modulate(b.noise(3, .1), e('mul', e('mouse_y'), .6)).kaleid(6).color(.65, 1, 1.2).out()],
    ['two-signals', 'feedback', `# Four outputs are available. All src reads are one frame delayed.
noise(4, 0.18)
  .color(0.2, 0.8, 1.0)
  .out(o1)

osc(9, 0.08, 1.2)
  .modulate(src(o1), 0.4)
  .kaleid(4)
  .out(o0)

render(o0)
`, (b) => { b.noise(4, .18).color(.2, .8, 1).out(1); b.osc(9, .08, 1.2).modulate(b.src(1), .4).kaleid(4).out(); }],
    ['ink-contours', 'color', `# Posterized, moving topographic contours
levels = param("levels", 6.0, min: 2.0, max: 16.0, step: 1.0)

noise(5, 0.12)
  .posterize(levels, 0.8)
  .color(0.85, 0.96, 1.0)
  .contrast(1.6)
  .out
`, (b) => { const p = b.param('levels', 6, 2, 16, 1); b.noise(5, .12).posterize(p, .8).color(.85, .96, 1).contrast(1.6).out(); }],
    ['molten-prism', 'color', `# Hue is a live expression, not a Crystal per-frame callback
voronoi(4.2, 0.3, 0.85)
  .modulate(noise(3.4, 0.15), 0.35)
  .colorama(time * 0.03)
  .rotate(0.0, 0.03)
  .out
`, (b) => b.voronoi(4.2, .3, .85).modulate(b.noise(3.4, .15), .35).colorama(e('mul', e('time'), .03)).rotate(0, .03).out()],
    ['breathing-rings', 'interaction', `# Signals support sin, cos, map, clamp and arithmetic
radius = (time * 0.7).sin.map(-1.0, 1.0, 0.16, 0.38)

circle(radius, 0.015)
  .diff(circle(radius * 0.85, 0.015))
  .mult(gradient(0.08))
  .repeat(3, 2)
  .out
`, (b) => { const s = e('sin', e('mul', e('time'), .7)); const radius = e('add', .16, e('mul', e('div', e('sub', s, -1), e('sub', 1, -1)), e('sub', .38, .16))); b.circle(radius, .015).diff(b.circle(e('mul', radius, .85), .015)).mult(b.gradient(.08)).repeat(3, 2).out(); }],
    ['crystal-petals', 'geometry', `# This is real Crystal: methods, loops and Math all work.
def petals(count : Int32)
  texture = solid(0, 0, 0)
  count.times do |i|
    texture = texture.add(shape(3, 0.24, 0.008).rotate(i * Math::PI / count))
  end
  texture
end

petals(7)
  .mult(osc(4, 0.04, 1.6))
  .rotate(0.0, 0.08)
  .out
`, (b) => { let p = b.solid(0, 0, 0); for (let i = 0; i < 7; i++)
            p = p.add(b.shape(3, .24, .008).rotate(i * Math.PI / 7)); p.mult(b.osc(4, .04, 1.6)).rotate(0, .08).out(); }],
    ['afterimage', 'feedback', `# A moving rectangle leaves a fading trail
fresh = rect(0.32, 0.1, 0.015)
  .rotate(time * 0.6)
  .color(0.12, 0.8, 1.0)

src(o0)
  .scale(1.006)
  .brightness(-0.008)
  .layer(fresh)
  .out
`, (b) => { const fresh = b.rect(.32, .1, .015).rotate(e('mul', e('time'), .6)).color(.12, .8, 1); b.src().scale(1.006).brightness(-.008).layer(fresh).out(); }],
];
await mkdir(path.join(root, 'web/presets'), { recursive: true });
const manifest = [];
for (const [id, category, source, make] of samples) {
    const b = builder();
    make(b);
    await writeFile(path.join(root, 'examples', `${id}.cr`), source);
    await writeFile(path.join(root, 'web/presets', `${id}.json`), JSON.stringify(b.graph, null, 2) + '\n');
    manifest.push({ id, category, source: `examples/${id}.cr`, preview: `presets/${id}.json` });
}
await writeFile(path.join(root, 'examples/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${samples.length} original examples and fixed gallery previews.`);
