import http from 'node:http';
import path from 'node:path';
import { stat, readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.png': 'image/png', '.svg': 'image/svg+xml', '.cr': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
export async function serve({ root = path.join(project, 'dist'), port = 4173, host = '127.0.0.1', base = '/' } = {}) {
    root = await realpath(root);
    if (!base.startsWith('/') || !base.endsWith('/'))
        throw new Error('Base must start and end with /.');
    const server = http.createServer(async (request, response) => {
        try {
            if (!['GET', 'HEAD'].includes(request.method)) {
                response.writeHead(405);
                response.end();
                return;
            }
            const url = new URL(request.url, 'http://localhost');
            const name = decodeURIComponent(url.pathname);
            if (name === base.slice(0, -1)) {
                response.writeHead(302, { Location: base });
                response.end();
                return;
            }
            if (!name.startsWith(base))
                throw new Error('outside base');
            let filename = path.resolve(root, name.slice(base.length) || 'index.html');
            if (!filename.startsWith(root + path.sep))
                throw new Error('outside root');
            if ((await stat(filename)).isDirectory())
                filename = path.join(filename, 'index.html');
            filename = await realpath(filename);
            if (!filename.startsWith(root + path.sep))
                throw new Error('outside root');
            const data = await readFile(filename);
            response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
            response.end(request.method === 'HEAD' ? undefined : data);
        }
        catch {
            response.writeHead(404, { 'Content-Type': 'text/plain' });
            response.end('Not found');
        }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
    return { server, url: `http://${host}:${server.address().port}${base}` };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { url } = await serve({ port: Number(process.env.PORT || 4173), base: process.env.BASE || '/' });
    console.log(`Hydra / Crystal: ${url}\nCtrl+C to stop. Build first with npm run build (or npm run build:cdn).`);
}
