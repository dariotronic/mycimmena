// Fase 1: modello dati delle viste, ricerca IMDb, diario, modulo della visione e "I miei voti".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildAppData, viewingsOf, viewMovie } from '../www/assets/js/app-data.js';
import { imdbSearchUrl, parseImdbResults, searchImdb } from '../www/assets/js/imdb.js';
import { contentType, escapeHtml, meetingMovies, movieName } from '../www/assets/js/domain.js';
import { createViews } from '../www/assets/js/views.js';

const catalog = new Map([
	['tt1', { id: 'tt1', title: 'Alien', year: '1979', type: 'movie', posterUrl: 'https://m.media-amazon.com/images/M/a._V1_.jpg', stars: 'Sigourney Weaver', details: null }],
	['tt2', { id: 'tt2', title: 'The Thing', year: '1982', type: 'movie', posterUrl: '', stars: '', details: { director: 'John Carpenter', plot: 'Antartide.' } }],
	['tt3', { id: 'tt3', title: 'Dune', year: '2021', type: 'movie', posterUrl: '', stars: '', details: null }]
]);
const state = {
	movies: catalog,
	watchlist: [
		{ movieId: 'tt1', addedAt: '2026-11-01T10:00:00Z', hype: 4, note: null },
		{ movieId: 'tt3', addedAt: '2026-11-02T10:00:00Z', hype: null, note: null }
	],
	viewings: [
		{ id: 'a', movieId: 'tt2', date: '2026-10-01', rating: 8, place: 'Cinema', withWhom: null, notes: '', createdAt: '2026-10-01T22:00:00Z' },
		{ id: 'b', movieId: 'tt2', date: '2026-11-20', rating: 9.5, place: null, withWhom: 'Anna', notes: '<p>Ancora meglio</p>', createdAt: '2026-11-20T22:00:00Z' },
		{ id: 'c', movieId: 'tt2', date: '2026-11-21', rating: null, place: null, withWhom: null, notes: '', createdAt: '2026-11-21T22:00:00Z' },
		{ id: 'x', movieId: 'tt999', date: '2026-11-21', rating: 5, notes: '', createdAt: '2026-11-21T22:00:00Z' }
	],
	planned: { date: '2026-12-05', place: 'Divano', movieIds: ['tt3'] }
};

test('builds the view data from the store: watchlist with personal hype, planned evening and sorted diary', () => {
	const data = buildAppData(state, { posterUrlFor: id => (id === 'tt1' ? 'blob:locandina' : '') });
	assert.deepEqual(data.movies.map(movie => [movie.id, movie.hype, movie.votes.total, movie.votes.count]), [['tt1', 4, 4, 1], ['tt3', null, 0, 0]]);
	assert.equal(data.movies[0].poster_local, 'blob:locandina');
	assert.equal(data.movies[0].poster, catalog.get('tt1').posterUrl);
	assert.equal(data.movies[0].added_at, '2026-11-01T10:00:00Z');
	assert.deepEqual(data.upcoming, { date: '2026-12-05', place: 'Divano', movies: [data.movies[1]] });
	// Dalla più recente; una visione di un titolo sparito dal catalogo non si mostra.
	assert.deepEqual(data.viewings.map(viewing => viewing.id), ['c', 'b', 'a']);
	assert.equal(data.viewings[0].movie.director, 'John Carpenter');
	const empty = buildAppData(null);
	assert.deepEqual([empty.movies, empty.upcoming, empty.viewings, empty.watching, empty.mode, empty.favorite], [[], null, [], [], 'light', null]);
	assert.equal(viewMovie(catalog.get('tt1')).stars, 'Sigourney Weaver');
});

test('averages only rated viewings of a title', () => {
	const data = buildAppData(state);
	const { list, average, ratedCount } = viewingsOf(data, 'tt2');
	assert.equal(list.length, 3);
	assert.equal(ratedCount, 2);
	assert.equal(average, 8.75);
	assert.deepEqual(viewingsOf(data, 'tt1'), { list: [], average: null, ratedCount: 0 });
});

