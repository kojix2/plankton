import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGraph } from '../web/js/graph.js';
import { createFragmentShader } from '../web/js/shader.js';
import { spectrumBands } from '../web/js/inputs.js';

const c = value => ({ op: 'const', value });
const graph = (op, args) => ({ version: 1, nodes: [{ op, args, inputs: [] }], outputs: [0, null, null, null], display: 0, params: [] });

test('media slots are constant, bounded and cannot inject shader identifiers', () => {
    for (const slot of [0, 1, 2, 3])
        assert.match(createFragmentShader(graph('input', [c(slot)])), new RegExp(`texture\\(u_s${slot},`));
    for (const value of [-1, 4, 0.5, '0);discard;'])
        assert.throws(() => validateGraph(graph('input', [c(value)])));
    assert.throws(() => validateGraph(graph('input', [{ op: 'time' }])));
});

test('FFT band indices are validated before shader generation', () => {
    assert.match(createFragmentShader(graph('solid', [{ op: 'fft', value: 31 }, { op: 'audio_level' }, { op: 'beat' }, c(1)])), /u_fft\[31\]/);
    for (const value of [-1, 32, 0.5, '0];discard;'])
        assert.throws(() => validateGraph(graph('solid', [{ op: 'fft', value }, c(0), c(0), c(1)])));
});

test('logarithmic FFT bands distinguish a low tone from a high tone and silence', () => {
    const sampleRate = 48000, fftSize = 2048;
    const frequency = hz => {
        const bytes = new Uint8Array(fftSize / 2);
        bytes[Math.round(hz * fftSize / sampleRate)] = 255;
        return spectrumBands(bytes, sampleRate, fftSize);
    };
    const peak = bands => Array.from(bands).indexOf(Math.max(...bands));
    const bass = frequency(100), treble = frequency(8000);
    assert.ok(peak(bass) < peak(treble));
    assert.ok(Math.max(...bass) > 0 && Math.max(...treble) > 0);
    assert.ok(Array.from(spectrumBands(new Uint8Array(1024), sampleRate, fftSize)).every(value => value === 0));
    assert.ok(Array.from(spectrumBands(new Uint8Array(1024).fill(255), sampleRate, fftSize)).every(value => value === 1));
});
