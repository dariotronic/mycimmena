// Fase 4: modulo delle segnalazioni e notifiche locali (compleanno e serata).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DAILY_LIMIT, FEEDBACK_URL, fitSize, sendFeedback, sentToday, techInfo, validateFeedback } from '../www/assets/js/feedback.js';
import { renderFeedbackForm } from '../www/assets/js/feedback-ui.js';
import { createNotifications, nextBirthday, NOTIFICATION_IDS, plannedNotifications } from '../www/assets/js/notifications.js';
import { APP_VERSION } from '../www/assets/js/app-info.js';

test('shrinks images to 1600 px on the long side, never enlarging them', () => {
	assert.deepEqual(fitSize(4000, 3000), { width: 1600, height: 1200 });
	assert.deepEqual(fitSize(1080, 2400), { width: 720, height: 1600 });
	assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
});

test('checks the report before sending and counts the reports of the last day', () => {
	assert.match(validateFeedback({ type: 'boh', message: 'x' }), /Scegli/);
	assert.match(validateFeedback({ type: 'bug', message: '   ' }), /Scrivi qualcosa/);
	assert.match(validateFeedback({ type: 'bug', message: 'x'.repeat(5001) }), /5000/);
	assert.match(validateFeedback({ type: 'bug', message: 'x', email: 'no' }), /email/);
	assert.match(validateFeedback({ type: 'bug', message: 'x', images: [1, 2, 3, 4] }), /3 immagini/);
	assert.equal(validateFeedback({ type: 'idea', message: 'Bella app', email: 'a@b.it', images: [1] }), '');
	const now = Date.parse('2026-11-23T12:00:00Z');
	assert.equal(sentToday({ feedbackSentAt: ['2026-11-23T08:00:00Z', '2026-11-22T11:00:00Z', 'boh'] }, now).length, 1);
	assert.equal(DAILY_LIMIT, 5);
});

test('describes the phone without any personal data', async () => {
	const device = { getInfo: async () => ({ osVersion: '16', manufacturer: 'HONOR', model: 'DNY-NX9', webViewVersion: '157.0.7000.1', operatingSystem: 'android' }) };
	globalThis.Capacitor = { isNativePlatform: () => true };
	try {
		assert.equal(await techInfo({ mode: 'full', device }), `myCimmena ${APP_VERSION}\nAndroid 16\nTelefono: HONOR DNY-NX9\nWebView: 157.0.7000.1\nSchede: complete`);
	} finally {
		delete globalThis.Capacitor;
	}
	const browser = await techInfo({ mode: 'light', userAgent: 'Mozilla/5.0 (Linux; Android 13; K) Chrome/120.0.0.0 Mobile' });
	assert.equal(browser, `myCimmena ${APP_VERSION}\nAndroid 13\nWebView: 120.0.0.0\nSchede: light`);
	const html = renderFeedbackForm({ tech: browser });
	assert.match(html, /name="type" value="bug" checked/);
	assert.match(html, /maxlength="5000"/);
	assert.match(html, /name="includeTech" checked/);
	assert.match(html, /Vedi cosa viene inviato[\s\S]*Android 13/);
	assert.match(html, /class="feedback-trap" type="text" name="website"/);
});

test('sends the report to feedback.php and reports the server and network errors', async () => {
	assert.equal(FEEDBACK_URL, 'https://www.clubdelcimmena.it/mycimmena/feedback.php');
	let sent;
	const ok = await sendFeedback({ type: 'bug', message: ' Non parte ', email: 'a@b.it', images: [new Blob(['x'], { type: 'image/jpeg' })], tech: 'myCimmena' }, {
		fetchImpl: async (url, options) => { sent = { url, form: options.body }; return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
	});
	assert.equal(ok, true);
	assert.equal(sent.url, FEEDBACK_URL);
	assert.equal(sent.form.get('message'), 'Non parte');
	assert.equal(sent.form.get('website'), '');
	assert.equal(sent.form.getAll('images[]').length, 1);
	assert.equal(sent.form.getAll('images[]')[0].name, 'immagine-1.jpg');
	await assert.rejects(sendFeedback({ type: 'bug', message: 'x' }, { fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ ok: false, error: 'Hai già inviato 5 segnalazioni oggi: riprova domani.' }) }) }), /5 segnalazioni oggi/);
	await assert.rejects(sendFeedback({ type: 'bug', message: 'x' }, { fetchImpl: async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } }) }), /HTTP 502/);
	await assert.rejects(sendFeedback({ type: 'bug', message: 'x' }, { isOnline: () => false }), /Sei offline/);
	await assert.rejects(sendFeedback({ type: 'bug', message: 'x' }, { fetchImpl: async () => { throw new Error('rete'); } }), /non risponde/);
});