test('searches IMDb suggestions and keeps only titles', async () => {
	assert.equal(imdbSearchUrl('  Alien  Romulus '), 'https://v2.sg.media-imdb.com/suggestion/a/alien%20romulus.json');
	assert.equal(imdbSearchUrl('È stata la mano di Dio'), 'https://v2.sg.media-imdb.com/suggestion/x/%C3%A8%20stata%20la%20mano%20di%20dio.json');
	const payload = { d: [
		{ id: 'tt0078748', l: 'Alien', y: 1979, qid: 'movie', s: 'Sigourney Weaver, Tom Skerritt', i: { imageUrl: 'https://m.media-amazon.com/images/M/x._V1_.jpg' } },
		{ id: 'tt13623632', l: 'Alien: Earth', y: 2025, qid: 'tvSeries', s: 'Sydney Chandler' },
		{ id: 'in0000265', l: 'Alien', s: 'Franchise' },
		{ id: 'nm0000244', l: 'Sigourney Weaver' },
		{ id: 'tt1', l: 'Insicuro', i: { imageUrl: 'http://esempio.it/a.jpg' } }
	] };
	assert.deepEqual(parseImdbResults(payload), [
		{ id: 'tt0078748', title: 'Alien', year: '1979', type: 'movie', poster: 'https://m.media-amazon.com/images/M/x._V1_.jpg', stars: 'Sigourney Weaver, Tom Skerritt' },
		{ id: 'tt13623632', title: 'Alien: Earth', year: '2025', type: 'series', poster: '', stars: 'Sydney Chandler' },
		{ id: 'tt1', title: 'Insicuro', year: '', type: '', poster: '', stars: '' }
	]);
	const calls = [];
	const ok = await searchImdb('alien', { fetchImpl: async url => { calls.push(url); return { ok: true, json: async () => payload }; } });
	assert.equal(ok.length, 3);
	assert.deepEqual(calls, ['https://v2.sg.media-imdb.com/suggestion/a/alien.json']);
	assert.deepEqual(await searchImdb('   '), []);
	await assert.rejects(searchImdb('alien', { fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
	await assert.rejects(searchImdb('alien', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), /IMDb non risponde/);
	await assert.rejects(searchImdb('alien', { fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('x'); } }) }), /formato inatteso/);
});

function makeViews(data) {
	return createViews({
		getData: () => data,
		getMovieSearchMode: () => 'watchlist', getMovieSort: () => 'title-asc', getOmdbQuery: () => '', getSelectedMovieId: () => null,
		getWatchlistQuery: () => '', getWatchlistType: () => '',
		contentType, escapeHtml, meetingMovies, movieName,
		emptyState: (message, linkText = '') => `<div class="empty-state">${message}${linkText}</div>`,
		formatDate: value => `il ${value}`, infoButton: movie => `<button class="movie-info-trigger" data-movie-id="${movie.id}"></button>`,
		movieDetails: () => '', poster: () => '<img>', selectableMovies: () => data.movies, titleWithInfo: (_movie, title) => title,
		today: () => '2026-11-22'
	});
}

test('lists the diary by day, newest first, with ratings, notes and a title search', () => {
	const data = buildAppData(state);
	const html = makeViews(data).renderDiary();
	assert.match(html, /<h1>Diario<\/h1>/);
	const days = [...html.matchAll(/<time datetime="([^"]+)">/g)].map(match => match[1]);
	assert.deepEqual(days, ['2026-11-21', '2026-11-20', '2026-10-01']);
	assert.match(html, /9 spipe e ½ su 10/);
	assert.match(html, /Senza voto/);
	assert.match(html, /<p class="diary-meta">con Anna<\/p>/);
	assert.match(html, /<div class="review-content diary-notes"><p>Ancora meglio<\/p><\/div>/);
	assert.match(html, /class="icon-button small viewing-edit" data-viewing-id="b"/);
	const empty = makeViews(buildAppData({ ...state, viewings: [] })).renderDiary();
	assert.match(empty, /Il diario è vuoto/);
});

