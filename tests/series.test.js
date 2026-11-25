// Serie TV: logica pura (series.js), migrazione dello schema e operazioni sugli episodi in store.js.
import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { createStore } from '../www/assets/js/store.js';
import { seriesProgress } from '../www/assets/js/app-data.js';
import {
	allEpisodes, completedBy, customStructure, episodeDays, episodesSummary, episodesUpTo, formatEpisodes, lostEpisodes, missingOmdbSeasons, nextEpisode,
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

test('counts an episode as watched if any viewing has it, also from the old rounds', () => {
	const viewings = [
		{ movieId: 'tt1', scope: 'episodes', round: 1, episodes: [{ s: 1, e: 1 }, { s: 1, e: 2 }] },
		{ movieId: 'tt1', scope: 'episodes', episodes: [{ s: 1, e: 3 }] },
		{ movieId: 'tt1', scope: 'episodes', round: 2, episodes: [{ s: 1, e: 1 }] },
		{ movieId: 'tt1', scope: 'season', season: 2, episodes: [] },
		{ movieId: 'tt2', scope: 'episodes', episodes: [{ s: 1, e: 4 }] }
	];
	assert.deepEqual([...watchedEpisodes(viewings, 'tt1')].sort(), ['1-1', '1-2', '1-3']);
});

test('groups the episodes of a series by day and labels them shortly', () => {
	const days = episodeDays([
		{ scope: 'episodes', date: '2026-11-20', episodes: [{ s: 1, e: 2 }] },
		{ scope: 'episodes', date: '2026-11-22', episodes: [{ s: 2, e: 1 }] },
		{ scope: 'episodes', date: '2026-11-20', episodes: [{ s: 1, e: 1 }] },
		{ scope: 'season', date: '2026-11-23', season: 1, episodes: [] }
	]);
	assert.deepEqual(days.map(day => [day.date, day.episodes.length, day.viewings.length]), [['2026-11-22', 1, 1], ['2026-11-20', 2, 2]]);
	assert.equal(episodesSummary(days[1].episodes), 'S1 · E1–E2');
	assert.equal(episodesSummary([{ s: 1, e: 1 }, { s: 1, e: 3 }, { s: 1, e: 4 }, { s: 2, e: 1 }]), 'Stagione 1 · 3 episodi, S2 · E1');
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
	assert.ok(state.viewings.every(viewing => viewing.episodes.length === 1 && viewing.scope === 'episodes'));
	assert.deepEqual(state.viewings.filter(viewing => viewing.date === '2026-11-20').map(viewing => viewing.episodes[0].e).sort(), [1, 2, 3]);
	// Togliere il segno toglie le loro visioni.
	await store.unmarkEpisodes(severance.id, [{ s: 1, e: 4 }, { s: 1, e: 2 }]);
	state = await store.loadAll();
	assert.deepEqual(state.viewings.map(viewing => viewing.episodes[0].e).sort(), [1, 3]);
	await assert.rejects(store.markEpisodes(severance.id, [], { date: '2026-11-20' }), /Nessun episodio/);
});

test('changes date, place and company of a day of episodes, and copies them to the next episodes', async () => {
	const store = freshStore();
	await store.addToWatchlist([severance]);
	await store.markEpisodes(severance.id, [{ s: 1, e: 1 }, { s: 1, e: 2 }], { date: '2026-11-20' });
	await store.markEpisodes(severance.id, [{ s: 1, e: 3 }], { date: '2026-11-21' });
	assert.equal(await store.updateEpisodeDay(severance.id, '2026-11-20', { date: '2026-11-19', place: 'Divano', withWhom: 'Giulia' }), 2);
	let state = await store.loadAll();
	const of = e => state.viewings.find(viewing => viewing.episodes[0].e === e);
	assert.deepEqual([1, 2].map(e => [of(e).date, of(e).place, of(e).withWhom]), [['2026-11-19', 'Divano', 'Giulia'], ['2026-11-19', 'Divano', 'Giulia']]);
	assert.deepEqual([of(3).date, of(3).place], ['2026-11-21', null], 'gli altri giorni non cambiano');
	// Gli episodi segnati dopo prendono dove e con chi dall'ultimo che li ha.
	await store.markEpisodes(severance.id, [{ s: 1, e: 4 }], { date: '2026-11-22' });
	state = await store.loadAll();
	assert.deepEqual([of(4).place, of(4).withWhom], ['Divano', 'Giulia']);
	await assert.rejects(store.updateEpisodeDay(severance.id, '2026-11-21', { date: '' }), /data/);
});

test('keeps one vote per season and one for the series, without writing it on the episodes', async () => {
	const store = freshStore();
	await store.addToWatchlist([severance]);
	await store.markEpisodes(severance.id, [{ s: 1, e: 1 }], { date: '2026-11-20' });
	const first = await store.setSeriesVote(severance.id, { scope: 'season', season: 1, rating: 9 });
	const again = await store.setSeriesVote(severance.id, { scope: 'season', season: 1, rating: 7.5 });
	assert.equal(again.id, first.id, 'lo stesso voto, cambiato');
	await store.setSeriesVote(severance.id, { scope: 'series', rating: 8.5 });
	let state = await store.loadAll();
	assert.deepEqual(state.viewings.filter(viewing => viewing.scope === 'season').map(viewing => [viewing.season, viewing.rating]), [[1, 7.5]]);
	assert.equal(state.viewings.find(viewing => viewing.scope === 'episodes').rating, null, 'gli episodi restano senza voto');
	const info = seriesProgress(state, severance.id);
	assert.deepEqual([info.seasonVotes.get(1), info.seriesVote], [7.5, 8.5]);
	await store.setSeriesVote(severance.id, { scope: 'season', season: 1, rating: null });
	state = await store.loadAll();
	assert.equal(state.viewings.some(viewing => viewing.scope === 'season'), false);
	await assert.rejects(store.setSeriesVote(severance.id, { scope: 'season', rating: 8 }), /Stagione/);
	await assert.rejects(store.setSeriesVote(severance.id, { scope: 'series', rating: 11 }), /voto/);
	assert.equal((await store.setSeriesStatus(severance.id, 'finished')).status, 'finished');
	await assert.rejects(store.setSeriesStatus(severance.id, 'boh'), /non valido/);
	// Togliere un episodio: la serie non è più completata.
	await store.unmarkEpisodes(severance.id, [{ s: 1, e: 1 }]);
	assert.equal((await store.loadAll()).series.get(severance.id).status, 'watching');
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

test('keeps the OMDb seasons not yet downloaded when a season is added by hand', () => {
	// OMDb dice 3 stagioni; scaricata solo la prima (2 episodi). Si aggiunge la quarta, uscita da poco.
	const omdb = withOmdbSeason(structureFromOmdb(3, {}, NOW), 1, ['Uno', 'Due'], NOW);
	const edited = customStructure(omdb, [2, 0, 0, 8], NOW);
	assert.deepEqual(edited.list.map(season => [season.n, season.episodes, season.source]), [[1, 2, 'omdb'], [2, 0, 'omdb'], [3, 0, 'omdb'], [4, 8, 'custom']]);
	assert.deepEqual(missingOmdbSeasons(edited), [2, 3], 'le stagioni 2 e 3 si scaricano ancora da OMDb');
	assert.equal(edited.source, 'mixed');
});

test('moves votes and notes of the episodes to the season and the series note (1.0 → 1.1)', async () => {
	const store = freshStore();
	await store.addToWatchlist([severance]);
	const add = input => store.addViewing({ movieId: severance.id, scope: 'episodes', round: 1, ...input });
	// Giro 1: due episodi della stagione 1 votati (8 e 7), uno con una nota; la stagione 2 ha già il suo voto.
	await add({ date: '2026-11-20', episodes: [{ s: 1, e: 1 }], rating: 8, notes: '<p>Che inizio</p>' });
	await add({ date: '2026-11-21', episodes: [{ s: 1, e: 2 }], rating: 7 });
	await add({ date: '2026-11-22', episodes: [{ s: 2, e: 1 }], rating: 10 });
	await store.addViewing({ movieId: severance.id, date: '2026-11-22', scope: 'season', season: 2, rating: 6, notes: '<p>Lenta</p>' });
	// Giro 2: rivisto l'episodio 1.
	await add({ date: '2026-11-25', episodes: [{ s: 1, e: 1 }], round: 2 });
	assert.ok(await store.simplifySeries() > 0);
	const state = await store.loadAll();
	const episodes = state.viewings.filter(viewing => viewing.scope === 'episodes');
	assert.ok(episodes.every(viewing => viewing.rating === null && viewing.notes === ''), 'gli episodi restano senza voto e note');
	const info = seriesProgress(state, severance.id);
	assert.equal(info.seasonVotes.get(1), 7.5, 'la media degli episodi diventa il voto alla stagione');
	assert.equal(info.seasonVotes.get(2), 6, 'la stagione che aveva un voto lo tiene');
	assert.equal(info.seen, 3, 'contano gli episodi di tutti i giri');
	const note = state.series.get(severance.id).notes;
	// (Senza DOM, nei test, il filtro delle note tiene solo il testo.)
	assert.match(note, /S1·E1 · 20 novembre 2026 Che inizio/);
	assert.match(note, /Stagione 2 · 22 novembre 2026 Lenta/);
	// Una seconda volta non c'è più niente da fare, e la nota non si ripete.
	assert.equal(await store.simplifySeries(), 0);
	assert.equal((await store.loadAll()).series.get(severance.id).notes, note);
});

test('keeps a general note on the series, also before starting it', async () => {
	const store = freshStore();
	await store.addToWatchlist([severance]);
	await store.setSeriesNote(severance.id, '<p onclick="x()">Da vedere con calma</p><script>alert(1)</script>');
	const record = (await store.loadAll()).series.get(severance.id);
	assert.match(record.notes, /^<p>Da vedere con calma/, 'filtrata come le note del diario');
	assert.doesNotMatch(record.notes, /<script|onclick/);
	assert.equal(record.status, null, 'una nota non fa iniziare la serie');
	await store.setSeriesStatus(severance.id, 'finished');
	assert.match((await store.loadAll()).series.get(severance.id).notes, /Da vedere con calma/);
	await store.setSeriesNote(severance.id, '<p> </p>');
	assert.equal((await store.loadAll()).series.get(severance.id).notes, '');
});
