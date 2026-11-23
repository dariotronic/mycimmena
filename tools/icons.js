// Icona dell'app (PIANO.md, §13 e §18): il rapace di myCimmena (proposta A, "Sagoma": la sagoma del rapace del Club
// semplificata in poche curve, con occhio e taglio del becco vuoti), color carta su rosso velluto.
// Rigenera tutte le immagini da www/assets/logo-my.svg:
//   node tools/icons.js
// - www/assets/favicon/               favicon.svg e web-app-manifest-512x512.png
// - android/.../mipmap-*/              icona adattiva (primo piano trasparente + sfondo rosso), icone classiche e tonde
// - android/.../drawable*/splash.png  schermata di avvio fino ad Android 11 (dal 12 la disegna Android con l'icona)
// Le PNG le disegna Chrome senza finestra (CHROME_PATH, o il percorso standard di Windows) via DevTools Protocol.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const res = join(root, 'android/app/src/main/res');
export const PAPER = '#f8f2ef';
export const VELVET = '#8a1f2d';
// Nel file il rapace è color inchiostro: per le icone diventa color carta.
export const INK = '#2b1419';
export const tintLogo = (svg, color) => svg.replace(INK, color);

// Pagina con il rapace al centro: share = quota del lato corto occupata dal disegno; shape = 'none' | 'square' | 'round'.
const page = (logo, { background, share, shape = 'none' }) => `<!doctype html><html><head><style>
html,body{margin:0;width:100%;height:100%;background:transparent}
.bg{position:fixed;inset:0;background:${background};${shape === 'round' ? 'border-radius:50%;' : shape === 'square' ? 'border-radius:16%;' : ''}}
img{position:fixed;left:50%;top:50%;width:${share * 100}vmin;height:${share * 100}vmin;object-fit:contain;transform:translate(-50%,-48%)}
</style></head><body><div class="bg"></div><img src="data:image/svg+xml;base64,${Buffer.from(logo).toString('base64')}"></body></html>`;

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

function targets(logo) {
	const list = [];
	for (const [density, scale] of Object.entries(DENSITIES)) {
		// Icona adattiva: 108 dp, il disegno dentro la zona sicura (66 dp di diametro).
		list.push({ file: `mipmap-${density}/ic_launcher_foreground.png`, width: 108 * scale, height: 108 * scale, html: page(logo, { background: 'transparent', share: 0.46 }) });
		// Icone per i launcher senza icone adattive (Android 7).
		list.push({ file: `mipmap-${density}/ic_launcher.png`, width: 48 * scale, height: 48 * scale, html: page(logo, { background: VELVET, share: 0.66, shape: 'square' }) });
		list.push({ file: `mipmap-${density}/ic_launcher_round.png`, width: 48 * scale, height: 48 * scale, html: page(logo, { background: VELVET, share: 0.6, shape: 'round' }) });
	}
	const splash = { drawable: [480, 320], 'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720], 'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280], 'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280], 'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920] };
	for (const [dir, [width, height]] of Object.entries(splash)) list.push({ file: `${dir}/splash.png`, width, height, html: page(logo, { background: VELVET, share: 0.36 }) });
	list.push({ file: '../../../../../www/assets/favicon/web-app-manifest-512x512.png', width: 512, height: 512, html: page(logo, { background: VELVET, share: 0.64 }) });
	return list;
}

async function render(list) {
	const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
	const profile = mkdtempSync(join(tmpdir(), 'mycimmena-icons-'));
	const port = 9300 + Math.floor(Math.random() * 500);
	const browser = spawn(chrome, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
	try {
		let targetsJson = null;
		for (let i = 0; i < 50 && !targetsJson; i++) {
			try { targetsJson = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
		}
		const ws = new WebSocket(targetsJson.find(target => target.type === 'page').webSocketDebuggerUrl);
		await new Promise(resolve => { ws.onopen = resolve; });
		let id = 0;
		const pending = new Map();
		ws.onmessage = event => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
		const send = (method, params = {}) => new Promise(resolve => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
		await send('Page.enable');
		await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
		for (const target of list) {
			await send('Emulation.setDeviceMetricsOverride', { width: target.width, height: target.height, deviceScaleFactor: 1, mobile: false });
			await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(target.html).toString('base64')}` });
			await new Promise(resolve => setTimeout(resolve, 250));
			const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: target.width, height: target.height, scale: 1 } });
			writeFileSync(join(res, target.file), Buffer.from(shot.result.data, 'base64'));
			console.log(`${target.width}×${target.height}  ${target.file.replace('../../../../../', '')}`);
		}
		ws.close();
	} finally {
		const closed = new Promise(resolve => browser.once('exit', resolve));
		browser.kill();
		await closed;
		// Su Windows Chrome lascia andare i file un attimo dopo: qualche tentativo, poi si lascia stare (è in %TEMP%).
		try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* resta nella cartella temporanea */ }
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const logo = tintLogo(readFileSync(join(root, 'www/assets/logo-my.svg'), 'utf8'), PAPER);
	const [x, y, w, h] = logo.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
	const side = Math.max(w, h) / 0.66;
	writeFileSync(join(root, 'www/assets/favicon/favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}"><rect width="${side}" height="${side}" rx="${side * 0.16}" fill="${VELVET}"/><svg x="${(side - w) / 2}" y="${(side - h) / 2}" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${logo.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg></svg>`);
	writeFileSync(join(res, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<!-- Sfondo dell'icona adattiva e della schermata di avvio: il rosso velluto di myCimmena (tools/icons.js). -->\n<resources>\n    <color name="ic_launcher_background">${VELVET.toUpperCase()}</color>\n</resources>\n`);
	await render(targets(logo));
}
