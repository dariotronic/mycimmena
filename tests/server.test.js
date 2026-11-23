// server/feedback.php provato davvero con il server integrato di PHP (php -S), con la mail scritta su file
// ('dry_run'). Se PHP non c'è (variabile PHP_BIN, `php` nel PATH o XAMPP) il test si salta.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function findPhp() {
	for (const candidate of [process.env.PHP_BIN, 'php', 'C:/xampp/php/php.exe'].filter(Boolean)) {
		try {
			execFileSync(candidate, ['-v'], { stdio: 'ignore' });
			return candidate;
		} catch { /* non c'è */ }
	}
	return null;
}
const php = findPhp();

// PNG di 1×1 pixel, vero.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('feedback.php checks the form, sends one mail with the images and limits 5 reports a day', { skip: !php && 'PHP non disponibile' }, async () => {
	const dir = mkdtempSync(join(tmpdir(), 'mycimmena-feedback-'));
	copyFileSync(new URL('../server/feedback.php', import.meta.url), join(dir, 'feedback.php'));
	writeFileSync(join(dir, 'config.php'), "<?php return ['to' => 'dario@example.com', 'from' => 'noreply@example.com', 'dry_run' => true];");
	const port = 18000 + Math.floor(Math.random() * 1000);
	const server = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', dir], { stdio: 'ignore' });
	const url = `http://127.0.0.1:${port}/feedback.php`;
	try {
		for (let i = 0; i < 50; i++) {
			try { await fetch(url); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
		}
		const post = fields => {
			const form = new FormData();
			for (const [name, value] of Object.entries(fields)) {
				for (const item of [value].flat()) form.append(name, item);
			}
			return fetch(url, { method: 'POST', body: form, headers: { Origin: 'https://localhost' } });
		};

		assert.equal((await fetch(url)).status, 405);
		const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://localhost' } });
		assert.equal(preflight.status, 204);
		assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://localhost');
		const other = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
		assert.equal(other.headers.get('access-control-allow-origin'), null);

		let response = await post({ type: 'bug', message: '  ' });
		assert.equal(response.status, 400);
		assert.match((await response.json()).error, /Scrivi qualcosa/);
		assert.equal((await post({ type: 'boh', message: 'x' })).status, 400);
		assert.equal((await post({ type: 'bug', message: 'x'.repeat(5001) })).status, 400);
		assert.equal((await post({ type: 'bug', message: 'x', email: 'non-una-mail' })).status, 400);
		// Un testo travestito da immagine si rifiuta.
		response = await post({ type: 'bug', message: 'x', 'images[]': new Blob(['non sono una foto'], { type: 'image/jpeg' }) });
		assert.equal(response.status, 400);
		assert.match((await response.json()).error, /JPEG, PNG o WebP/);
		// Campo trappola: "ok" ma nessuna mail.
		response = await post({ type: 'bug', message: 'spam', website: 'http://spam' });
		assert.deepEqual(await response.json(), { ok: true });
		assert.equal(existsSync(join(dir, 'data/last-mail.eml')), false);

		response = await post({ type: 'idea', message: 'Vorrei le statistiche\ncon i grafici', email: 'utente@example.com', tech: 'myCimmena 0.4.0 · Android 16', 'images[]': [new Blob([PNG], { type: 'image/png' }), new Blob([PNG], { type: 'image/png' })] });
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { ok: true });
		const mail = readFileSync(join(dir, 'data/last-mail.eml'), 'utf8');
		assert.match(mail, /^To: dario@example\.com/);
		assert.match(mail, /Reply-To: utente@example\.com/);
		assert.match(mail, /From: myCimmena <noreply@example\.com>/);
		assert.equal((mail.match(/Content-Disposition: attachment; filename="immagine-\d\.png"/g) || []).length, 2);
		const text = Buffer.from(mail.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString();
		assert.match(text, /Tipo: Idea/);
		assert.match(text, /Vorrei le statistiche\ncon i grafici/);
		assert.match(text, /myCimmena 0\.4\.0 · Android 16/);
		const subject = mail.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)[1];
		assert.equal(Buffer.from(subject, 'base64').toString(), '[myCimmena] Idea: Vorrei le statistiche con i grafici');

		// Altre 4 vanno, la sesta del giorno no.
		for (let i = 0; i < 4; i++) assert.equal((await post({ type: 'altro', message: `prova ${i}` })).status, 200);
		response = await post({ type: 'altro', message: 'troppe' });
		assert.equal(response.status, 429);
		assert.match((await response.json()).error, /5 segnalazioni oggi/);
		// Sul disco solo l'impronta dell'IP, mai l'indirizzo.
		const files = readFileSync(join(dir, 'data', execFileSync(php, ['-r', `echo basename(glob('${dir.replace(/\\/g, '/')}/data/limit-*.json')[0]);`]).toString()), 'utf8');
		assert.doesNotMatch(files, /127\.0\.0\.1/);
	} finally {
		server.kill();
		rmSync(dir, { recursive: true, force: true });
	}
});

test('feedback.php answers 503 without config and the folder hides everything else', { skip: !php && 'PHP non disponibile' }, async () => {
	const dir = mkdtempSync(join(tmpdir(), 'mycimmena-feedback-'));
	copyFileSync(new URL('../server/feedback.php', import.meta.url), join(dir, 'feedback.php'));
	const port = 19000 + Math.floor(Math.random() * 1000);
	const server = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', dir], { stdio: 'ignore' });
	try {
		let response;
		for (let i = 0; i < 50 && !response; i++) {
			try {
				response = await fetch(`http://127.0.0.1:${port}/feedback.php`, { method: 'POST', body: new FormData() });
			} catch { await new Promise(resolve => setTimeout(resolve, 100)); }
		}
		assert.equal(response.status, 503);
	} finally {
		server.kill();
		rmSync(dir, { recursive: true, force: true });
	}
	const htaccess = readFileSync(new URL('../server/.htaccess', import.meta.url), 'utf8');
	assert.match(htaccess, /<FilesMatch "\^\(\?!feedback\\\.php\$\)">\s*Require all denied/);
	const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
	assert.match(ignore, /server\/config\.php/);
});
