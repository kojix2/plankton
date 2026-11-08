import { OPERATIONS } from './operations.js';
export const LIMITS = Object.freeze({ sourceBytes: 65536, graphBytes: 1048576, nodes: 128, params: 16, depth: 32, signals: 4096, work: 2048 });
export const SENTINEL = '__HYDRA_CRYSTAL_GRAPH_V1__';
const definitions = new Map(OPERATIONS.map((op) => [op.name, op]));
definitions.set('src', { inputs: 0, args: [{ name: 'output' }] });
definitions.set('input', { inputs: 0, args: [{ name: 'slot' }] });
const arities = new Map([
    ['time', 0], ['frame', 0], ['mouse_x', 0], ['mouse_y', 0],
    ['delta', 0], ['beat', 0], ['audio_level', 0],
    ['neg', 1], ['sin', 1], ['cos', 1], ['abs', 1], ['floor', 1], ['fract', 1], ['sqrt', 1],
    ['add', 2], ['sub', 2], ['mul', 2], ['div', 2], ['pow', 2], ['min', 2], ['max', 2],
    ['clamp', 3], ['mix', 3],
]);
const fail = (path, reason) => { throw new Error(`${path}: ${reason}`); };
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9;
const int = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
/** Validate untrusted WASI output. No strings from a sketch become shader code. */
export function validateGraph(input) {
    if (!record(input) || input.version !== 1)
        fail('graph', 'unsupported graph version');
    if (!Array.isArray(input.nodes) || input.nodes.length < 1 || input.nodes.length > LIMITS.nodes)
        fail('nodes', 'expected 1–128 nodes');
    if (!Array.isArray(input.params) || input.params.length > LIMITS.params)
        fail('params', 'too many or missing parameters');
    const keys = new Set();
    const params = input.params.map((p, i) => {
        const at = `params[${i}]`;
        if (!record(p) || typeof p.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(p.key))
            fail(at, 'invalid parameter name');
        if (keys.has(p.key))
            fail(at, 'duplicate parameter');
        if (![p.value, p.min, p.max, p.step].every(finite) || !(p.min < p.max) || p.step <= 0 || p.value < p.min || p.value > p.max)
            fail(at, 'invalid range, value or step');
        keys.add(p.key);
        return { key: p.key, value: p.value, min: p.min, max: p.max, step: p.step };
    });
    let signalCount = 0;
    function signal(expr, depth, at) {
        if (++signalCount > LIMITS.signals || depth > LIMITS.depth)
            fail(at, 'signal expression is too large');
        if (!record(expr) || typeof expr.op !== 'string')
            fail(at, 'invalid signal');
        if (expr.op === 'const') {
            if (!finite(expr.value))
                fail(at, 'invalid numeric constant');
            return { op: 'const', value: expr.value };
        }
        if (expr.op === 'param') {
            if (!keys.has(expr.key))
                fail(at, 'undefined parameter');
            return { op: 'param', key: expr.key };
        }
        if (expr.op === 'fft') {
            if (!int(expr.value, 0, 31))
                fail(at, 'FFT requires a constant band index 0–31');
            return { op: 'fft', value: expr.value };
        }
        const arity = arities.get(expr.op);
        const args = expr.args ?? [];
        if (arity === undefined || !Array.isArray(args) || args.length !== arity)
            fail(at, 'unknown signal or wrong arity');
        const result = { op: expr.op };
        if (args.length)
            result.args = args.map((x, i) => signal(x, depth + 1, `${at}.args[${i}]`));
        return result;
    }
    const depths = [], costs = [];
    const nodes = input.nodes.map((n, index) => {
        const at = `nodes[${index}]`;
        if (!record(n))
            fail(at, 'invalid node');
        const def = definitions.get(n.op);
        if (!def)
            fail(at, 'unknown texture operation');
        if (!Array.isArray(n.inputs) || n.inputs.length !== def.inputs)
            fail(at, 'wrong number of inputs');
        if (!n.inputs.every((id) => int(id, 0, index - 1)))
            fail(at, 'inputs must reference earlier nodes');
        if (!Array.isArray(n.args) || n.args.length !== def.args.length)
            fail(at, 'wrong number of arguments');
        const args = n.args.map((x, i) => signal(x, 0, `${at}.args[${i}]`));
        if (n.op === 'src' && (args[0].op !== 'const' || !int(args[0].value, 0, 3)))
            fail(at, 'src requires a constant output index 0–3');
        if (n.op === 'input' && (args[0].op !== 'const' || !int(args[0].value, 0, 3)))
            fail(at, 'input requires a constant slot index 0–3');
        depths[index] = 1 + Math.max(0, ...n.inputs.map((id) => depths[id]));
        costs[index] = 1 + n.inputs.reduce((sum, id) => sum + costs[id], 0);
        if (depths[index] > 48 || costs[index] > LIMITS.work)
            fail(at, 'texture graph is too expensive');
        return { op: n.op, args, inputs: [...n.inputs] };
    });
    if (!Array.isArray(input.outputs) || input.outputs.length !== 4 || !input.outputs.some((id) => id !== null))
        fail('outputs', 'expected four output slots and at least one .out');
    if (!input.outputs.every((id) => id === null || int(id, 0, nodes.length - 1)))
        fail('outputs', 'invalid output node');
    if (!int(input.display, 0, 3))
        fail('display', 'expected an output index 0–3');
    const cost = input.outputs.reduce((sum, id) => sum + (id === null ? 0 : costs[id]), 0);
    if (cost > LIMITS.work)
        fail('outputs', 'combined rendering work is too large');
    return { version: 1, nodes, outputs: [...input.outputs], display: input.display, params };
}
export function parseProgramOutput(stdout) {
    if (typeof stdout !== 'string' || new TextEncoder().encode(stdout).length > LIMITS.graphBytes)
        throw new Error('Sketch output exceeds 1 MiB.');
    const lines = stdout.split(/\r?\n/);
    const matches = lines.filter((line) => line.startsWith(SENTINEL));
    if (matches.length !== 1)
        throw new Error('The sketch did not emit exactly one graph. End a texture chain with .out; do not call Hydra.emit yourself.');
    const graph = validateGraph(JSON.parse(matches[0].slice(SENTINEL.length)));
    return { graph, log: lines.filter((line) => !line.startsWith(SENTINEL)).join('\n').trim() };
}
export function graphStats(graph) {
    const costs = graph.nodes.map(() => 0);
    graph.nodes.forEach((node, i) => { costs[i] = 1 + node.inputs.reduce((sum, id) => sum + costs[id], 0); });
    return { nodes: graph.nodes.length, passes: graph.outputs.filter((x) => x !== null).length,
        work: graph.outputs.reduce((sum, id) => sum + (id === null ? 0 : costs[id]), 0) };
}
