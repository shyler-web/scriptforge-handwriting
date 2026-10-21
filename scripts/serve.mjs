/**
 * Dependency-free static file server for local development.
 * The app uses native ES modules, so it must be served over HTTP rather than
 * opened from the file system.
 *
 *   node scripts/serve.mjs [port]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8000);

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

createServer(async (req, res) => {
    try {
        const { pathname } = new URL(req.url, 'http://localhost');
        const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
        const target = resolve(ROOT, relative || 'index.html');

        if (target !== ROOT && !target.startsWith(ROOT + sep)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Forbidden');
            return;
        }

        const body = await readFile(target);
        res.writeHead(200, {
            'Content-Type': CONTENT_TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        res.end(body);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
    }
}).listen(PORT, () => {
    console.log(`ScriptForge Studio running at http://localhost:${PORT}`);
});
