import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { serve } from '../scripts/serve.mjs';
async function fixture(run) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'plankton-http-'));
    await writeFile(path.join(root, 'index.html'), '<h1>fixture</h1>');
    await writeFile(path.join(root, 'app.js'), 'export const test = true;');
    const { server, url } = await serve({ root, port: 0, base: '/project/' });
    try {
        await run({ url, root });
    }
    finally {
        await new Promise(resolve => server.close(resolve));
        await rm(root, { recursive: true, force: true });
    }
}
test('HTTP server supports project subpaths and correct module MIME', () => fixture(async ({ url }) => {
    assert.equal(await (await fetch(url)).text(), '<h1>fixture</h1>');
    assert.match((await fetch(url + 'app.js')).headers.get('content-type'), /javascript/);
}));
test('HTTP server rejects paths outside its base and unsupported methods', () => fixture(async ({ url }) => {
    assert.equal((await fetch(new URL('/app.js', url))).status, 404);
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
}));
test('HTTP server implements HEAD and redirects base without slash', () => fixture(async ({ url }) => {
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const redirect = await fetch(url.slice(0, -1), { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/project/');
}));
test('HTTP server cannot escape its root through symlinks', () => fixture(async ({ url, root }) => {
    const outside = path.join(os.tmpdir(), `plankton-outside-${process.pid}.txt`);
    await writeFile(outside, 'private fixture');
    try {
        await symlink(outside, path.join(root, 'escape.txt'));
        assert.equal((await fetch(url + 'escape.txt')).status, 404);
    }
    finally {
        await rm(outside, { force: true });
    }
}));
