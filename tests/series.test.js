// Serie TV: logica pura (series.js), migrazione dello schema e operazioni sugli episodi in store.js.
import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { createStore } from '../www/assets/js/store.js';
import {
	allEpisodes, completedBy, customStructure, episodeDetails, episodesUpTo, formatEpisodes, lostEpisodes, missingOmdbSeasons, nextEpisode,
	normalizeEpisodes, progress, seasonProgress, structureFromOmdb, watchedEpisodes, withOmdbSeason
} from '../www/assets/js/series.js';

const NOW = '2026-11-22T10:00:00.000Z';
const twoSeasons = customStructure(null, [3, 2], NOW);

test('formats single episodes, runs and gaps', () => {
	assert.equal(formatEpisodes([{ s: 2, e: 4 }]), 'S2·E4');
	assert.equal(formatEpisodes([{ s: 2, e: 6 }, { s: 2, e: 4 }, { s: 2, e: 5 }]), 'S2·E4–E6');
	assert.equal(formatEpisodes([{ s: 1, e: 1 }, { s: 1, e: 3 }]), 'S1·E1, S1·E3');
	// Con la struttura, l'ultimo episodio di una stagione e il primo della successiva sono consecutivi.
	assert.equal(formatEpisodes([{ s: 1, e: 3 }, { s: 2, e: 1 }], twoSeasons), 'S1·E3–S2·E1');
	assert.equal(formatEpisodes([]), '');
	assert.deepEqual(normalizeEpisodes([{ s: 1, e: 2 }, { s: '1', e: '2' }, { s: 0, e: 1 }, { s: 1.5, e: 1 }, null]), [{ s: 1, e: 2 }]);
});

test('finds the next episode, progress and completed seasons', () => {
	const watched = new Set(['1-1', '1-2']);
	assert.deepEqual(nextEpisode(twoSeasons, watched), { s: 1, e: 3 });
	assert.deepEqual(progress(twoSeasons, watched), { seen: 2, total: 5, remaining: 3 });
	assert.deepEqual(seasonProgress(twoSeasons, watched, 1), { seen: 2, total: 3 });
	assert.deepEqual(episodesUpTo(twoSeasons, watched, { s: 2, e: 1 }), [{ s: 1, e: 3 }, { s: 2, e: 1 }]);
	assert.deepEqual(completedBy(twoSeasons, watched, [{ s: 1, e: 3 }]), { seasons: [1], series: false });
	const almost = new Set(['1-1', '1-2', '1-3', '2-1']);
	assert.deepEqual(completedBy(twoSeasons, almost, [{ s: 2, e: 2 }]), { seasons: [2], series: true });
	assert.equal(nextEpisode(twoSeasons, new Set(allEpisodes(twoSeasons).map(({ s, e }) => `${s}-${e}`))), null);
});

test('counts watched episodes of the current round only', () => {
	const viewings = [
		{ movieId: 'tt1', round: 1, episodes: [{ s: 1, e: 1 }, { s: 1, e: 2 }] },
		{ movieId: 'tt1', episodes: [{ s: 1, e: 3 }] },
		{ movieId: 'tt1', round: 2, episodes: [{ s: 1, e: 1 }] },
		{ movieId: 'tt2', round: 1, episodes: [{ s: 1, e: 4 }] }
	];
	assert.deepEqual([...watchedEpisodes(viewings, 'tt1', 1)].sort(), ['1-1', '1-2', '1-3']);
	assert.deepEqual([...watchedEpisodes(viewings, 'tt1', 2)], ['1-1']);
});

test('builds the structure from OMDb lazily and lets the user fix it by hand', () => {
	// OMDb conosce una sola stagione: la serie in realtà ne ha tre da 10 episodi.
	let seasons = structureFromOmdb('1', { 1: ['Pilot', 'Due', 'Tre'] }, NOW);
	assert.deepEqual(seasons.list, [{ n: 1, episodes: 3, titles: ['Pilot', 'Due', 'Tre'], source: 'omdb' }]);
	seasons = customStructure(seasons, [3, 10, 10], NOW);
	assert.equal(seasons.source, 'mixed');
	assert.equal(seasons.list[0].titles[0], 'Pilot');
	assert.deepEqual(seasons.list.slice(1).map(season => [season.n, season.episodes, season.source]), [[2, 10, 'custom'], [3, 10, 'custom']]);
	// Una stagione di OMDb cambiata a mano perde i titoli e diventa "inserita da te".
	assert.equal(customStructure(seasons, [5, 10, 10], NOW).list[0].source, 'custom');
	assert.equal(customStructure(null, [4], NOW).source, 'custom');
	// Le stagioni non ancora scaricate si chiedono quando servono; quelle scritte a mano non si sovrascrivono.
	const lazy = structureFromOmdb(3, { 1: ['A'] }, NOW);
	assert.deepEqual(missingOmdbSeasons(lazy), [2, 3]);
	const filled = withOmdbSeason(lazy, 2, ['B', 'C'], NOW);
	assert.deepEqual(missingOmdbSeasons(filled), [3]);
	assert.equal(withOmdbSeason(seasons, 2, ['x'], NOW), seasons);
	// Accorciare la struttura avvisa degli episodi visti che sparirebbero.
	assert.deepEqual(lostEpisodes(new Set(['1-1', '2-9', '3-1']), customStructure(null, [3, 5], NOW)), [{ s: 2, e: 9 }, { s: 3, e: 1 }]);
});

