import test from 'node:test';
import assert from 'node:assert/strict';
import { CompilerClient } from '../web/js/compiler-client.js';
class FakeWorker {
    constructor() { this.terminated = false; globalThis.lastWorker = this; }
    postMessage(data) { this.sent = data; }
    terminate() { this.terminated = true; }
    reply(data) { this.onmessage({ data: { id: this.sent.id, ...data } }); }
}
globalThis.Worker = FakeWorker;
test('compiler client returns results and reuses an idle worker', async () => {
    const client = new CompilerClient();
    const one = client.run('osc().out');
    const worker = globalThis.lastWorker;
    worker.reply({ type: 'result', graph: {} });
    assert.deepEqual((await one).graph, {});
    const two = client.run('noise().out');
    assert.equal(globalThis.lastWorker, worker);
    worker.reply({ type: 'result', graph: { second: true } });
    assert.equal((await two).graph.second, true);
    client.dispose();
});
test('cancel terminates the worker including infinite user execution', async () => { const client = new CompilerClient(); const run = client.run('loop {}'); const rejection = assert.rejects(run, { name: 'AbortError' }); const worker = globalThis.lastWorker; client.cancel(); await rejection; assert.ok(worker.terminated); });
test('late results cannot replace a new request', async () => {
    const client = new CompilerClient();
    const first = client.run('old');
    const rejection = assert.rejects(first, { name: 'AbortError' });
    const old = globalThis.lastWorker;
    const next = client.run('new');
    old.reply({ type: 'result', graph: { stale: true } });
    globalThis.lastWorker.reply({ type: 'result', graph: { fresh: true } });
    assert.equal((await next).graph.fresh, true);
    await rejection;
    client.dispose();
});
test('watchdog terminates an unresponsive compiler', async () => { const client = new CompilerClient({ timeout: 5 }); await assert.rejects(client.run('loop {}'), /exceeded/); assert.ok(globalThis.lastWorker.terminated); });
test('worker failures reject without leaving a pending request', async () => { const client = new CompilerClient(); const promise = client.run('bad'); globalThis.lastWorker.onerror({ message: 'worker crashed', preventDefault() { } }); await assert.rejects(promise, /worker crashed/); assert.equal(client.pending, null); });
test('rejects source before making a worker', async () => { const client = new CompilerClient(); await assert.rejects(client.run('x'.repeat(65537)), /64 KiB/); assert.equal(client.worker, null); });
test('a stale worker messageerror cannot cancel the next request', async () => {
    const client = new CompilerClient();
    const first = client.run('old');
    const rejection = assert.rejects(first, { name: 'AbortError' });
    const old = globalThis.lastWorker;
    const second = client.run('new');
    old.onmessageerror();
    globalThis.lastWorker.reply({ type: 'result', graph: { fresh: true } });
    assert.equal((await second).graph.fresh, true);
    await rejection;
    client.dispose();
});
