// Fase 3: backup (esporta, controlla, ripristina), importazione della watchlist da Letterboxd e IMDb,
// controllo degli aggiornamenti, versione allineata nei tre file.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { createStore, mergeMovie } from '../www/assets/js/store.js';
import { backupFileName, buildBackup, describeBackup, parseBackup } from '../www/assets/js/backup.js';
import { backupReminderDue, renderBackupBody } from '../www/assets/js/backup-ui.js';
import { isZip, readZipEntry, zipEntries } from '../www/assets/js/zip.js';
import { createJob, entriesFromCsv, jobSummary, matchEntry, moviesToImport, normalizeTitle, parseCsv, readWatchlistFile, resolveDoubt, runMatching } from '../www/assets/js/watchlist-import.js';
import { renderImportBody } from '../www/assets/js/import-ui.js';
import { compareVersions, createUpdateChecker, describeResult, isSnoozed, parseRelease } from '../www/assets/js/updates.js';
import { APP_VERSION } from '../www/assets/js/app-info.js';
import { readVersions, versionCode } from '../tools/version.js';

const freshStore = () => createStore({ indexedDB: new IDBFactory(), name: 'test' });
const alien = { id: 'tt0078748', title: 'Alien', year: '1979', type: 'movie', poster: 'https://m.media-amazon.com/images/M/a._V1_.jpg' };
const thing = { id: 'tt0084787', title: 'The Thing', year: '1982', type: 'movie' };

// Zip minimo con i file dati (compressi con deflate), come quello di Letterboxd.
function makeZip(files) {
	const locals = [];
	const centrals = [];
	let offset = 0;
	for (const [name, content] of Object.entries(files)) {
		const nameBytes = Buffer.from(name);
		const data = deflateRawSync(Buffer.from(content));
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(8, 8);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(Buffer.byteLength(content), 22);
		local.writeUInt16LE(nameBytes.length, 26);
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(8, 10);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(Buffer.byteLength(content), 24);
		central.writeUInt16LE(nameBytes.length, 28);
		central.writeUInt32LE(offset, 42);
		locals.push(local, nameBytes, data);
		centrals.push(central, nameBytes);
		offset += local.length + nameBytes.length + data.length;
	}
	const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(Object.keys(files).length, 8);
	end.writeUInt16LE(Object.keys(files).length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);
	return new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
}
const fileOf = (bytes, name) => ({ name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), text: async () => Buffer.from(bytes).toString('utf8') });

const LETTERBOXD = 'Date,Name,Year,Letterboxd URI\n2024-01-05,Alien,1979,https://boxd.it/a\n2024-02-01,"Crouching Tiger, Hidden Dragon",2000,https://boxd.it/b\n2024-03-01,Solaris,1972,https://boxd.it/c\n';
const IMDB = 'Position,Const,Created,Modified,Description,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors,Your Rating,Date Rated\n1,tt0078748,2023-05-14,2023-05-14,,Alien,Alien,https://www.imdb.com/title/tt0078748/,Movie,8.5,117,1979,Horror,1,1979-05-25,Ridley Scott,,\n2,tt11280740,2023-06-01,2023-06-01,,Severance,Severance,https://www.imdb.com/title/tt11280740/,TV Series,8.7,55,2022,Drama,1,2022-02-18,,,\n';

test('reads CSV fields with quotes, commas and line breaks', () => {
	assert.deepEqual(parseCsv('a,"b, c","d ""e"""\r\n1,"due\nrighe",3\n\n'), [['a', 'b, c', 'd "e"'], ['1', 'due\nrighe', '3']]);
	assert.deepEqual(parseCsv('﻿x,y'), [['x', 'y']]);
});

