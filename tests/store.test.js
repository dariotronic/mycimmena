// Negozio dati su un IndexedDB finto in memoria (fake-indexeddb): ogni test apre un database nuovo.
import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { createStore, normalizeMovie, normalizeViewing, SCHEMA_VERSION } from '../www/assets/js/store.js';

const freshStore = () => createStore({ indexedDB: new IDBFactory(), name: 'test' });
const alien = { id: 'tt0078748', title: 'Alien', year: 1979, type: 'movie', poster: 'https://m.media-amazon.com/images/M/a._V1_.jpg', stars: 'Sigourney Weaver' };
const thing = { id: 'tt0084787', title: 'The Thing', year: '1982', type: 'movie' };

test('creates every store of the current schema and starts empty', async () => {
	const store = freshStore();
	const db = await store.open();
	assert.equal(SCHEMA_VERSION, 2);
	assert.deepEqual([...db.objectStoreNames].sort(), ['kv', 'movies', 'posters', 'series', 'viewings', 'watchlist']);
	const state = await store.loadAll();
	assert.equal(state.movies.size, 0);
	assert.deepEqual(state.watchlist, []);
	assert.deepEqual(state.viewings, []);
	assert.equal(state.planned, null);
});

test('adds titles to the watchlist once, keeping the catalog and skipping duplicates', async () => {
	const store = freshStore();
	assert.deepEqual(await store.addToWatchlist([alien, thing]), ['tt0078748', 'tt0084787']);
	assert.deepEqual(await store.addToWatchlist([alien]), []);
	const state = await store.loadAll();
	assert.equal(state.watchlist.length, 2);
	assert.equal(state.watchlist[0].hype, null);
	assert.equal(state.movies.get('tt0078748').posterUrl, alien.poster);
	assert.equal(state.movies.get('tt0078748').year, '1979');
	await assert.rejects(store.addToWatchlist([{ id: 'nm123', title: 'Persona' }]), /ID IMDb/);
});

test('saves the personal Hypometro from 0 to 5', async () => {
	const store = freshStore();
	await store.addToWatchlist([alien]);
	assert.equal(await store.setHype('tt0078748', 0), 0);
	assert.equal(await store.setHype('tt0078748', 5), 5);
	await assert.rejects(store.setHype('tt0078748', 6), /da 0 a 5/);
	await assert.rejects(store.setHype('tt0084787', 2), /non è più nella watchlist/);
	assert.equal((await store.loadAll()).watchlist[0].hype, 5);
});

test('plans an evening with watchlist titles and drops removed titles from it', async () => {
	const store = freshStore();
	await store.addToWatchlist([alien, thing]);
	await store.savePlanned({ date: '2026-12-05', place: ' Divano ', movieIds: ['tt0078748', 'tt0084787', 'tt0078748'] });
	let { planned } = await store.loadAll();
	assert.deepEqual(planned.movieIds, ['tt0078748', 'tt0084787']);
	assert.equal(planned.place, 'Divano');
	await store.removeFromWatchlist('tt0084787');
	({ planned } = await store.loadAll());
	assert.deepEqual(planned.movieIds, ['tt0078748']);
	await assert.rejects(store.savePlanned({ movieIds: ['tt0084787'] }), /non è più nella watchlist/);
	await assert.rejects(store.savePlanned({ date: '5 dicembre', movieIds: [] }), /Data/);
	await store.clearPlanned();
	assert.equal((await store.loadAll()).planned, null);
});

test('turns a finished evening into diary entries and empties it, all or nothing', async () => {
	const store = freshStore();
	await store.addToWatchlist([alien, thing]);
	await store.savePlanned({ date: null, place: 'Cinema', movieIds: ['tt0078748', 'tt0084787'] });
	const created = await store.completePlanned('2026-11-22');
	assert.equal(created.length, 2);
	const state = await store.loadAll();
	assert.equal(state.planned, null);
	assert.deepEqual(state.watchlist, []);
	assert.deepEqual(state.viewings.map(viewing => [viewing.movieId, viewing.date, viewing.place, viewing.rating]).sort(), [
		['tt0078748', '2026-11-22', 'Cinema', null], ['tt0084787', '2026-11-22', 'Cinema', null]
	]);
	await assert.rejects(store.completePlanned('2026-11-22'), /Non c’è una serata/);
});

test('keeps several viewings per title, edits and deletes them', async () => {
	const store = freshStore();
	await store.addToWatchlist([alien]);
	const first = await store.addViewing({ movieId: 'tt0078748', date: '2026-01-10', rating: 8.5, notes: 'Bellissimo' }, { removeFromWatchlist: true });
	const second = await store.addViewing({ movieId: 'tt0078748', date: '2026-11-20', rating: 9, withWhom: 'Anna' });
	let state = await store.loadAll();
	assert.deepEqual(state.watchlist, []);
	assert.equal(state.viewings.length, 2);
	assert.notEqual(first.id, second.id);
	const edited = await store.updateViewing(first.id, { rating: 7, place: 'Casa' });
	assert.equal(edited.rating, 7);
	assert.equal(edited.createdAt, first.createdAt);
	assert.equal(edited.movieId, 'tt0078748');
	await store.deleteViewing(second.id);
	state = await store.loadAll();
	assert.deepEqual(state.viewings.map(viewing => viewing.id), [first.id]);
	await assert.rejects(store.addViewing({ movieId: 'tt0084787', date: '2026-01-10' }), /Titolo sconosciuto/);
	await assert.rejects(store.updateViewing('nessuno', { rating: 5 }), /non esiste più/);
});

test('validates viewings: date, half-step rating from ½ to 10, text limits', () => {
	const base = { movieId: 'tt0078748', date: '2026-11-22' };
	assert.equal(normalizeViewing({ ...base, rating: '7.5' }).rating, 7.5);
	assert.equal(normalizeViewing({ ...base, rating: '' }).rating, null);
	assert.throws(() => normalizeViewing({ ...base, rating: 7.3 }), /mezza spipa/);
	assert.throws(() => normalizeViewing({ ...base, rating: 0 }), /mezza spipa/);
	assert.throws(() => normalizeViewing({ ...base, date: '' }), /data/);
	assert.equal(normalizeViewing({ ...base, place: '   ' }).place, null);
	assert.equal(normalizeViewing({ ...base, place: 'x'.repeat(500) }).place.length, 120);
	// Senza DOM le note restano solo testo, mai HTML attivo.
	assert.equal(normalizeViewing({ ...base, notes: '<script>alert(1)</script><b>ok</b>' }).notes, '<p>alert(1) ok</p>');
	assert.equal(normalizeMovie({ id: 'tt1', title: ' X ', year: 'boh', poster: 'http://insicuro' }).posterUrl, '');
});

test('stores poster blobs by title', async () => {
	const store = freshStore();
	assert.equal(await store.getPoster('tt0078748'), null);
	await store.savePoster('tt0078748', new Blob(['img'], { type: 'image/jpeg' }));
	assert.deepEqual(await store.posterIds(), ['tt0078748']);
	assert.equal(await (await store.getPoster('tt0078748')).text(), 'img');
});
