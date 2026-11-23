// OMDb (omdb.js) e servizio dei dettagli (details.js) con un fetch finto: nessuna richiesta vera.
import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { createStore } from '../www/assets/js/store.js';
import { fetchOmdbDetails, fetchOmdbSeason, looksLikeOmdbKey, normalizeOmdbDetails, OmdbError, verifyOmdbKey } from '../www/assets/js/omdb.js';
import { COMPLETION_MAX_PER_SESSION, createDetails, detailModeOf } from '../www/assets/js/details.js';

const ALIEN = { Response: 'True', Title: 'Alien', Year: '1979', Runtime: '117 min', Genre: 'Horror, Sci-Fi', Director: 'Ridley Scott', Writer: 'Dan O\'Bannon', Actors: 'Sigourney Weaver, Tom Skerritt', Plot: 'Nello spazio.', Awards: 'Won 1 Oscar', imdbRating: '8.5', BoxOffice: 'N/A', Type: 'movie' };
const SERIES = { Response: 'True', Title: 'Severance', Type: 'series', totalSeasons: '2', Director: 'N/A' };
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

// fetch finto: risponde in base ai parametri; `calls` registra gli URL chiesti.
function fakeOmdb(handler) {
	const calls = [];
	const fetchImpl = async url => {
		const params = new URL(url).searchParams;
		calls.push(Object.fromEntries(params));
		return handler(params);
	};
	return { fetchImpl, calls };
}

test('recognizes a copied OMDb key', () => {
	assert.equal(looksLikeOmdbKey(' a1b2c3d4 '), true);
	assert.equal(looksLikeOmdbKey('a1b2c3d'), false);
	assert.equal(looksLikeOmdbKey('ciao mondo'), false);
});

test('normalizes OMDb details, dropping N/A', () => {
	const details = normalizeOmdbDetails(ALIEN);
	assert.equal(details.director, 'Ridley Scott');
	assert.equal(details.boxOffice, null);
	assert.equal(details.imdbRating, '8.5');
	assert.equal(details.type, 'movie');
	assert.equal(normalizeOmdbDetails(SERIES).totalSeasons, 2);
	assert.equal(normalizeOmdbDetails(SERIES).director, null);
});

test('classifies OMDb errors: invalid key, daily limit, network, not found', async () => {
	const fail = (body, status) => ({ fetchImpl: async () => json(body, status) });
	await assert.rejects(verifyOmdbKey('a1b2c3d4', fail({ Response: 'False', Error: 'Invalid API key!' }, 401)), error => error instanceof OmdbError && error.kind === 'invalid' && /link nella mail/.test(error.message));
	await assert.rejects(verifyOmdbKey('a1b2c3d4', fail({ Response: 'False', Error: 'Request limit reached!' }, 401)), { kind: 'limit' });
	await assert.rejects(fetchOmdbDetails('tt1', { key: 'k', ...fail({ Response: 'False', Error: 'Incorrect IMDb ID.' }, 200) }), { kind: 'not-found' });
	await assert.rejects(verifyOmdbKey('a1b2c3d4', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), { kind: 'network' });
	await assert.rejects(verifyOmdbKey('', {}), { kind: 'invalid' });
	const { fetchImpl, calls } = fakeOmdb(() => json(ALIEN));
	assert.equal(await verifyOmdbKey(' a1b2c3d4 ', { fetchImpl }), true);
	assert.deepEqual(calls, [{ i: 'tt0078748', apikey: 'a1b2c3d4' }]);
});

test('reads the episode titles of a season, filling gaps', async () => {
	const { fetchImpl, calls } = fakeOmdb(() => json({ Response: 'True', totalSeasons: '2', Episodes: [{ Title: 'Pilota', Episode: '1' }, { Title: 'Tre', Episode: '3' }] }));
	assert.deepEqual(await fetchOmdbSeason('tt1', 1, { key: 'k', fetchImpl }), { titles: ['Pilota', '', 'Tre'], totalSeasons: 2 });
	assert.equal(calls[0].Season, '1');
});

test('picks light, full or waiting from the settings', () => {
	assert.equal(detailModeOf(null), 'light');
	assert.equal(detailModeOf({ detailMode: 'light', omdbKey: 'k', omdbKeyStatus: 'valid' }), 'light');
	assert.equal(detailModeOf({ detailMode: 'full', omdbKey: 'k', omdbKeyStatus: 'valid' }), 'full');
	assert.equal(detailModeOf({ detailMode: 'full', omdbKeyStatus: 'missing' }), 'waiting');
	assert.equal(detailModeOf({ detailMode: 'full', omdbKey: 'k', omdbKeyStatus: 'invalid' }), 'waiting');
});

async function setup(handler, settings = { detailMode: 'full', omdbKey: 'a1b2c3d4', omdbKeyStatus: 'valid' }) {
	const store = createStore({ indexedDB: new IDBFactory(), name: 'omdb' });
	await store.updateKv('settings', settings);
	let state = await store.loadAll();
	const { fetchImpl, calls } = fakeOmdb(handler);
	const notices = [];
	const progress = [];
	const details = createDetails({
		store, fetchImpl, getState: () => state,
		onChange: async () => { state = await store.loadAll(); },
		onProgress: value => progress.push(value),
		notify: message => notices.push(message),
		wait: async () => {}
	});
	return { store, details, calls, notices, progress, reload: async () => { state = await store.loadAll(); return state; }, get state() { return state; } };
}

