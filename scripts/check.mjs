import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let count = 0;
async function visit(directory) {
    for (const item of await readdir(path.join(root, directory), { withFileTypes: true })) {
        const name = path.join(directory, item.name);
        if (item.isDirectory())
            await visit(name);
        else if (/\.(?:mjs|js)$/.test(name)) {
            const r = spawnSync(process.execPath, ['--check', name], { cwd: root, encoding: 'utf8' });
            if (r.status !== 0)
                throw new Error(`${name}: ${r.stderr}`);
            count++;
        }
        else if (name.endsWith('.json'))
            JSON.parse(await readFile(path.join(root, name), 'utf8'));
    }
}
for (const directory of ['web', 'scripts', 'test', 'schema', 'examples'])
    await visit(directory);
const generated = spawnSync(process.execPath, ['scripts/generate.mjs', '--check'], { cwd: root, stdio: 'inherit' });
if (generated.status !== 0)
    process.exit(generated.status ?? 1);
console.log(`Checked syntax of ${count} JavaScript modules and all project JSON files.`);