test('shows "I miei voti" on the movie card with every viewing and the average', () => {
	const data = buildAppData(state);
	const views = makeViews(data);
	const thing = data.viewings[0].movie;
	const html = views.renderMyViewings(thing);
	assert.match(html, /I miei voti/);
	assert.match(html, /Media 9 spipe su 10 · 3 visioni/);
	assert.deepEqual([...html.matchAll(/data-viewing-id="([^"]+)"/g)].map(match => match[1]), ['c', 'b', 'a']);
	assert.match(html, /Segna come visto di nuovo/);
	// Mai visto ma in watchlist: solo il pulsante; né visto né in watchlist: niente.
	assert.match(views.renderMyViewings(data.movies[0]), /^<div class="movie-info-mark">.*Segna come visto<\/span>/s);
	assert.equal(views.renderMyViewings({ id: 'tt777', title: 'Altro' }), '');
});

test('renders the viewing form with optional rating, notes and the watchlist switch', () => {
	const data = buildAppData(state);
	const views = makeViews(data);
	const fresh = views.renderViewingForm({ movie: data.movies[0], inWatchlist: true });
	assert.match(fresh, /data-review-form="tt1" data-viewing-form novalidate/);
	assert.match(fresh, /name="date" type="date" required value="2026-11-22" max="2026-11-22"/);
	assert.match(fresh, /<input type="hidden" name="rating" value="">/);
	assert.match(fresh, /class="text-button viewing-clear-rating" type="button" hidden/);
	assert.match(fresh, /name="removeFromWatchlist" type="checkbox" role="switch" checked/);
	assert.doesNotMatch(fresh, /viewing-delete/);
	const viewing = data.viewings.find(item => item.id === 'b');
	const edit = views.renderViewingForm({ movie: viewing.movie, viewing });
	assert.match(edit, /data-viewing-id="b"/);
	assert.match(edit, /name="date" type="date" required value="2026-11-20"/);
	assert.match(edit, /<input type="hidden" name="rating" value="9.5">/);
	assert.match(edit, /value="Anna"/);
	assert.match(edit, /class="button secondary viewing-delete"/);
	assert.doesNotMatch(edit, /removeFromWatchlist/);
});

test('asks how a past evening went and summarizes the home page otherwise', () => {
	const past = buildAppData({ ...state, planned: { date: '2026-11-01', place: null, movieIds: ['tt1', 'tt3'] } });
	const html = makeViews(past).renderHome();
	assert.match(html, /Com’è andata\?/);
	assert.match(html, /i 2 titoli vanno nel diario, dove puoi dare i voti/);
	assert.match(html, /id="complete-meeting"/);
	assert.match(html, /id="clear-meeting"/);
	const free = makeViews(buildAppData({ ...state, planned: null })).renderHome();
	assert.match(free, /Non c’è ancora una serata in programma/);
	assert.match(free, /<h2 id="home-next-title" class="section-title">Da vedere<\/h2>[\s\S]*Alien \(1979\)/);
	assert.match(free, /Visti di recente[\s\S]*The Thing \(1982\)/);
});

test('adds "mark as seen" to every watchlist row', () => {
	const html = makeViews(buildAppData(state)).renderMovieRows();
	assert.match(html, /class="button secondary icon-only mark-seen" data-movie-id="tt1"[^>]*aria-label="Segna Alien come visto"/);
	assert.match(html, /aria-label="Aggiungi Alien alla serata" title="Aggiungi alla serata"/);
});

test('wires the diary, search, posters and evening to the local store', () => {
	const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
	const script = read('../www/script.js');
	assert.match(script, /state = await store\.loadAll\(\);/);
	assert.match(script, /const added = await store\.addToWatchlist\(movies\);/);
	assert.match(script, /await store\.removeFromWatchlist\(movieId\);/);
	assert.match(script, /store\.requestPersistence\(\);/);
	assert.match(read('../www/assets/js/search.js'), /await searchImdb\(query\)/);
	const meeting = read('../www/assets/js/meeting.js');
	for (const call of ['store.savePlanned(', 'store.completePlanned(today())', 'store.clearPlanned()']) assert.ok(meeting.includes(call), call);
	const diary = read('../www/assets/js/diary.js');
	for (const call of ['store.updateViewing(', 'store.addViewing(input, { removeFromWatchlist })', 'store.deleteViewing(']) assert.ok(diary.includes(call), call);
	const index = read('../www/index.html');
	assert.match(index, /<dialog id="viewing-dialog"/);
	assert.match(index, /<section id="movie-info-viewings"/);
	assert.doesNotMatch(index, /reviews-dialog-body|id="reviews-dialog"/);
});