test('fetches details once when a card opens, only in full mode', async () => {
	const ctx = await setup(params => json(params.get('i') === 'tt0078748' ? ALIEN : SERIES));
	await ctx.store.addToWatchlist([{ id: 'tt0078748', title: 'Alien' }]);
	await ctx.reload();
	const [first, second] = await Promise.all([ctx.details.ensure('tt0078748'), ctx.details.ensure('tt0078748')]);
	assert.deepEqual([first, second], [true, true]);
	assert.equal(ctx.calls.length, 1, 'due aperture insieme fanno una richiesta sola');
	assert.equal(ctx.state.movies.get('tt0078748').details.director, 'Ridley Scott');
	assert.equal(await ctx.details.ensure('tt0078748'), false, 'i dettagli già salvati non si richiedono');
	const light = await setup(() => json(ALIEN), { detailMode: 'light' });
	await light.store.addToWatchlist([{ id: 'tt0078748', title: 'Alien' }]);
	await light.reload();
	assert.equal(await light.details.ensure('tt0078748'), false);
	assert.equal(light.calls.length, 0);
});

test('goes back to waiting when the key is refused and pauses until tomorrow at the daily limit', async () => {
	const refused = await setup(() => json({ Response: 'False', Error: 'Invalid API key!' }, 401));
	await refused.store.addToWatchlist([{ id: 'tt0078748', title: 'Alien' }]);
	await refused.reload();
	await refused.details.ensure('tt0078748');
	assert.equal(refused.state.settings.omdbKeyStatus, 'invalid');
	assert.equal(refused.details.mode(), 'waiting');
	assert.equal(refused.notices.length, 1);
	const limited = await setup(() => json({ Response: 'False', Error: 'Request limit reached!' }, 401));
	await limited.store.addToWatchlist([{ id: 'tt0078748', title: 'Alien' }, { id: 'tt1', title: 'Altro' }]);
	await limited.reload();
	await limited.details.ensure('tt0078748');
	assert.ok(limited.state.settings.omdbPausedUntil > new Date().toISOString());
	assert.equal(await limited.details.ensure('tt1'), false, 'in pausa non si chiede altro');
	assert.equal(limited.calls.length, 1);
});

test('completes saved titles in the background with a progress indicator', async () => {
	const ctx = await setup(params => (params.get('i') === 'tt3' ? json({ Response: 'False', Error: 'Incorrect IMDb ID.' }) : json(ALIEN)));
	await ctx.store.addToWatchlist([{ id: 'tt1', title: 'Uno' }, { id: 'tt2', title: 'Due' }, { id: 'tt3', title: 'Tre' }]);
	await ctx.reload();
	ctx.details.complete();
	while (ctx.details.isRunning()) await new Promise(resolve => setTimeout(resolve, 5));
	assert.deepEqual(ctx.progress.filter(Boolean).at(-1), { done: 2, total: 3 });
	assert.equal(ctx.progress.at(-1), null);
	assert.equal(ctx.state.movies.get('tt2').details.director, 'Ridley Scott');
	assert.deepEqual(ctx.state.movies.get('tt3').details, { notFound: true });
	assert.equal(COMPLETION_MAX_PER_SESSION, 100);
});

test('builds the season structure from OMDb and downloads seasons when needed', async () => {
	const ctx = await setup(params => {
		if (params.get('Season')) return json({ Response: 'True', totalSeasons: '2', Episodes: [{ Title: `S${params.get('Season')}E1`, Episode: '1' }, { Title: 'E2', Episode: '2' }] });
		return json(SERIES);
	});
	await ctx.store.addToWatchlist([{ id: 'tt11280740', title: 'Severance', type: 'series' }]);
	await ctx.reload();
	assert.equal(await ctx.details.ensureSeasons('tt11280740', [1]), true);
	let seasons = ctx.state.movies.get('tt11280740').seasons;
	assert.deepEqual(seasons.list.map(season => [season.n, season.episodes]), [[1, 2], [2, 0]]);
	await ctx.details.ensureSeasons('tt11280740', [2]);
	seasons = ctx.state.movies.get('tt11280740').seasons;
	assert.deepEqual(seasons.list.map(season => [season.n, season.episodes, season.titles[0]]), [[1, 2, 'S1E1'], [2, 2, 'S2E1']]);
	const requests = ctx.calls.length;
	assert.equal(await ctx.details.ensureSeasons('tt11280740', [1, 2]), false);
	assert.equal(ctx.calls.length, requests, 'niente richieste per stagioni già scaricate');
});

test('uses a new key only after OMDb accepts it, then completes saved titles', async () => {
	const ctx = await setup(() => json(ALIEN), { detailMode: 'full', omdbKeyStatus: 'missing' });
	await ctx.store.addToWatchlist([{ id: 'tt1', title: 'Uno' }]);
	await ctx.reload();
	assert.equal(ctx.details.mode(), 'waiting');
	await ctx.details.useKey(' a1b2c3d4 ');
	assert.equal(ctx.state.settings.omdbKey, 'a1b2c3d4');
	assert.equal(ctx.details.mode(), 'full');
	// Il completamento parte in sottofondo: si aspetta che arrivino i dettagli (non solo che non sia "in corso",
	// che subito dopo useKey può essere ancora falso perché non è partito), al massimo 2 secondi.
	for (let i = 0; i < 400 && (ctx.details.isRunning() || !ctx.state.movies.get('tt1').details); i++) await new Promise(resolve => setTimeout(resolve, 5));
	assert.equal(ctx.state.movies.get('tt1').details.director, 'Ridley Scott');
	const bad = await setup(() => json({ Response: 'False', Error: 'Invalid API key!' }, 401), { detailMode: 'full', omdbKeyStatus: 'missing' });
	await assert.rejects(bad.details.useKey('ffffffff'), { kind: 'invalid' });
	assert.equal(bad.state.settings.omdbKey, undefined);
});