test('recognises Letterboxd and IMDb watchlists from the columns, and refuses other files', () => {
	const letterboxd = entriesFromCsv(LETTERBOXD);
	assert.equal(letterboxd.source, 'letterboxd');
	assert.deepEqual(letterboxd.entries[1], { imdbId: '', title: 'Crouching Tiger, Hidden Dragon', year: '2000', type: 'movie', addedAt: '2024-02-01T12:00:00.000Z' });
	const imdb = entriesFromCsv(IMDB);
	assert.equal(imdb.source, 'imdb');
	assert.deepEqual(imdb.entries.map(entry => [entry.imdbId, entry.type]), [['tt0078748', 'movie'], ['tt11280740', 'series']]);
	assert.throws(() => entriesFromCsv('Const,Your Rating,Date Rated,Title\ntt1,8,2024-01-01,X'), /file dei voti di IMDb/);
	assert.throws(() => entriesFromCsv('Date,Name,Year,Letterboxd URI,Rating\n2024-01-01,X,2000,u,4'), /voti o diario/);
	assert.throws(() => entriesFromCsv('nome,cognome\nDario,Erste'), /non sembra una watchlist/);
	assert.throws(() => entriesFromCsv('Date,Name,Year,Letterboxd URI\n'), /vuota/);
});

test('opens the Letterboxd zip as it is and takes only watchlist.csv', async () => {
	const zip = makeZip({ 'profile.csv': 'Username\nx', 'watched.csv': 'Date,Name,Year,Letterboxd URI\n', 'watchlist.csv': LETTERBOXD });
	assert.ok(isZip(zip));
	assert.deepEqual(zipEntries(zip).map(entry => entry.name), ['profile.csv', 'watched.csv', 'watchlist.csv']);
	assert.equal(Buffer.from(await readZipEntry(zip, zipEntries(zip)[2])).toString(), LETTERBOXD);
	const parsed = await readWatchlistFile(fileOf(zip, 'letterboxd-dario-2026.zip'));
	assert.equal(parsed.entries.length, 3);
	await assert.rejects(readWatchlistFile(fileOf(makeZip({ 'altro.csv': 'x' }), 'a.zip')), /non c’è watchlist\.csv/);
	assert.equal((await readWatchlistFile(fileOf(new Uint8Array(Buffer.from(IMDB)), 'watchlist.csv'))).source, 'imdb');
});

test('matches Letterboxd titles by title and year, and leaves the doubtful ones to the user', () => {
	assert.equal(normalizeTitle('The Crouching Tiger, Hidden Dragon!'), normalizeTitle('Crouching Tiger Hidden Dragon'));
	assert.equal(normalizeTitle('Amélie'), 'amelie');
	const entry = { title: 'Solaris', year: '1972' };
	const results = [
		{ id: 'tt0069293', title: 'Solaris', year: '1972', type: 'movie' },
		{ id: 'tt0307479', title: 'Solaris', year: '2002', type: 'movie' }
	];
	assert.equal(matchEntry(entry, results).movie.id, 'tt0069293');
	assert.equal(matchEntry({ title: 'Solaris', year: '1973' }, results).movie.id, 'tt0069293', 'un anno di tolleranza');
	const twins = matchEntry({ title: 'Solaris', year: '1972' }, [...results, { id: 'tt9', title: 'Solaris', year: '1972', type: 'movie' }]);
	assert.equal(twins.status, 'doubt');
	assert.deepEqual(twins.candidates.map(candidate => candidate.id), ['tt0069293', 'tt9']);
	assert.deepEqual(matchEntry({ title: 'Niente', year: '1990' }, []), { status: 'doubt', candidates: [] });
	assert.equal(matchEntry({ title: 'Solaris', year: '1972' }, [{ id: 'tt1', title: 'Solaris', year: '1972', type: 'episode' }]).status, 'doubt', 'mai un episodio');
	// IMDb: l'id è sicuro, anche se la ricerca non lo trova.
	assert.deepEqual(matchEntry({ imdbId: 'tt5', title: 'X', year: '2001', type: 'series' }, []).movie, { id: 'tt5', title: 'X', year: '2001', type: 'series', poster: '', stars: '' });
});

