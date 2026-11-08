import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateGraph, parseProgramOutput, graphStats, LIMITS, SENTINEL } from '../web/js/graph.js';
import { createFragmentShader, signalGLSL } from '../web/js/shader.js';
import { createShareURL, readSharedSource } from '../web/js/share.js';
import { OPERATIONS } from '../web/js/operations.js';
const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const manifest = await read('../examples/manifest.json');
const base = await read('../web/presets/chromatic-tide.json');
const copy = () => structuredClone(base);
for (const example of manifest)
    test(`preset validates and generates GLSL: ${example.id}`, async () => {
        const graph = await read(`../web/${example.preview}`);
        assert.deepEqual(validateGraph(graph), graph);
        assert.ok(createFragmentShader(graph).includes('#version 300 es'));
        assert.ok(graphStats(graph).passes >= 1);
    });
test('schema has 36 unique operations', () => { assert.equal(OPERATIONS.length, 36); assert.equal(new Set(OPERATIONS.map(op => op.name)).size, 36); });
for (const [name, mutate] of [
    ['version', g => g.version = 99],
    ['unknown shader op', g => g.nodes[0].op = 'eval'],
    ['missing arguments', g => g.nodes[0].args = []],
    ['non-finite literal', g => g.nodes[1].args[0] = { op: 'const', value: Infinity }],
    ['oversized literal', g => g.nodes[1].args[0] = { op: 'const', value: 1e20 }],
    ['cycle', g => g.nodes[2].inputs = [2, 1]],
    ['missing output', g => g.outputs = [null, null, null, null]],
    ['bad output id', g => g.outputs[0] = 999],
    ['undefined parameter', g => g.nodes[0].args[0] = { op: 'param', key: 'missing' }],
    ['GLSL injection in parameter', g => g.params[0].key = 'x);discard;'],
    ['invalid range', g => g.params[0].max = g.params[0].min],
    ['invalid step', g => g.params[0].step = 0],
    ['duplicate params', g => g.params.push(g.params[0])],
    ['signal code injection', g => g.nodes[0].args[0] = { op: 'raw', value: 'discard;' }],
    ['too many nodes', g => g.nodes = Array(129).fill(g.nodes[1])],
])
    test(`rejects invalid graph: ${name}`, () => { const g = copy(); mutate(g); assert.throws(() => validateGraph(g)); });
test('expression recursion is bounded', () => {
    const g = copy();
    let value = { op: 'const', value: 1 };
    for (let i = 0; i < 40; i++)
        value = { op: 'sin', args: [value] };
    g.nodes[0].args[0] = value;
    assert.throws(() => validateGraph(g));
});
test('graph expansion work is bounded', () => {
    const g = { version: 1, nodes: [{ op: 'solid', args: [1, 0, 0, 1].map(value => ({ op: 'const', value })), inputs: [] }], outputs: [null, null, null, null], params: [], display: 0 };
    for (let i = 1; i < 20; i++)
        g.nodes.push({ op: 'blend', args: [{ op: 'const', value: .5 }], inputs: [i - 1, i - 1] });
    g.outputs[0] = 19;
    assert.throws(() => validateGraph(g));
});
test('stdout graph framing keeps ordinary logs', () => { const out = parseProgramOutput(`hello\n${SENTINEL}${JSON.stringify(base)}\n`); assert.deepEqual(out.graph, base); assert.equal(out.log, 'hello'); });
test('stdout requires one graph marker', () => { assert.throws(() => parseProgramOutput('hello')); assert.throws(() => parseProgramOutput(`${SENTINEL}{}\n${SENTINEL}{}\n`)); });
test('stdout rejects malformed JSON and output flooding', () => { assert.throws(() => parseProgramOutput(SENTINEL + 'oops')); assert.throws(() => parseProgramOutput('x'.repeat(LIMITS.graphBytes + 1))); });
test('share round-trip includes Unicode and project path', async () => {
    const source = '# 日本語 ∑ русский\nosc(5).out\n';
    const url = new URL(await createShareURL(source, 'https://example.org/project/?test=1', 'ja'));
    assert.equal(url.pathname, '/project/');
    assert.equal(url.search, '?lang=ja');
    assert.equal(await readSharedSource(url.hash), source);
});
test('large repetitive source uses gzip', async () => { const source = '# example\n'.repeat(1000); const url = new URL(await createShareURL(source, 'https://example.org/', 'en')); assert.ok(url.hash.startsWith('#z=')); assert.equal(await readSharedSource(url.hash), source); });
test('share rejects oversized source and ambiguous encodings', async () => { await assert.rejects(createShareURL('x'.repeat(65537), 'https://example.org/', 'en')); await assert.rejects(readSharedSource('#s=YQ&z=Yg')); await assert.rejects(readSharedSource('#s=<script>')); await assert.rejects(readSharedSource('#z=AAAA')); });
test('gzip expansion is bounded', async () => {
    const data = new Uint8Array(await new Response(new Blob(['x'.repeat(100000)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const b64 = Buffer.from(data).toString('base64url');
    await assert.rejects(readSharedSource('#z=' + b64), /64 KiB/);
});
test('empty or unrelated hash does not run code', async () => { assert.equal(await readSharedSource(''), null); assert.equal(await readSharedSource('#help'), null); assert.equal(await readSharedSource('#s='), ''); });
