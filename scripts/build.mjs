import { cp, mkdir, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { COMPILER_OPTIONS } from '../web/js/compiler-options.js';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cdn = process.argv.includes('--cdn');
const target = path.join(root, 'dist');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const { version, repository, commit } = pkg.crystalWasm;
const source = { repository, commit };
const packageUrl = pkg.dependencies['@live-codes/crystal-wasm'];
const compiler = path.join(root, 'node_modules/@live-codes/crystal-wasm');
if (!cdn) {
    try {
        const installed = JSON.parse(await readFile(path.join(compiler, 'package.json'), 'utf8'));
        if (installed.version !== version)
            throw new Error('Compiler version does not match package.json.');
        await stat(path.join(compiler, 'assets/crystal'));
        await stat(path.join(compiler, 'src/index.js'));
        await stat(path.join(compiler, 'assets/crystal/gc/libgc.a.gz'));
        await stat(path.join(compiler, 'assets/crystal/gc/binaryen.mjs.gz'));
    }
    catch (error) {
        throw new Error(`Install the pinned compiler with npm ci before building. No implicit CDN fallback is used. ${error.message}`);
    }
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(path.join(root, 'web'), target, { recursive: true });
await cp(path.join(root, 'examples'), path.join(target, 'examples'), { recursive: true });
const files = {};
async function walk(directory, prefix = '') {
    for (const item of await readdir(directory, { withFileTypes: true })) {
        const relative = prefix + item.name;
        if (item.isDirectory())
            await walk(path.join(directory, item.name), relative + '/');
        else if (item.name.endsWith('.cr'))
            files[relative] = await readFile(path.join(directory, item.name), 'utf8');
    }
}
await walk(path.join(root, 'src'));
await writeFile(path.join(target, 'dsl.json'), JSON.stringify(files));
const base = cdn ? `https://cdn.jsdelivr.net/gh/${repository}@${commit}/packages/crystal-wasm/` : './vendor/crystal/';
await writeFile(path.join(target, 'compiler-config.json'), JSON.stringify({
    mode: cdn ? 'cdn' : 'local', version, source, ...COMPILER_OPTIONS,
    entry: `${base}src/index.js`, assets: `${base}assets/crystal/`,
}, null, 2));
if (!cdn) {
    await mkdir(path.join(target, 'vendor'), { recursive: true });
    // Keep compiler modules, WASI/GC assets and all license notices together.
    await cp(compiler, path.join(target, 'vendor/crystal'), { recursive: true });
}
for (const name of ['LICENSE', 'README.md'])
    await cp(path.join(root, name), path.join(target, name));
await writeFile(path.join(target, '.nojekyll'), '');
await writeFile(path.join(target, 'build.json'), JSON.stringify({ app: pkg.version, compiler: version, compilerSource: source, packageUrl, ...COMPILER_OPTIONS, mode: cdn ? 'cdn' : 'local' }));
console.log(`Built dist (${cdn ? 'explicit CDN compiler; network required on Run' : 'same-origin compiler and assets'}).`);