test('matches a whole file slowly, can stop and resume, and imports with the original date', async () => {
	const parsed = entriesFromCsv(LETTERBOXD);
	const job = createJob(parsed, { fileName: 'watchlist.csv' });
	const catalog = {
		'Alien 1979': [{ id: 'tt0078748', title: 'Alien', year: '1979', type: 'movie' }],
		'Crouching Tiger, Hidden Dragon 2000': [{ id: 'tt0190332', title: 'Crouching Tiger, Hidden Dragon', year: '2000', type: 'movie' }],
		'Solaris 1972': [{ id: 'tt0069293', title: 'Solaris', year: '1972', type: 'movie' }, { id: 'tt0069294', title: 'Solaris', year: '1972', type: 'movie' }]
	};
	const queries = [];
	const search = async query => { queries.push(query); return catalog[query] || []; };
	const waits = [];
	let calls = 0;
	const saves = [];
	await runMatching(job, { search, wait: async ms => { waits.push(ms); }, shouldStop: () => calls++ >= 1, save: async value => saves.push(jobSummary(value)) });
	assert.equal(jobSummary(job).pending, 2, 'interrotta dopo il primo');
	assert.ok(saves.length >= 1, 'salvata anche quando si interrompe');
	await runMatching(job, { search, wait: async () => {}, watchlistIds: new Set(['tt0190332']) });
	assert.deepEqual(jobSummary(job), { total: 3, pending: 0, matched: 1, doubts: 1, duplicates: 1, skipped: 0 });
	assert.ok(queries.includes('Solaris') && queries.includes('Solaris 1972'), 'senza risultato certo riprova con il solo titolo');
	assert.ok(waits.every(ms => ms === 500));
	// Riepilogo e scelta del titolo giusto.
	let html = renderImportBody({ job, phase: 'idle' });
	assert.match(html, /1 trovato, 1 da controllare, 1 già nella tua watchlist/);
	assert.match(html, /data-import-pick="2" data-movie-id="tt0069294"/);
	resolveDoubt(job, '2', 'tt0069294');
	html = renderImportBody({ job, phase: 'idle' });
	assert.match(html, /Importa 2 titoli/);
	const movies = moviesToImport(job);
	assert.deepEqual(movies.map(movie => [movie.id, movie.addedAt, movie.source]), [['tt0078748', '2024-01-05T12:00:00.000Z', 'letterboxd'], ['tt0069294', '2024-03-01T12:00:00.000Z', 'letterboxd']]);
	const store = freshStore();
	assert.deepEqual(await store.addToWatchlist(movies), ['tt0078748', 'tt0069294']);
	const entry = (await store.loadAll()).watchlist.find(item => item.movieId === 'tt0078748');
	assert.equal(entry.addedAt, '2024-01-05T12:00:00.000Z');
	assert.equal(entry.source, 'letterboxd');
	// Il lavoro si salva e si riprende.
	await store.saveImportJob(job);
	assert.equal((await store.getImportJob()).items.length, 3);
	assert.equal((await store.loadAll()).importJob.source, 'letterboxd');
	await store.clearImportJob();
	assert.equal(await store.getImportJob(), null);
	// Titoli ripetuti nel file e già nella watchlist (IMDb, per id) non si cercano nemmeno.
	const imdbJob = createJob(entriesFromCsv(IMDB + '3,tt0078748,2023-07-01,,,Alien,,,Movie,,,1979,,,,,,\n'), { watchlistIds: new Set(['tt11280740']) });
	assert.deepEqual(imdbJob.items.map(item => item.status), ['pending', 'duplicate', 'skipped']);
	assert.match(renderImportBody({ job: imdbJob, phase: 'matching', progress: { done: 2, total: 3 } }), /Abbinamento 2\/3[\s\S]*data-import-stop/);
	assert.match(renderImportBody({ job: null }), /accept="\.csv,\.zip/);
});

async function seed(store) {
	await store.addToWatchlist([alien, thing]);
	await store.setHype(thing.id, 4);
	await store.addViewing({ movieId: alien.id, date: '2026-11-01', rating: 8, notes: '<p>Bello</p>' });
	await store.updateKv('profile', { name: 'Dario' });
	await store.updateKv('settings', { detailMode: 'full', omdbKey: 'a1b2c3d4', omdbKeyStatus: 'valid' });
	await store.updateKv('onboarding', { done: true });
}

test('exports everything into a backup file and restores it on a new phone', async () => {
	const store = freshStore();
	await seed(store);
	const now = new Date('2026-11-23T10:00:00Z');
	const file = buildBackup(await store.exportData(), { appVersion: '0.3.0', now });
	assert.equal(backupFileName(now), 'mycimmena-backup-2026-11-23.json');
	assert.deepEqual([file.app, file.kind, file.format, file.schemaVersion, file.exportedAt], ['myCimmena', 'backup', 1, 2, '2026-11-23T10:00:00.000Z']);
	const parsed = parseBackup(JSON.stringify(file));
	assert.deepEqual(parsed.summary, { exportedAt: '2026-11-23T10:00:00.000Z', appVersion: '0.3.0', name: 'Dario', titles: 2, watchlist: 2, viewings: 1, series: 0, hasKey: true });
	assert.equal(describeBackup(parsed.summary), '2 titoli nella watchlist, 1 visione nel diario, salvato il 2026-11-23.');
	const phone = freshStore();
	await phone.restoreData(parsed.data, { mode: 'replace' });
	const state = await phone.loadAll();
	assert.equal(state.movies.size, 2);
	assert.equal(state.watchlist.find(entry => entry.movieId === thing.id).hype, 4);
	assert.equal(state.viewings[0].rating, 8);
	assert.equal(state.profile.name, 'Dario');
	assert.equal(state.settings.omdbKey, 'a1b2c3d4');
	assert.equal(state.onboarding.done, true);
	// Il dialogo avvisa che nel file c'è la chiave.
	assert.match(renderBackupBody({ data: { settings: state.settings, meta: {} } }), /contiene anche la tua chiave OMDb/);
	assert.match(renderBackupBody({ data: { settings: {}, meta: {} }, pending: parsed }), /data-backup-restore="merge"[\s\S]*data-backup-restore="replace"/);
});

test('refuses files that are not backups and cleans what comes from outside', () => {
	assert.throws(() => parseBackup('non json'), /non è un JSON valido/);
	assert.throws(() => parseBackup('{"app":"altro"}'), /non è un backup di myCimmena/);
	assert.throws(() => parseBackup(JSON.stringify({ app: 'myCimmena', kind: 'backup', format: 99, data: {} })), /versione più nuova/);
	const parsed = parseBackup(JSON.stringify({
		app: 'myCimmena', kind: 'backup', format: 1, data: {
			movies: [alien, { id: 'non-valido', title: 'X' }],
			watchlist: [{ movieId: alien.id, addedAt: '2026-01-01T00:00:00.000Z', hype: 9 }, { movieId: 'tt404' }],
			viewings: [{ id: 'v1', movieId: alien.id, date: '2026-01-02', notes: '<p onclick="x()">Ok</p><script>alert(1)</script>' }],
			settings: { omdbKey: 'chiave con spazi"><img>', detailMode: 'full', nested: { a: 1 } }
		}
	}));
	assert.equal(parsed.skipped, 2);
	assert.equal(parsed.data.watchlist[0].hype, null);
	assert.doesNotMatch(parsed.data.viewings[0].notes, /onclick|script/);
	assert.equal(parsed.data.settings.omdbKey, undefined);
	assert.equal(parsed.data.settings.nested, undefined);
	assert.equal(parsed.data.settings.detailMode, 'full');
});

test('merges a backup: the most recently changed entry wins and nothing is lost', async () => {
	const store = freshStore();
	await seed(store);
	const backup = parseBackup(JSON.stringify(buildBackup(await store.exportData(), { appVersion: '0.3.0' }))).data;
	// Sul telefono: una visione modificata dopo il backup e un titolo nuovo.
	const viewing = (await store.loadAll()).viewings[0];
	await new Promise(resolve => setTimeout(resolve, 5));
	await store.updateViewing(viewing.id, { rating: 9 });
	await store.addToWatchlist([{ id: 'tt0069293', title: 'Solaris', year: '1972' }]);
	// Nel backup: una visione che il telefono non ha.
	backup.viewings.push({ ...viewing, id: 'altra', date: '2025-01-01', rating: 6, updatedAt: '2025-01-01T00:00:00.000Z' });
	backup.viewings[0] = { ...backup.viewings[0], rating: 5 };
	await store.restoreData(backup, { mode: 'merge' });
	const state = await store.loadAll();
	assert.equal(state.viewings.find(item => item.id === viewing.id).rating, 9, 'vince la modifica più recente');
	assert.equal(state.viewings.length, 2);
	assert.equal(state.watchlist.length, 3, 'il titolo nuovo del telefono resta');
	// Dettagli OMDb: tiene quelli più recenti.
	const merged = mergeMovie({ id: 'tt1', title: 'A', year: '', details: null }, { id: 'tt1', title: 'A', year: '2000', details: { plot: 'p' }, detailsFetchedAt: '2026-01-01T00:00:00.000Z' });
	assert.deepEqual([merged.year, merged.details.plot], ['2000', 'p']);
	await assert.rejects(store.restoreData(backup, { mode: 'boh' }), /sconosciuto/);
});

test('keeps a valid OMDb key of this phone when the backup has none, in both modes', async () => {
	for (const mode of ['merge', 'replace']) {
		const store = freshStore();
		await store.updateKv('onboarding', { step: 'import' });
		// Chiave appena verificata nell'onboarding; il backup viene da un telefono con le schede light, più recente.
		await store.updateKv('settings', { detailMode: 'full', omdbKey: 'abcd1234', omdbKeyStatus: 'valid' });
		const backup = { movies: [], watchlist: [], viewings: [], series: [], planned: null, profile: { name: 'Dario' }, onboarding: null,
			settings: { detailMode: 'light', backupReminder: false, updatedAt: '2999-01-01T00:00:00.000Z' } };
		await store.restoreData(backup, { mode });
		const { settings } = await store.loadAll();
		assert.equal(settings.omdbKey, 'abcd1234', mode);
		assert.equal(settings.omdbKeyStatus, 'valid', mode);
		assert.equal(settings.detailMode, 'full', mode);
		assert.equal(settings.backupReminder, false, `${mode}: il resto delle impostazioni viene dal backup`);
		// Backup senza impostazioni: la chiave resta lo stesso.
		await store.restoreData({ ...backup, settings: null }, { mode });
		assert.equal((await store.loadAll()).settings.omdbKey, 'abcd1234', `${mode}, senza impostazioni`);
	}
});

test('reminds about the backup after 30 days with new data, at most once a day', () => {
	const now = Date.parse('2026-11-23T10:00:00Z');
	const state = {
		onboarding: { done: true, finishedAt: '2026-09-01T00:00:00.000Z' },
		meta: {},
		watchlist: [{ addedAt: '2026-11-01T00:00:00.000Z' }],
		viewings: []
	};
	assert.equal(backupReminderDue(state, now), true);
	assert.equal(backupReminderDue({ ...state, meta: { lastBackupAt: '2026-11-10T00:00:00.000Z' } }, now), false, 'backup recente');
	assert.equal(backupReminderDue({ ...state, meta: { lastBackupAt: '2026-10-01T00:00:00.000Z' }, watchlist: [{ addedAt: '2026-09-15T00:00:00.000Z' }] }, now), false, 'niente di nuovo');
	assert.equal(backupReminderDue({ ...state, meta: { backupReminderAt: '2026-11-23T08:00:00.000Z' } }, now), false, 'già ricordato oggi');
	assert.equal(backupReminderDue({ ...state, onboarding: { done: true, finishedAt: '2026-11-20T00:00:00.000Z' } }, now), false, 'app appena installata');
	assert.equal(backupReminderDue({ ...state, settings: { backupReminder: false } }, now), false, 'spento dalle Impostazioni');
	assert.equal(backupReminderDue({ ...state, settings: { backupReminder: true } }, now), true);
});

const release = { tag_name: 'v0.4.0', body: 'Novità', html_url: 'https://github.com/dariotronic/mycimmena/releases/tag/v0.4.0', published_at: '2026-12-01T00:00:00Z', assets: [{ name: 'mycimmena-0.4.0.apk', browser_download_url: 'https://github.com/dariotronic/mycimmena/releases/download/v0.4.0/mycimmena-0.4.0.apk' }] };
const reply = (status, body = null, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: new Headers(headers), json: async () => body });

