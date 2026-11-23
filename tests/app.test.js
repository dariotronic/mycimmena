// Controlli propri dell'app (non presi dal sito): versione allineata, Impostazioni, avvio e niente più server o login.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { APP_VERSION, CREDIT_HANDLE, CREDIT_URL } from '../www/assets/js/app-info.js';
import { contentType, escapeHtml, meetingMovies, movieName } from '../www/assets/js/domain.js';
import { createViews } from '../www/assets/js/views.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const webFiles = () => [
	'../www/index.html', '../www/script.js', '../www/style.css',
	...readdirSync(new URL('../www/assets/js/', import.meta.url)).map(name => `../www/assets/js/${name}`)
];

test('keeps the app version aligned in app-info.js, package.json and build.gradle', () => {
	const pkg = JSON.parse(read('../package.json'));
	const gradle = read('../android/app/build.gradle');
	assert.equal(pkg.version, APP_VERSION);
	assert.match(gradle, new RegExp(`versionName "${APP_VERSION.replace(/\./g, '\\.')}"`));
});

test('uses the agreed Android identity and the minimum SDK of Capacitor', () => {
	const config = JSON.parse(read('../capacitor.config.json'));
	assert.equal(config.appId, 'it.mycimmena.app');
	assert.equal(config.appName, 'myCimmena');
	assert.equal(config.webDir, 'www');
	assert.match(read('../android/variables.gradle'), /minSdkVersion = 24/);
});

test('shows the theme switch, the version and the credit in Settings', () => {
	const views = createViews({
		getData: () => ({ upcoming: null, archive: [], movies: [] }),
		contentType, escapeHtml, meetingMovies, movieName,
		emptyState: message => message, formatDate: value => value, infoButton: () => '', movieDetails: () => '',
		poster: () => '', selectableMovies: () => [], titleWithInfo: (_movie, title) => title, today: () => '2026-11-22'
	});
	const html = views.renderSettings();
	assert.match(html, /<h1>Impostazioni<\/h1>/);
	assert.match(html, /role="switch"[^>]*data-theme-toggle/);
	assert.match(html, new RegExp(`myCimmena ${APP_VERSION.replace(/\./g, '\\.')}`));
	assert.equal(CREDIT_HANDLE, '@dariotronic');
	assert.equal(CREDIT_URL, 'https://www.instagram.com/dariotronic/');
	assert.match(html, /<p class="app-credit">made with 🎬 by <a href="https:\/\/www\.instagram\.com\/dariotronic\/" target="_blank" rel="noopener noreferrer">@dariotronic<\/a><\/p>/);
	// Il credit sta in fondo, dopo tutte le impostazioni.
	assert.ok(html.indexOf('app-credit') > html.lastIndexOf('profile-setting-row'));
	assert.doesNotMatch(html, /Accedi|password|Esci|push/);
});

test('checks the WebView before the app starts and applies the saved theme first', () => {
	const page = read('../www/index.html');
	const boot = read('../www/assets/js/boot.js');
	// boot.js è uno script classico in <head>, prima del CSS e molto prima di script.js (modulo).
	assert.ok(page.indexOf('<script src="assets/js/boot.js"></script>') < page.indexOf('<link rel="stylesheet" href="style.css">'));
	assert.match(page, /<script type="module" src="script\.js"><\/script>/);
	assert.doesNotMatch(page, /type="importmap"/);
	assert.match(boot, /CSS\.supports\('selector\(:has\(a\)\)'\)/);
	assert.match(boot, /CSS\.supports\('container-type: inline-size'\)/);
	assert.match(boot, /CSS\.supports\('height: 1dvh'\)/);
	assert.match(page, /<div id="webview-too-old" class="webview-too-old" hidden>/);
	assert.match(read('../www/style.css'), /html\[data-webview-too-old="true"\] \.site-shell \{ display: none; \}/);
	assert.doesNotMatch(boot, /=>|\blet\b|\bconst\b/, 'boot.js deve girare anche su WebView vecchie');
});

test('declares a strict Content Security Policy without inline scripts', () => {
	const page = read('../www/index.html');
	const csp = page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
	assert.ok(csp);
	assert.match(csp, /script-src 'self';/);
	assert.match(csp, /object-src 'none'/);
	assert.doesNotMatch(page, /<script>(?!<\/script>)|<script nonce/);
});

test('has no server calls, login, push or social features left', () => {
	for (const file of webFiles()) {
		const source = read(file);
		assert.doesNotMatch(source, /hasDeviceAuthorization|device-token|X-Edit-Token|serviceWorker|PushManager|added_by|reaction-picker|data-reply-form|clubdelcimmena-/, `${file} contiene ancora codice del sito`);
		assert.doesNotMatch(source, /api\/[a-z-]+\.php|apiRequest/, `${file} chiama ancora il server del sito`);
	}
});

test('handles the Android back button: dialog, then menu, then previous view, then background', () => {
	const source = read('../www/assets/js/back-button.js');
	assert.match(read('../www/script.js'), /initBackButton\(\{ closeMenu: navigation\.closeMenu, onBack: \(\) => onboarding\.handleBack\(\) \}\)/);
	// Durante l'onboarding il tasto torna al passaggio precedente, prima di tutto il resto.
	assert.match(source, /if \(onBack\(\)\) return;/);
	assert.ok(JSON.parse(read('../package.json')).dependencies['@capacitor/app']);
	const order = ["dialog[open]", 'closeMenu()', 'history.back()', 'minimizeApp()'].map(text => source.indexOf(text));
	assert.ok(order.every(index => index >= 0) && order.every((index, i) => !i || index > order[i - 1]));
	// La chiusura passa dall'evento cancel, che i moduli annullano per non perdere un testo non salvato.
	assert.match(source, /new Event\('cancel', \{ cancelable: true \}\)[\s\S]*if \(dialog\.dispatchEvent\(cancel\)\) dialog\.close\(\);/);
});

test('matches the Android system bars to the app theme', () => {
	const source = read('../www/assets/js/theme.js');
	assert.match(source, /SystemBars[\s\S]*setStyle\(\{ style: isNight \? 'DARK' : 'LIGHT' \}\)/);
	assert.match(source, /function setColorMode[\s\S]*syncSystemBars\(isNight\)/);
});