const freshStore = () => createStore({ indexedDB: new IDBFactory(), name: 'serie' });
const severance = { id: 'tt11280740', title: 'Severance', year: '2022', type: 'series' };

test('upgrades a version 1 database to version 2 keeping its data', async () => {
	const factory = new IDBFactory();
	await new Promise((resolve, reject) => {
		const req = factory.open('vecchio', 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			db.createObjectStore('movies', { keyPath: 'id' }).put({ id: 'tt1', title: 'Alien' });
			db.createObjectStore('watchlist', { keyPath: 'movieId' }).put({ movieId: 'tt1', addedAt: NOW, hype: 3 });
			const viewings = db.createObjectStore('viewings', { keyPath: 'id' });
			viewings.createIndex('movieId', 'movieId');
			viewings.createIndex('date', 'date');
			db.createObjectStore('posters', { keyPath: 'movieId' });
			db.createObjectStore('kv', { keyPath: 'key' });
		};
		req.onsuccess = () => { req.result.close(); resolve(); };
		req.onerror = () => reject(req.error);
	});
	const store = createStore({ indexedDB: factory, name: 'vecchio' });
	const state = await store.loadAll();
	assert.equal(state.movies.get('tt1').title, 'Alien');
	assert.equal(state.watchlist[0].hype, 3);
	assert.equal(state.series.size, 0);
});

test('marks every episode as its own viewing, moves the series to "watching" and out of the watchlist', async () => {
	const store = freshStore();
	await store.addToWatchlist([severance]);
	await store.savePlanned({ movieIds: [severance.id] });
	const first = await store.markEpisodes(severance.id, [{ s: 1, e: 1 }], { date: '2026-11-20' });
	await store.markEpisodes(severance.id, [{ s: 1, e: 2 }, { s: 1, e: 3 }, { s: 1, e: 1 }], { date: '2026-11-20' });
	await store.markEpisodes(severance.id, [{ s: 1, e: 4 }], { date: '2026-11-21' });
	let state = await store.loadAll();
	assert.equal(first.series.status, 'watching');
	assert.equal(first.viewings.length, 1);
	assert.deepEqual(state.watchlist, []);
	assert.deepEqual(state.planned.movieIds, []);
	// Una visione (una card nel diario) per episodio, anche nello stesso giorno; l'1, già segnato, non si ripete.
	assert.equal(state.viewings.length, 4);
	assert.ok(state.viewings.every(viewing => viewing.episodes.length === 1 && viewing.scope === 'episodes' && viewing.round === 1));
	assert.deepEqual(state.viewings.filter(viewing => viewing.date === '2026-11-20').map(viewing => viewing.episodes[0].e).sort(), [1, 2, 3]);
	// Togliere il segno toglie le loro visioni.
	await store.unmarkEpisodes(severance.id, [{ s: 1, e: 4 }, { s: 1, e: 2 }]);
	state = await store.loadAll();
	assert.deepEqual(state.viewings.map(viewing => viewing.episodes[0].e).sort(), [1, 3]);
	await assert.rejects(store.markEpisodes(severance.id, [], { date: '2026-11-20' }), /Nessun episodio/);
});

