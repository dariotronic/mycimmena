// Fase 2: profilo, sezione Episodi, "Stai guardando", Impostazioni, modulo dei voti di stagione e serie.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildAppData } from '../www/assets/js/app-data.js';
import { contentType, escapeHtml, meetingMovies, movieName } from '../www/assets/js/domain.js';
import { birthdayFromParts, birthdayMonthDay, diaryDefaults, flavourLine, isBirthday, profileValues } from '../www/assets/js/profile.js';
import { renderSeriesSection, renderWatchingRow } from '../www/assets/js/series-ui.js';
import { customStructure } from '../www/assets/js/series.js';
import { STEPS } from '../www/assets/js/onboarding.js';
import { createViews } from '../www/assets/js/views.js';

const NOW = '2026-11-22T10:00:00.000Z';
const seasons = customStructure(null, [3, 2], NOW);
seasons.list[0] = { ...seasons.list[0], titles: ['Pilota', 'Due', 'Tre'], source: 'omdb' };
const state = {
	movies: new Map([
		['tt11280740', { id: 'tt11280740', title: 'Severance', year: '2022', type: 'series', posterUrl: '', stars: '', details: null, seasons }],
		['tt0084787', { id: 'tt0084787', title: 'The Thing', year: '1982', type: 'movie', posterUrl: '', stars: '', details: null }]
	]),
	watchlist: [],
	viewings: [
		{ id: 's1', movieId: 'tt11280740', date: '2026-11-20', scope: 'episodes', episodes: [{ s: 1, e: 1 }, { s: 1, e: 2 }], round: 1, rating: 7, createdAt: NOW },
		{ id: 's2', movieId: 'tt11280740', date: '2026-11-21', scope: 'season', season: 1, round: 1, rating: 9, createdAt: NOW },
		{ id: 's3', movieId: 'tt11280740', date: '2026-11-21', scope: 'series', round: 1, rating: 8.5, createdAt: NOW }
	],
	series: new Map([['tt11280740', { movieId: 'tt11280740', status: 'watching', round: 1, updatedAt: NOW }]]),
	planned: null,
	profile: { name: 'Dario', birthday: '1990-11-22', favoriteMovieId: 'tt0084787', place: 'divano', company: 'coppia', popcorn: 'salati', language: 'originale', spectator: 'commento' },
	settings: { detailMode: 'full', omdbKeyStatus: 'missing' },
	onboarding: { done: true }
};
const poster = () => '<img>';

function makeViews(data) {
	return createViews({
		getData: () => data,
		getMovieSearchMode: () => 'watchlist', getMovieSort: () => 'title-asc', getOmdbQuery: () => '', getSelectedMovieId: () => null,
		getWatchlistQuery: () => '', getWatchlistType: () => '',
		contentType, escapeHtml, meetingMovies, movieName, poster,
		emptyState: message => `<div class="empty-state">${message}</div>`,
		formatDate: value => `il ${value}`, infoButton: () => '', movieDetails: () => '', selectableMovies: () => [],
		titleWithInfo: (_movie, title) => title, today: () => '2026-11-22'
	});
}

test('turns onboarding answers into diary defaults, a flavour line and birthday wishes', () => {
	assert.deepEqual(diaryDefaults(state.profile), { place: 'Divano', withWhom: 'la mia metà' });
	assert.deepEqual(diaryDefaults({ company: 'solo' }), { place: '', withWhom: '' });
	assert.equal(flavourLine(state.profile), 'Purista della lingua originale · Commento tutto · 🍿');
	assert.equal(flavourLine({}), '');
	assert.equal(isBirthday('1990-11-22', '2026-11-22'), true);
	assert.equal(isBirthday('1990-11-21', '2026-11-22'), false);
	assert.equal(isBirthday('', '2026-11-22'), false);
	// Dal 0.6 si chiedono solo giorno e mese.
	assert.equal(isBirthday('11-22', '2026-11-22'), true);
	assert.equal(birthdayFromParts('22', '11'), '11-22');
	assert.equal(birthdayFromParts('30', '2'), '', 'il 30 febbraio non esiste');
	assert.equal(birthdayFromParts('', '2'), '');
	assert.equal(birthdayMonthDay('1990-02-29'), '02-29');
	assert.deepEqual(profileValues({ name: 'Dario', birthdayDay: '4', birthdayMonth: '5' }), { name: 'Dario', birthday: '05-04' });
	assert.deepEqual(profileValues({ name: 'Dario', birthdayDay: '', birthdayMonth: '' }), { name: 'Dario', birthday: '' });
	assert.deepEqual(STEPS, ['welcome', 'who', 'chat', 'cards', 'confirm', 'key', 'backup', 'import', 'end']);
});

