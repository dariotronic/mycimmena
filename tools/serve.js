// Server statico minimo per provare www/ nel browser senza compilare l'APK: `npm run serve`, poi http://localhost:8080.
// Le funzioni native di Capacitor non ci sono: dove serve, l'app usa i sostituti web.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(new URL('../www', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const port = Number(process.env.PORT) || 8080;
const types = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
	'.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8'
};

createServer(async (request, response) => {
	const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
	const file = normalize(join(root, path === '/' ? 'index.html' : path));
	if (!file.startsWith(root)) {
		response.writeHead(403).end();
		return;
	}
	try {
		const body = await readFile(file);
		response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
		response.end(body);
	} catch {
		response.writeHead(404).end('Non trovato');
	}
}).listen(port, () => console.log(`myCimmena su http://localhost:${port}`));
