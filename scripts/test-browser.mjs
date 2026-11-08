import { spawn } from 'node:child_process';
import { mkdtemp, rm, access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { runBrowserSuite } from '../test/browser-suite.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chrome = process.env.CHROME_BIN;
for (const candidate of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (chrome)
        break;
    try {
        await access(candidate);
        chrome = candidate;
    }
    catch { }
}
if (!chrome)
    throw new Error('Set CHROME_BIN to a Chromium/Chrome executable.');
const profile = await mkdtemp(path.join(os.tmpdir(), 'hydra-browser-'));
const { server, url } = await serve({ port: 0, base: '/repository/' }); // Exercise GitHub project-site subpaths.
const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const pending = new Map();
try {
    const browserURL = await new Promise((resolve, reject) => {
        let text = '';
        const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 20000);
        child.once('error', reject);
        child.stderr.on('data', chunk => { text += chunk; const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) {
            clearTimeout(timer);
            resolve(match[1]);
        } });
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited ${code}: ${text.slice(-3000)}`)); });
    });
    let next = 0;
    socket = new WebSocket(browserURL);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    socket.onmessage = ({ data }) => { const message = JSON.parse(data); if (!message.id)
        return; const job = pending.get(message.id); if (!job)
        return; pending.delete(message.id); clearTimeout(job.timer); message.error ? job.reject(new Error(JSON.stringify(message.error))) : job.resolve(message.result); };
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++next; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 240000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const evaluate = async (expression) => {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
        if (result.exceptionDetails)
            throw new Error(result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    await send('Page.navigate', { url: url + '?test=1' }, sessionId);
    let ready = false;
    for (let i = 0; i < 1000; i++) {
        try {
            const state = await evaluate(`({ready:!!window.__hydraTest,failed:document.body?.dataset.failed,log:document.querySelector('#console')?.textContent})`);
            if (state?.failed)
                throw new Error('App failed: ' + state.log);
            if (state?.ready) {
                ready = true;
                break;
            }
        }
        catch (error) {
            if (error.message.startsWith('App failed:'))
                throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (!ready)
        throw new Error('App startup timed out');
    const expression = `(async()=>{
    const manifest=await (await fetch('./examples/manifest.json')).json();const presets={};
    for(const example of manifest)presets[example.id]=await (await fetch('./'+example.preview)).json();
    const modules={renderer:await import('./js/renderer.js'),operations:await import('./js/operations.js'),share:await import('./js/share.js')};
    return await (${runBrowserSuite.toString()})({app:window.__hydraTest,modules,presets,manifest});
  })()`;
    const results = await evaluate(expression);
    console.log(`${results.length} browser checks passed:\n${results.join('\n')}`);
    if (!process.argv.includes('--skip-compiler')) {
        const config = JSON.parse(await readFile(path.join(root, 'dist/compiler-config.json'), 'utf8'));
        if (config.mode !== 'local')
            throw new Error('End-to-end browser compilation requires npm run build (local compiler), not a CDN fixture.');
        const result = await evaluate(`(async()=>{const app=window.__hydraTest;app.editor.value='osc(6).kaleid(4).out';await app.compile();if(document.querySelector('#view-badge').textContent!=='Compiled Crystal')throw new Error(document.querySelector('#console').textContent);app.renderer.pause();return document.querySelector('#console').textContent;})()`);
        console.log('REAL browser Crystal → Wasm → GPU compile:', result);
    }
}
finally {
    for (const job of pending.values())
        clearTimeout(job.timer);
    pending.clear();
    socket?.close();
    child.kill('SIGTERM');
    server.close();
    await new Promise(resolve => setTimeout(resolve, 500));
    await rm(profile, { recursive: true, force: true });
}