test('plans the birthday wishes and the evening reminder at 9', () => {
	const now = new Date(2026, 10, 23, 10, 0);
	assert.deepEqual(nextBirthday('1990-11-23', now), new Date(2027, 10, 23, 9, 0), 'oggi alle 9 è già passato');
	assert.deepEqual(nextBirthday('1990-11-23', new Date(2026, 10, 23, 8, 0)), new Date(2026, 10, 23, 9, 0));
	assert.deepEqual(nextBirthday('1992-02-29', now), new Date(2027, 1, 28, 9, 0), '29 febbraio negli anni non bisestili');
	assert.equal(nextBirthday('', now), null);
	const data = {
		profile: { name: 'Dario', birthday: '1990-12-25' },
		favorite: { title: 'The Thing', year: '1982' },
		settings: {},
		upcoming: { date: '2026-11-28', place: 'Divano', movies: [{ title: 'Alien' }, { title: 'Aliens' }, { title: 'Alien³' }] }
	};
	const list = plannedNotifications(data, now);
	assert.deepEqual(list.map(item => [item.id, item.title, item.body, item.at.getTime()]), [
		[NOTIFICATION_IDS.birthday, '🎂 Buon compleanno, Dario!', 'Per festeggiare: The Thing (1982)?', new Date(2026, 11, 25, 9, 0).getTime()],
		[NOTIFICATION_IDS.evening, '🍿 Stasera: Alien, Aliens e altri 1', 'Serata in programma: Divano.', new Date(2026, 10, 28, 9, 0).getTime()]
	]);
	assert.equal(plannedNotifications({ ...data, settings: { notifyBirthday: false, notifyEvening: false } }, now).length, 0);
	assert.equal(plannedNotifications({ ...data, profile: {}, upcoming: { ...data.upcoming, date: '2026-11-23' } }, now).length, 0, 'serata di oggi dopo le 9: niente');
	assert.equal(plannedNotifications({ ...data, profile: {}, upcoming: { ...data.upcoming, date: null } }, now).length, 0, 'serata senza data');
});

test('asks the notification permission only after an action and reschedules only when something changes', async () => {
	const calls = [];
	let display = 'prompt';
	const plugin = {
		checkPermissions: async () => ({ display }),
		requestPermissions: async () => { calls.push('request'); display = 'granted'; return { display }; },
		cancel: async ({ notifications }) => { calls.push(`cancel ${notifications.map(item => item.id).join(',')}`); },
		schedule: async ({ notifications }) => { calls.push(`schedule ${notifications.map(item => `${item.id}@${item.schedule.at.getHours()}:${item.smallIcon}:${item.isExactNotification}`).join(',')}`); }
	};
	let data = { profile: { birthday: '1990-12-25' }, settings: {} };
	const notifications = createNotifications({ getData: () => data, plugin: () => plugin, now: () => new Date(2026, 10, 23, 10) });
	assert.equal(await notifications.sync(), 'prompt', 'all’avvio non chiede');
	assert.deepEqual(calls, []);
	assert.equal(await notifications.sync({ ask: true }), 'granted');
	assert.deepEqual(calls, ['request', 'cancel 1001,1002', 'schedule 1001@9:ic_stat_mycimmena:false']);
	await notifications.sync();
	assert.equal(calls.length, 3, 'niente di cambiato: niente da rifare');
	data = { ...data, settings: { notifyBirthday: false } };
	await notifications.sync();
	assert.deepEqual(calls.slice(3), ['cancel 1001,1002'], 'spenta: si cancella');
	assert.equal(await createNotifications({ getData: () => data, plugin: () => null }).sync(), 'unavailable');
	// Icona piccola dichiarata e presente nel progetto Android.
	const config = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
	assert.equal(config.plugins.LocalNotifications.smallIcon, 'ic_stat_mycimmena');
	assert.match(readFileSync(new URL('../android/app/src/main/res/drawable/ic_stat_mycimmena.xml', import.meta.url), 'utf8'), /<vector/);
});