test('shows the next episode, season progress and episode titles in the series card', () => {
	const data = buildAppData(state);
	const info = data.seriesOf('tt11280740');
	assert.deepEqual(info.next, { s: 1, e: 3 });
	assert.equal(info.remaining, 3);
	const html = renderSeriesSection(data.movieById('tt11280740'), info, { mode: 'light' });
	assert.match(html, /Prossimo: <strong>S1·E3 «Tre»<\/strong> · 3 episodi rimasti/);
	assert.match(html, /data-series-next data-movie-id="tt11280740"[^>]*>.*Visto S1·E3/s);
	assert.match(html, /<details class="series-season" data-season="1" open>/);
	assert.match(html, /<span class="series-season-count">2\/3<\/span>/);
	assert.match(html, /data-episode="1-1" aria-pressed="true" aria-label="S1·E1 Pilota, visto il [^"]+"/);
	assert.match(html, /data-season="2">\s*<summary><span>Stagione 2<\/span><span class="series-custom-badge">inserita da te<\/span>/);
	assert.match(html, /data-series-structure>La struttura non è giusta\?/);
	// Senza struttura: il modulo veloce con stagioni ed episodi per stagione.
	const empty = renderSeriesSection({ id: 'tt1', has_details: false }, { seasons: null, watched: new Set(), status: null }, { mode: 'light' });
	assert.match(empty, /data-series-structure>Indica stagioni ed episodi/, "senza struttura si apre l’editor stagione per stagione");
	assert.match(empty, /indica le stagioni della serie/);
	assert.match(renderSeriesSection({ id: 'tt1', has_details: false }, { seasons: null, watched: new Set() }, { mode: 'full' }), /Caricamento delle stagioni da OMDb/);
});

test('lists series in progress under "Stai guardando" with a quick button for the next episode', () => {
	const data = buildAppData(state);
	assert.equal(data.watching.length, 1);
	const row = renderWatchingRow(data.watching[0], { poster });
	// Il prossimo episodio in evidenza, con il titolo; sotto quanti ne mancano.
	assert.match(row, /<p class="watching-next"><span class="watching-next-label">Prossimo<\/span><strong>S1·E3<\/strong><span class="watching-next-title">«Tre»<\/span><\/p>/);
	assert.match(row, /<p class="movie-year">3 episodi rimasti<\/p>/);
	assert.match(row, /aria-label="Segna S1·E3 di Severance come visto"/);
	const paused = renderWatchingRow({ ...data.watching[0], status: 'paused' }, { poster });
	assert.match(paused, /In pausa/);
	assert.doesNotMatch(paused, /data-series-next/);
	assert.match(makeViews(data).renderHome(), /<h2 id="watching-title" class="section-title">Stai guardando<\/h2>/);
	assert.match(makeViews(data).renderMovieList(), /Stai guardando/);
});

test('groups "I miei voti" of a series: overall vote, seasons, then sessions', () => {
	const data = buildAppData(state);
	const html = makeViews(data).renderMyViewings(data.movieById('tt11280740'));
	assert.match(html, /Serie: 8 spipe e ½ su 10/);
	assert.match(html, /<li class="series-vote-row"><span>Stagione 1<\/span><span>9 spipe su 10<\/span><\/li>/);
	assert.match(html, /il 2026-11-20 · S1·E1–E2/);
	assert.deepEqual(data.viewings.map(viewing => viewing.label), ['Stagione 1', 'Voto alla serie', 'S1·E1–E2']);
});

test('opens the rating form for a season without proposing place and company', () => {
	const data = buildAppData(state);
	const views = makeViews(data);
	const season = views.renderViewingForm({ movie: data.movieById('tt11280740'), scope: 'season', season: 2 });
	assert.match(season, /data-viewing-form data-scope="season" data-season="2"/);
	assert.match(season, /Severance \(2022\) <span class="diary-label">· Stagione 2<\/span>/);
	assert.match(season, /name="place" type="text" maxlength="120" value=""/);
	assert.doesNotMatch(season, /removeFromWatchlist/);
	// Una visione nuova di un film propone le risposte dell'onboarding.
	const film = views.renderViewingForm({ movie: data.movieById('tt0084787') });
	assert.match(film, /name="place" type="text" maxlength="120" value="Divano"/);
	assert.match(film, /name="withWhom" type="text" maxlength="120" value="la mia metà"/);
});