test('opens a single episode of an old multi-episode viewing as its own, and adds new episode viewings from the diary', async () => {
	const store = freshStore();
	await store.addToWatchlist([severance]);
	// Visione di più episodi insieme, come le salvavano le versioni fino alla 0.5.
	const old = await store.addViewing({ movieId: severance.id, date: '2026-11-20', place: 'Divano', scope: 'episodes', episodes: [{ s: 1, e: 1 }, { s: 1, e: 2 }], round: 1, rating: 8, notes: '<p>Bello</p>' });
	const ownId = await store.splitEpisode(severance.id, { s: 1, e: 2 });
	let state = await store.loadAll();
	const own = state.viewings.find(viewing => viewing.id === ownId);
	assert.deepEqual([own.date, own.place, own.episodes, own.rating, own.notes], ['2026-11-20', 'Divano', [{ s: 1, e: 2 }], null, '']);
	const rest = state.viewings.find(viewing => viewing.id === old.id);
	assert.deepEqual([rest.episodes, rest.rating], [[{ s: 1, e: 1 }], 8], 'voto e note restano alla visione di prima');
	assert.equal(await store.splitEpisode(severance.id, { s: 1, e: 1 }), old.id, 'una visione di un episodio solo resta quella');
	assert.equal(await store.splitEpisode(severance.id, { s: 2, e: 1 }), null);
	// La visione nuova di un episodio dal diario, con le sue note: la serie parte come con markEpisodes.
	await store.addToWatchlist([severance]);
	await store.addViewing({ movieId: severance.id, date: '2026-11-21', scope: 'episodes', episodes: [{ s: 1, e: 3 }], round: 1, notes: '<p>Che finale!</p>' });
	state = await store.loadAll();
	assert.deepEqual(state.watchlist, []);
	assert.equal(state.series.get(severance.id).status, 'watching');
	const details = episodeDetails(state.viewings, severance.id);
	assert.deepEqual(details.get('1-3').hasNote, true);
	assert.deepEqual(details.get('1-2'), { date: '2026-11-20', viewingId: ownId, hasNote: false });
});

test('rates seasons and the whole series, changes status and starts a new round', async () => {
	const store = freshStore();
	await store.addToWatchlist([severance]);
	await store.markEpisodes(severance.id, [{ s: 1, e: 1 }], { date: '2026-11-20' });
	const seasonVote = await store.addViewing({ movieId: severance.id, date: '2026-11-22', scope: 'season', season: 1, rating: 9 });
	const seriesVote = await store.addViewing({ movieId: severance.id, date: '2026-11-22', scope: 'series', rating: 8.5, episodes: [{ s: 1, e: 1 }] });
	assert.equal(seasonVote.season, 1);
	assert.deepEqual(seriesVote.episodes, []);
	assert.equal(seriesVote.season, null);
	assert.equal((await store.setSeriesStatus(severance.id, 'finished')).status, 'finished');
	await assert.rejects(store.setSeriesStatus(severance.id, 'boh'), /non valido/);
	const restarted = await store.restartSeries(severance.id);
	assert.deepEqual([restarted.status, restarted.round], ['watching', 2]);
	const { viewings: [viewing] } = await store.markEpisodes(severance.id, [{ s: 1, e: 1 }], { date: '2026-11-20' });
	assert.equal(viewing.round, 2);
	assert.equal((await store.loadAll()).viewings.filter(item => item.scope === 'episodes').length, 2);
	// I film non hanno i campi delle serie.
	await store.addToWatchlist([{ id: 'tt0078748', title: 'Alien' }]);
	const film = await store.addViewing({ movieId: 'tt0078748', date: '2026-11-22' });
	assert.equal('scope' in film, false);
});

test('saves profile, settings, onboarding, OMDb details and the season structure', async () => {
	const store = freshStore();
	await store.updateKv('profile', { name: 'Dario' });
	await store.updateKv('profile', { birthday: '1990-05-04' });
	await store.updateKv('settings', { detailMode: 'full', omdbKeyStatus: 'missing' });
	await store.updateKv('onboarding', { step: 'cards' });
	await assert.rejects(store.updateKv('altro', {}), /sconosciuta/);
	await store.saveMovie({ id: 'tt0078748', title: 'Alien' });
	await store.saveDetails('tt0078748', { director: 'Ridley Scott', type: 'movie' });
	await store.addToWatchlist([severance]);
	await store.saveSeasons(severance.id, customStructure(null, [9], NOW));
	const state = await store.loadAll();
	const { updatedAt, ...profile } = state.profile;
	assert.deepEqual(profile, { name: 'Dario', birthday: '1990-05-04' });
	assert.match(updatedAt, /^\d{4}-/, 'serve all’unione dei backup');
	assert.equal(state.settings.detailMode, 'full');
	assert.equal(state.onboarding.step, 'cards');
	assert.equal(state.movies.get('tt0078748').details.director, 'Ridley Scott');
	assert.equal(state.watchlist.length, 1, 'il film del cuore non entra nella watchlist');
	assert.equal(state.movies.get(severance.id).seasons.list[0].episodes, 9);
	assert.equal(await store.saveDetails('tt999', {}), null);
});
