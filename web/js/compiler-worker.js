import { LIMITS, parseProgramOutput } from './graph.js';
import { COMPILER_OPTIONS } from './compiler-options.js';
let compiler, sourceFiles, config;
let active = false;
let requestId;
const send = (data) => self.postMessage({ id: requestId, ...data });
async function json(url) {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`Cannot load ${new URL(url, self.location.href).pathname} (${response.status}). Run npm ci && npm run build, and serve dist over HTTP.`);
    return response.json();
}
async function initialize() {
    if (compiler)
        return;
    send({ type: 'status', stage: 'loading' });
    config ??= await json(new URL('../compiler-config.json', import.meta.url));
    sourceFiles ??= await json(new URL('../dsl.json', import.meta.url));
    const entry = new URL(config.entry, new URL('../', import.meta.url));
    const assets = new URL(config.assets, new URL('../', import.meta.url));
    // Configuration is built by the maintainer, not supplied by a sketch or URL.
    if (entry.origin !== self.location.origin && entry.origin !== 'https://cdn.jsdelivr.net')
        throw new Error('Untrusted compiler origin.');
    if (assets.origin !== entry.origin)
        throw new Error('Compiler assets must share the compiler origin.');
    const { createCompiler } = await import(entry.href);
    compiler = await createCompiler({
        ...COMPILER_OPTIONS,
        baseUrl: assets.href,
        onProgress: (fraction) => send({ type: 'progress', fraction }),
        onStatus: (detail) => {
            const stage = ['compiling', 'linking', 'instrumenting', 'running'].includes(detail) ? detail : 'loading';
            send({ type: 'status', stage, detail: String(detail).slice(0, 240) });
        },
    });
}
self.onmessage = async ({ data }) => {
    if (!data || data.type !== 'compile' || active)
        return;
    active = true;
    requestId = data.id;
    try {
        if (typeof data.source !== 'string' || new TextEncoder().encode(data.source).length > LIMITS.sourceBytes)
            throw new Error('Source exceeds 64 KiB.');
        await initialize();
        let outputSize = 0;
        const result = await compiler.run('require "./plankton"\nrequire "./sketch"\nPlankton.emit\n', '', {
            files: { ...sourceFiles, 'sketch.cr': data.source },
            onOutput: (text) => {
                outputSize += new TextEncoder().encode(text).length;
                if (outputSize > LIMITS.graphBytes)
                    throw new Error('Sketch output exceeds 1 MiB.');
            },
        });
        if (!result.ok || result.exitCode !== 0) {
            const diagnostics = Array.isArray(result.errors) ? result.errors.join('\n') : String(result.errors ?? '');
            throw new Error(diagnostics || result.stderr || result.output || `Sketch exited with code ${result.exitCode}.`);
        }
        const { graph, log } = parseProgramOutput(result.stdout);
        send({ type: 'result', graph, log: [log, result.stderr].filter(Boolean).join('\n'), compileMs: result.compileMs, runMs: result.runMs });
    }
    catch (error) {
        send({ type: 'error', message: String(error?.message ?? error).slice(0, 30000) });
    }
    finally {
        active = false;
    }
};