test('compares versions and reads the GitHub release', () => {
	assert.ok(compareVersions('1.10.0', '1.2.0') > 0);
	assert.ok(compareVersions('v0.3.0', '0.3.0') === 0);
	assert.ok(compareVersions('0.2.9', '0.3.0') < 0);
	assert.deepEqual(parseRelease(release), { version: '0.4.0', notes: 'Novità', url: release.html_url, apkUrl: release.assets[0].browser_download_url, sha256: '', size: 0, publishedAt: '2026-12-01T00:00:00Z' });
	const withDigest = parseRelease({ ...release, assets: [{ ...release.assets[0], size: 4096, digest: `sha256:${'AB'.repeat(32)}` }] });
	assert.deepEqual([withDigest.sha256, withDigest.size], ['ab'.repeat(32), 4096]);
	assert.equal(parseRelease({ tag_name: 'nightly' }), null);
	assert.equal(parseRelease({ ...release, assets: [{ name: 'x.apk', browser_download_url: 'https://evil.example/x.apk' }] }).apkUrl, '');
});

test('checks GitHub with the ETag, respects the rate limit and answers the manual button', async () => {
	let check = {};
	let time = Date.parse('2026-11-23T10:00:00Z');
	const calls = [];
	const replies = [];
	const checker = createUpdateChecker({
		getCheck: () => check,
		saveCheck: async patch => { check = { ...check, ...patch }; },
		currentVersion: '0.3.0',
		now: () => time,
		fetchImpl: async (url, options) => { calls.push(options.headers); return replies.shift(); }
	});
	replies.push(reply(200, release, { ETag: '"abc"', 'X-RateLimit-Remaining': '58', 'X-RateLimit-Reset': String(time / 1000 + 3600) }));
	const first = await checker.check();
	assert.equal(first.kind, 'available');
	assert.equal(check.etag, '"abc"');
	assert.equal(check.remaining, 58);
	replies.push(reply(304, null, { 'X-RateLimit-Remaining': '58' }));
	time += 3600 * 1000;
	assert.equal((await checker.check()).latest.version, '0.4.0', 'con 304 resta la release già nota');
	assert.equal(calls[1]['If-None-Match'], '"abc"');
	// Pochi controlli rimasti: quelli automatici si fermano fino al reset.
	check = { ...check, remaining: 3, resetAt: time / 1000 + 600 };
	assert.equal((await checker.check()).kind, 'limited');
	assert.equal(calls.length, 2);
	// Il pulsante manuale prova lo stesso, e premuto di nuovo entro 30 secondi non rifà la richiesta.
	replies.push(reply(404, { message: 'Not Found' }, { 'X-RateLimit-Remaining': '2' }));
	assert.equal((await checker.check({ manual: true })).kind, 'current');
	time += 10 * 1000;
	assert.equal((await checker.check({ manual: true })).kind, 'current');
	assert.equal(calls.length, 3);
	// Limite esaurito: messaggio con l'ora di GitHub.
	time += 60 * 1000;
	replies.push(reply(403, {}, { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Date.parse('2026-11-23T14:40:00Z') / 1000) }));
	const limited = await checker.check({ manual: true });
	assert.equal(limited.kind, 'limited');
	assert.equal(describeResult(limited, '0.3.0'), 'GitHub ha ricevuto troppe richieste da questa rete: riprova dopo le 15:40.');
	assert.equal(describeResult({ kind: 'current' }, '0.3.0'), 'Hai già l’ultima versione (0.3.0).');
	// Offline.
	const offline = createUpdateChecker({ getCheck: () => ({}), saveCheck: async () => {}, currentVersion: '0.3.0', isOnline: () => false, fetchImpl: async () => { throw new Error('rete'); } });
	assert.equal((await offline.check({ manual: true })).kind, 'offline');
	// "Più tardi" vale 24 ore per quella versione.
	assert.equal(isSnoozed({ latest: { version: '0.4.0' }, dismissedVersion: '0.4.0', dismissedUntil: time + 1000 }, time), true);
	assert.equal(isSnoozed({ latest: { version: '0.5.0' }, dismissedVersion: '0.4.0', dismissedUntil: time + 1000 }, time), false);
});

test('keeps the version aligned in package.json, app-info.js and build.gradle', () => {
	const versions = readVersions();
	assert.equal(versions.pkg, APP_VERSION);
	assert.equal(versions.gradleName, APP_VERSION);
	assert.equal(versions.gradleCode, versionCode(APP_VERSION));
	const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
	assert.equal(lock.version, APP_VERSION);
	// La firma non è mai nella repo: build.gradle la legge da fuori.
	const gradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
	assert.match(gradle, /MYCIMMENA_SIGNING/);
	assert.doesNotMatch(gradle, /storePassword\s+['"]/);
	const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
	for (const pattern of ['*.jks', 'keystore.properties', 'dist/']) assert.ok(ignore.includes(pattern), pattern);
});
