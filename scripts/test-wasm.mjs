// This test must actually compile Crystal. Missing dependencies are errors, not
// skips, and preset JSON is never accepted as a substitute for a compiler result.
import { createCompiler } from '@live-codes/crystal-wasm';
import { COMPILER_OPTIONS } from '../web/js/compiler-options.js';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setFlagsFromString } from 'node:v8';
import { parseProgramOutput, validateGraph } from '../web/js/graph.js';
import { OPERATIONS } from '../web/js/operations.js';
import { REFERENCE_SECTIONS } from '../web/js/reference.js';
// A module with one (exnref) -> () type probes exception-reference support.
// Older Node versions need the flag; newer versions enable it and remove the flag.
const exnref = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 1, 105, 0]);
if (!WebAssembly.validate(exnref))
    setFlagsFromString('--experimental-wasm-exnref');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {};
async function sources(directory, prefix = '') {
    for (const item of await readdir(directory, { withFileTypes: true })) {
        if (item.isDirectory())
            await sources(path.join(directory, item.name), prefix + item.name + '/');
        else if (item.name.endsWith('.cr'))
            files[prefix + item.name] = await readFile(path.join(directory, item.name), 'utf8');
    }
}
await sources(path.join(root, 'src'));
const compiler = await createCompiler(COMPILER_OPTIONS);
assert.equal(compiler.gc, COMPILER_OPTIONS.gc);
let count = 0;
try {
    const run = async (source) => compiler.run('require "./plankton"\nrequire "./sketch"\nPlankton.emit\n', '', { files: { ...files, 'sketch.cr': source } });
    const check = async (source) => {
        const result = await run(source);
        assert.equal(result.ok, true, [...(result.errors ?? []), result.stderr].join('\n'));
        assert.equal(result.exitCode, 0);
        count++;
        return parseProgramOutput(result.stdout).graph;
    };
    await check('GC.collect\nraise "GC is inactive" unless GC.prof_stats.gc_no > 0\nraise "GC heap is empty" unless GC.stats.heap_size > 0\nosc.out\n');
    console.log('Generated Wasm uses Boehm GC and reports collection/heap statistics.');
    const manifest = JSON.parse(await readFile(path.join(root, 'examples/manifest.json'), 'utf8'));
    for (const example of manifest) {
        const graph = await check(await readFile(path.join(root, example.source), 'utf8'));
        const expected = JSON.parse(await readFile(path.join(root, 'web', example.preview), 'utf8'));
        assert.deepEqual(graph, expected, `${example.id}: preset differs from actual Crystal/Wasm output`);
        console.log(`Wasm compiled and matched preview: ${example.id}`);
    }
    // Exercise all generated overloads in real Crystal, not only the twelve samples.
    let source = '';
    for (const op of OPERATIONS) {
        source += op.kind === 'source' ? `${op.name}.out\n` : op.kind === 'combine' ? `osc.${op.name}(noise).out\n` : `osc.${op.name}.out\n`;
    }
    validateGraph(await check(source));
    // Type-check and execute every browser reference example in its own method.
    // Reset between examples so their nodes/parameters do not accumulate.
    const reference = REFERENCE_SECTIONS.flatMap(group => group.entries).filter(entry => !entry.native);
    const examples = reference.map((entry, i) =>
        `def reference_${i}\n${entry.example}\nend\nPlankton.reset\nreference_${i}\n`).join('\n');
    validateGraph(await check(examples));
    console.log(`Compiled and executed ${reference.length} reference examples.`);
    await check('n = 2 * time + 1.0 - mouse.y / 2\nosc(n).rotate(sin(time)).out\n');
    await check('osc(lerp(2, 10, time.sin)).out\n');
    const media = await check('src(s0).blend(src(s3), audio.fft(31)).brightness(audio.level).rotate(beat * 0.1 + delta).out\n');
    assert.equal(media.nodes[0].op, 'input');
    assert.equal(media.nodes[1].args[0].value, 3);
    assert.deepEqual(media.nodes[2].args[0], { op: 'fft', value: 31 });
    assert.equal(media.nodes[3].args[0].op, 'audio_level');
    const invalidBand = await run('osc(audio.fft(32)).out');
    assert.equal(invalidBand.ok, false);
    console.log('Crystal rejects out-of-range FFT bands.');
    const invalid = await run('osc("wrong type").out');
    assert.equal(invalid.ok, false);
    console.log('Crystal rejects invalid types.');
    const empty = await run('puts "no graph"');
    assert.equal(empty.ok, false);
    console.log('Runtime rejects missing output.');
    console.log(`${count} actual Crystal/Wasm programs passed, plus three negative checks.`);
}
finally {
    await compiler.dispose();
}