test('shows profile, detail mode, key actions, info page and credit in Settings', () => {
	const views = makeViews(buildAppData(state));
	const waiting = views.renderSettings();
	assert.match(waiting, /<p>Ciao, Dario!<\/p>/);
	assert.match(waiting, /data-notify="notifyBirthday">/, 'con il compleanno l’interruttore degli auguri si usa');
	assert.match(waiting, /<option value="11" selected>novembre<\/option>/);
	assert.match(waiting, /<option value="22" selected>22<\/option>/);
	// Senza nome si saluta e basta; senza compleanno gli auguri sono spenti e l'interruttore non si usa.
	const anonymous = makeViews(buildAppData({ ...state, profile: {} })).renderSettings();
	assert.match(anonymous, /<p>Ciao!<\/p>/);
	// Film del cuore: card con la croce se c'è, altrimenti la ricerca; si salva con il resto del profilo.
	assert.match(waiting, /<input type="hidden" name="favoriteMovieId" value="tt0084787">/);
	assert.match(waiting, /data-movie-picker-chosen>[\s\S]*The Thing[\s\S]*data-movie-picker-clear/);
	assert.match(waiting, /data-movie-picker-search hidden>/);
	assert.match(anonymous, /name="favoriteMovieId" value="">/);
	assert.match(anonymous, /data-movie-picker-chosen hidden>/);
	assert.match(readFileSync(new URL('../www/assets/js/settings.js', import.meta.url), 'utf8'), /bindMoviePicker\(form, \{ onPick: movie => store\.saveMovie\(movie\) \}\)/, 'scegliere il film non salva il profilo');
	assert.doesNotMatch(anonymous, /Senza nome/);
	assert.match(anonymous, /aria-checked="false" aria-labelledby="notify-birthday-label" data-notify="notifyBirthday" disabled>/);
	assert.match(waiting, /Purista della lingua originale · Commento tutto · 🍿/);
	assert.match(waiting, /Film del cuore: The Thing \(1982\)/);
	assert.match(waiting, /Completa, in attesa della chiave/);
	assert.match(waiting, /data-open-key>Inserisci la chiave/);
	assert.match(waiting, /data-settings-mode="light">Torna alla versione light/);
	assert.match(waiting, /href="#informazioni"/);
	assert.match(waiting, /<option value="originale" selected>Lingua originale pura<\/option>/);
	const full = makeViews(buildAppData({ ...state, settings: { detailMode: 'full', omdbKey: 'a1b2c3d4', omdbKeyStatus: 'valid' } })).renderSettings();
	assert.match(full, /Chiave: ••••••d4\./);
	assert.doesNotMatch(full, /a1b2c3d4/, 'la chiave intera non si mostra');
	const light = makeViews(buildAppData({ ...state, settings: { detailMode: 'light' } })).renderSettings();
	assert.match(light, /data-settings-mode="full">Passa alla versione completa/);
	const info = views.renderInfo();
	assert.match(info, /CC BY-NC 4\.0/);
	assert.match(info, /myCimmena non è collegata a IMDb/);
	assert.match(info, /Nessuna pubblicità, nessuna statistica d'uso/);
});

test('greets on the birthday and wires onboarding, banner, key dialog and Android back', () => {
	const home = makeViews(buildAppData(state)).renderHome();
	assert.match(home, /🎂 Buon compleanno, Dario!/);
	assert.match(home, /Per festeggiare: The Thing \(1982\), il tuo film del cuore\?/);
	const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
	const index = read('../www/index.html');
	for (const id of ['onboarding', 'mode-banner', 'completion-indicator', 'omdb-key-dialog', 'series-structure-dialog', 'movie-info-series']) assert.match(index, new RegExp(`id="${id}"`));
	assert.match(read('../www/style.css'), /html\[data-onboarding="true"\] \.site-shell > :not\(dialog\) \{ display: none; \}/, 'le finestre restano visibili durante l’onboarding');
	const pkg = JSON.parse(read('../package.json'));
	for (const plugin of ['@capacitor/app', '@capacitor/browser', '@capacitor/clipboard']) assert.ok(pkg.dependencies[plugin], plugin);
	const keySetup = read('../www/assets/js/key-setup.js');
	assert.match(keySetup, /Capacitor\?\.Plugins\?\.Clipboard/);
	assert.match(keySetup, /document\.addEventListener\('visibilitychange', onVisible\)/);
});

test('lets the user mark a series as completed, vote a season and keep a note on it', () => {
	const seasons = { source: 'custom', list: [{ n: 1, episodes: 2, titles: null, source: 'custom' }] };
	const info = { seasons, watched: new Set(['1-1']), next: { s: 1, e: 2 }, status: 'watching', remaining: 1, total: 2, episodes: new Map(), notes: '', seasonVotes: new Map() };
	const movie = { id: 'tt11280740', title: 'Severance', type: 'series', has_details: true };
	const html = renderSeriesSection(movie, info, { mode: 'light' });
	assert.deepEqual([...html.matchAll(/data-series-status="(\w+)" aria-pressed="(\w+)">([^<]+)</g)].map(match => [match[1], match[3]]), [['watching', 'In corso'], ['paused', 'In pausa'], ['finished', 'Completata'], ['dropped', 'Abbandonata']]);
	assert.match(html, /data-season-vote="1">Vota la stagione</);
	assert.match(html, /data-series-note>Scrivi una nota sulla serie</);
	const voted = renderSeriesSection(movie, { ...info, status: null, notes: '<p>Da finire</p>', seasonVotes: new Map([[1, { id: 'v', rating: 8 }]]) }, { mode: 'light' });
	assert.match(voted, /Voto alla stagione: 8 spipe su 10/);
	assert.match(voted, /<div class="review-content series-note-text"><p>Da finire<\/p><\/div>/);
	assert.match(voted, /data-series-status="watching" aria-pressed="false"/, 'gli stati si scelgono anche prima di iniziare');
});
