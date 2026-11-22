import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { contentType, escapeHtml, formatSpipe, meetingMovies, movieName, today } from '../www/assets/js/domain.js';
import { icon, iconMap, setIcon } from '../www/assets/js/icons.js';
import { TOASTS, toastMessage } from '../www/assets/js/toasts.js';
import { createViews } from '../www/assets/js/views.js';

// script.js avvia l'app; questi moduli contengono le funzionalità che un tempo stavano tutte in script.js.
// I controlli sul codice sorgente li leggono insieme, così non dipendono dal file in cui sta una funzione.
const APP_MODULES = [
	'theme', 'navigation', 'dialogs', 'movie-info', 'undo', 'diary', 'meeting', 'randomizer', 'watchlist',
	'search', 'review-editor', 'lightbox-zoom', 'store', 'posters', 'imdb', 'app-data'
];
const readAppScripts = () => ['../www/script.js', ...APP_MODULES.map(name => `../www/assets/js/${name}.js`)]
	.map(path => readFileSync(new URL(path, import.meta.url), 'utf8'))
	.join('\n');

function makeViews(overrides = {}) {
	const context = {
		getData: () => ({ upcoming: null, movies: [], viewings: [] }),
		getMovieSearchMode: () => 'watchlist',
		getMovieSort: () => 'title-asc',
		getOmdbQuery: () => '',
		getSelectedMovieId: () => null,
		getWatchlistQuery: () => '',
		getWatchlistType: () => '',
		contentType,
		emptyState: message => `
			<div>${message}</div>
		`,
		escapeHtml,
		formatDate: value => value || '',
		infoButton: () => '',
		meetingMovies,
		movieDetails: () => '',
		movieName,
		poster: () => '<img>',
		selectableMovies: () => [],
		titleWithInfo: (_movie, title) => title,
		today: () => '2026-10-23',
		...overrides
	};
	return createViews(context);
}

test('escapes dynamic text and formats movie labels', () => {
	assert.equal(escapeHtml(`<film title="A & B">'`), '&lt;film title=&quot;A &amp; B&quot;&gt;&#39;');
	assert.equal(movieName({ title: 'Dune', year: 2021 }), 'Dune (2021)');
	assert.equal(movieName({ title: 'Dune', year: null }), 'Dune');
});

test('normalizes content types and meeting movie shapes', () => {
	assert.equal(contentType({ type: 'series' }), 'series');
	assert.equal(contentType({ qid: 'tvEpisode' }), 'episode');
	assert.deepEqual(meetingMovies({ movies: [{ id: 'tt1' }] }), [{ id: 'tt1' }]);
	assert.deepEqual(meetingMovies({ movie: { id: 'tt2' } }), []);
	assert.deepEqual(meetingMovies(null), []);
});

test('uses the Rome calendar day rather than UTC near midnight', () => {
	assert.equal(today(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
});

test('renders calendar form markup without patch artifacts', () => {
	const html = makeViews({ isAuthorized: () => true }).renderCalendar();
	assert.match(html, /<form id="calendar-form"/);
	assert.doesNotMatch(html, /^\+/m);
});

test('renders the home appointment from injected state', () => {
	const views = makeViews({
		getData: () => ({
			upcoming: { date: '2026-11-01', place: 'Cineforum', movies: [{ id: 'tt1', title: 'Dune', year: 2021 }] },
			archive: [],
			movies: []
		})
	});
	assert.match(views.renderHome(), /Dune \(2021\)/);
});

test('confirmation dialog references only existing markup', () => {
	const index = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
	const script = readAppScripts();
	for (const id of ['action-dialog', 'action-dialog-form', 'action-dialog-title', 'action-dialog-message', 'action-dialog-submit', 'action-dialog-cancel']) {
		assert.match(index, new RegExp(`id="${id}"`));
	}
	assert.doesNotMatch(script, /actionDialogError/);
});

test('draws films weighted by the Hypometro, with filters and exclusions', async () => {
	const draw = await import('../www/assets/js/draw.js');
	const movie = (id, total, extra = {}) => ({ id, title: id, year: 2000, votes: { total, count: total ? 1 : 0, mine: null }, ...extra });
	const alien = movie('Alien', 3);
	const thing = movie('Thing', 0, { type: 'series' });
	const dune = movie('Dune', 1);
	// Una pallina per film più una per punto: 4, 1 e 2 su 7.
	assert.equal(draw.drawWeight(alien, true), 4);
	assert.equal(draw.drawWeight(thing, true), 1);
	assert.equal(draw.drawWeight(alien, false), 1);
	const chances = draw.drawChances([alien, thing, dune], true);
	assert.deepEqual(chances.map(({ movie: item, chance }) => [item.id, Number(chance.toFixed(4))]), [['Alien', 0.5714], ['Dune', 0.2857], ['Thing', 0.1429]]);
	assert.ok(draw.drawChances([alien, thing], false).every(({ chance }) => chance === 0.5));
	// Il biglietto cade nelle palline del film: [0, 4) Alien, [4, 5) Thing, [5, 7) Dune.
	assert.equal(draw.drawMovie([alien, thing, dune], true, () => 3.9 / 7).id, 'Alien');
	assert.equal(draw.drawMovie([alien, thing, dune], true, () => 4.5 / 7).id, 'Thing');
	assert.equal(draw.drawMovie([alien, thing, dune], true, () => 6.9 / 7).id, 'Dune');
	assert.equal(draw.drawMovie([], true), null);
	const pool = filters => draw.drawPool([alien, thing, dune], { filters: { ...draw.DEFAULT_DRAW_FILTERS, ...filters } }).map(item => item.id);
	assert.deepEqual(pool({ type: 'series' }), ['Thing']);
	assert.equal('addedBy' in draw.DEFAULT_DRAW_FILTERS, false);
	assert.deepEqual(pool({ minVotes: 1 }), ['Alien', 'Dune']);
	assert.deepEqual(draw.drawPool([alien, thing, dune], { excluded: new Set(['Dune']) }).map(item => item.id), ['Alien', 'Thing']);
	assert.equal(draw.formatChance(0.5714), '57%');
	assert.equal(draw.formatChance(0.0083), '0,8%');
});

test('shows the randomizer options, a big spin button and the odds of every film', () => {
	const movies = [
		{ id: 'tt1', title: 'Alien', year: 1979, votes: { total: 3, count: 1, mine: null } },
		{ id: 'tt2', title: 'The Thing', year: 1982, votes: { total: 0, count: 0, mine: null } }
	];
	const views = makeViews({
		selectableMovies: () => movies,
		getRandomizerState: () => ({ pool: movies, weighted: true, filters: { type: '', minVotes: 0 }, excludedCount: 1, oddsOpen: false }),
		getSelectedMovieId: () => 'tt1',
		poster: (_movie, className = 'movie-poster') => `<img class="${className}">`
	});
	const html = views.renderComingFilms();
	assert.match(html, /id="choose-film" class="button icon-only roulette-spin" type="button" data-randomizer-control aria-label="Gira ancora"/);
	assert.match(html, /id="exclude-picked"[^>]*aria-label="Escludi e rigira"/);
	assert.match(html, /<p class="filter-label">Calibrazione<\/p>[\s\S]*?id="randomizer-weighted" class="switch" type="checkbox" role="switch" data-randomizer-control checked/);
	assert.doesNotMatch(html, /data-randomizer-filter="addedBy"|Aggiunto da/);
	assert.match(html, /id="randomizer-min-votes" type="range" min="0" max="3"/);
	// La slot non è una regione aria-live; il film estratto non ha toast, scartarlo sì.
	assert.doesNotMatch(html, /id="roulette"[^>]*aria-live/);
	assert.equal(TOASTS.filmPicked, undefined);
	assert.equal(toastMessage('movieExcluded', { title: 'Alien (1979)' }), 'Scartato: Alien (1979)');
	// Il conteggio sta sopra la slot, le probabilità sotto; su mobile le opzioni si aprono in un modale.
	assert.ok(html.indexOf('id="randomizer-count"') < html.indexOf('id="roulette"'));
	assert.ok(html.indexOf('id="randomizer-odds"') > html.indexOf('id="roulette"'));
	assert.match(html, /id="randomizer-filter-open"[^>]*aria-controls="randomizer-filter-dialog" aria-pressed="false"/);
	assert.match(html, /<dialog id="randomizer-filter-dialog"/);
	assert.match(views.renderRandomizerCount(), /<strong>2<\/strong> titoli in gioco · 1 escluso <button id="restore-excluded"/);
	assert.match(views.renderRandomizerOdds(), /Alien \(1979\)<\/span>[\s\S]*?80%[\s\S]*?The Thing \(1982\)<\/span>[\s\S]*?20%/);
	assert.equal(views.randomizerFiltered({ weighted: false, filters: { type: '', minVotes: 0 } }), true);
});

test('vibrates briefly for each roulette title on touch devices only, and plays the slot machine sounds', () => {
	const source = readAppScripts();
	const start = source.indexOf('function chooseFilm()');
	const end = source.indexOf('async function addPickedFilm()', start);
	const choices = [{ id: 'tt1', title: 'Alien' }, { id: 'tt2', title: 'The Thing' }];

	for (const isCoarsePointer of [true, false]) {
		const vibrations = [];
		const timers = [];
		const sounds = [];
		const toasts = [];
		const titles = [];
		const elements = {
			roulette: { classList: { add() {}, remove() {} } },
			'roulette-current': { set textContent(value) { titles.push(value); } }
		};
		const result = runInNewContext(`
			let rouletteTimer = null;
			let selectedMovieId = null;
			const weighted = true;
			const pool = () => choices;
			const setControlsDisabled = () => {};
			const setSelectedMovie = id => { selectedMovieId = id; };
			const posterNode = () => null;
			${source.slice(start, end)}
			chooseFilm();
			({ selected: () => selectedMovieId });
		`, {
			choices,
			document: { getElementById: id => elements[id] || null },
			drawMovie: pool => pool[1],
			LANDING_MS: 420,
			SHRINK_MS: 320,
			GROW_MS: 450,
			REVEAL_MS: 1500,
			Math,
			movieName: movie => movie.title,
			navigator: { vibrate: duration => vibrations.push(duration) },
			playLever: () => sounds.push('lever'),
			playTick: () => sounds.push('tick'),
			playStop: () => sounds.push('stop'),
			playWin: () => sounds.push('win'),
			render() {},
			showToast: (key, details) => toasts.push([key, details]),
			SPIN_STEPS: 23,
			window: {
				matchMedia: () => ({ matches: isCoarsePointer }),
				setTimeout: callback => timers.push(callback)
			}
		});

		while (timers.length) timers.shift()();
		assert.equal(vibrations.length, isCoarsePointer ? 23 : 0);
		assert.ok(vibrations.every(duration => duration === 30));
		// Leva alla partenza, un clic per ogni scatto dei rulli, poi arresto e vincita.
		assert.deepEqual(sounds, ['lever', ...Array(22).fill('tick'), 'stop', 'win']);
		// Durante il giro non scorrono titoli: il film estratto compare solo alla fine (render) e nel toast.
		assert.deepEqual(titles, []);
		assert.equal(result.selected(), 'tt2');
		// Nessun toast per il film estratto (solo l'annuncio per gli screen reader).
		assert.deepEqual(toasts, []);
	}
});

test('uses the same page header component across every view', () => {
	const views = makeViews();
	const renderers = [
		views.renderHome,
		views.renderCalendar,
		views.renderDiary,
		views.renderComingFilms,
		views.renderMovieList,
		views.renderSettings
	];
	for (const render of renderers) {
		const html = render();
		assert.equal((html.match(/<header class="page-heading">/g) || []).length, 1);
		assert.match(html, /<p class="eyebrow">myCimmena<\/p>/);
	}
});

test('provides an accessible, persisted color-mode switch for desktop and touch navigation', () => {
	const page = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
	const script = readAppScripts();
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	assert.equal((page.match(/data-theme-toggle/g) || []).length, 0);
	assert.match(makeViews().renderSettings(), /role="switch"[^>]*data-theme-toggle/);
	assert.match(page, /<script src="assets\/js\/boot\.js"><\/script>/);
	assert.match(readFileSync(new URL('../www/assets/js/boot.js', import.meta.url), 'utf8'), /localStorage\.getItem\('mycimmena-color-mode'\)/);
	assert.match(script, /localStorage\.setItem\(COLOR_MODE_KEY/);
	assert.match(styles, /:root\[data-theme="night"\]/);
	assert.match(styles, /--paper: #141114;/);
});

test('keeps the settings route in touch navigation, with the evening always visible', () => {
	const page = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
	const touchNav = page.match(/<nav class="touch-nav"[\s\S]*?<\/nav>/)?.[0];
	assert.ok(touchNav);
	const items = [...touchNav.matchAll(/data-route="([^"]+)"|class="touch-nav-home"|data-theme-toggle/g)]
		.map(([, route]) => route || 'home');
	assert.deepEqual(items, ['calendario', 'prossimi', 'diario', 'lista', 'impostazioni', 'home']);
	assert.doesNotMatch(touchNav, / hidden>/);
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	assert.match(styles, /\.touch-nav \{[^}]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
});

test('provides Material Icons for both color modes', () => {
	assert.equal(iconMap.light_mode, 'light_mode');
	assert.equal(iconMap.dark_mode, 'dark_mode');
});

test('uses the alternate animated loader only in night mode', () => {
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	assert.match(styles, /:root\[data-theme="night"\] \.search-loader \.loader \{/);
	assert.match(styles, /width: 80px;\s+height: 40px;/);
	assert.match(styles, /animation: night-loader-seeds 3s infinite;/);
	assert.match(styles, /:root\[data-theme="night"\] \.search-loader \.loader::before,[\s\S]*?content: none;/);
	assert.match(styles, /mask:\s+linear-gradient\(#000 0 0\),[\s\S]*?linear-gradient\(#0000 0 0\);/);
	assert.match(styles, /@keyframes night-loader-seeds \{[\s\S]*?15% \{ -webkit-mask-size: auto, 20px 20px, 0 0/);
	assert.match(styles, /15% \{[^}]*mask-size: auto, 20px 20px, 0 0/);
	assert.doesNotMatch(styles, /night-loader-motion/);
});

test('keeps disabled icon buttons visibly inactive without hover lift', () => {
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	assert.match(styles, /\.icon-button:disabled, \.icon-button:disabled:hover \{[^}]*opacity: \.42;[^}]*transform: none;/);
	assert.match(styles, /\.icon-button\.small:disabled, \.icon-button\.small:disabled:hover \{[^}]*background: transparent;/);
});

test('matches watchlist secondary icon hover for review and info controls without lifting', () => {
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	assert.match(styles, /\.button\.secondary\.icon-only:hover:not\(:disabled\) \{ background: var\(--clay-wash-subtle\); color: var\(--rust\); border-color: transparent; \}/);
	assert.match(styles, /\.review-toggle:hover:not\(:disabled\), \.movie-info-trigger:hover:not\(:disabled\) \{ background: var\(--clay-wash-subtle\); border-color: transparent; color: var\(--rust\); transform: none; box-shadow: none; \}/);
});

test('adds the back-to-top button to the watchlist and diary only', () => {
	const movie = { id: 'tt1', title: 'Alien' };
	const views = makeViews({ getData: () => ({ upcoming: null, movies: [], viewings: [{ id: 'v1', movieId: 'tt1', date: '2026-10-20', rating: null, movie }] }) });
	assert.match(views.renderMovieList(), /id="back-to-top".*aria-label="Torna su"/);
	assert.match(views.renderDiary(), /id="back-to-top".*aria-label="Torna su"/);
	assert.doesNotMatch(views.renderHome(), /id="back-to-top"/);
});

test('hides watchlist and sorting as soon as OMDb mode opens', () => {
	const omdb = makeViews({ isAuthorized: () => true, getMovieSearchMode: () => 'omdb' }).renderMovieList();
	const watchlist = makeViews({ isAuthorized: () => true }).renderMovieList();
	assert.match(omdb, /<section id="watchlist-section" hidden>/);
	assert.doesNotMatch(watchlist, /<section id="watchlist-section" hidden>/);
});

test('renders the persisted watchlist layout and cards-per-row setting', () => {
	const html = makeViews({
		getWatchlistCardsPerRow: () => 5,
		getWatchlistMobileCardsPerRow: () => 2,
		getWatchlistView: () => 'cards'
	}).renderMovieList();
	assert.match(html, /class="list-stack movie-list" data-view="cards" data-mobile-cards-per-row="2" style="--cards-per-row: 5; --mobile-cards-per-row: 2"/);
});

test('provides a mobile-only two-or-three-card switch independent of the desktop slider', () => {
	const html = makeViews({
		getWatchlistCardsPerRow: () => 5,
		getWatchlistMobileCardsPerRow: () => 3,
		getWatchlistView: () => 'cards'
	}).renderMovieList();
	assert.match(html, /data-mobile-cards-per-row="3"/);
	const page = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
	assert.match(page, /id="watchlist-card-count" type="range" min="2" max="6"/);
	assert.match(page, /class="sort-switch mobile-card-count-switch" role="group" aria-label="Cards per riga su mobile"/);
	assert.match(page, /data-mobile-cards="2" aria-pressed="false">2 per riga/);
	assert.match(page, /data-mobile-cards="3" aria-pressed="true">3 per riga/);
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	assert.match(styles, /\.movie-list\[data-view="cards"\] \{ grid-template-columns: repeat\(var\(--mobile-cards-per-row, 3\), minmax\(0, 1fr\)\); \}/);
	assert.match(styles, /\.desktop-card-count-control \{ display: none; \}/);
	assert.match(styles, /\.mobile-card-count-switch \{ display: flex; \}/);
	assert.match(styles, /\.movie-list\[data-view="cards"\]\[data-mobile-cards-per-row="3"\] \.movie-info-trigger \{ display: none; \}/);
});

test('renders cards with only the poster and evenly spaced action controls', () => {
	const views = makeViews({
		getData: () => ({
			upcoming: null,
			archive: [],
			movies: [{ id: 'tt1', title: 'Alien', year: 1979 }]
		}),
		getWatchlistView: () => 'cards',
		isAuthorized: () => true,
		infoButton: () => '<button class="movie-info-trigger"></button>',
		poster: () => '<img class="movie-poster">'
	});
	const html = views.renderMovieRows();
	assert.match(html, /<button class="movie-poster-trigger movie-card-poster" data-movie-id="tt1" type="button" aria-label="Apri i dettagli di Alien"><img class="movie-poster"><\/button>\s*<div class="movie-actions">/);
	assert.doesNotMatch(html, /movie-title|movie-director|movie-year/);
	assert.match(html, /movie-info-trigger/);
	assert.match(html, /remove-movie/);
	assert.match(html, /schedule-movie/);
});

test('makes posters open movie details in home, calendar, diary, randomizer, and list views', () => {
	const movie = { id: 'tt1', title: 'Alien', year: 1979 };
	const views = makeViews({
		getData: () => ({ upcoming: { date: '2026-10-30', place: 'Cinema', movies: [movie] }, viewings: [{ id: 'v1', movieId: 'tt1', date: '2026-10-20', rating: 8, movie }], movies: [movie] }),
		getSelectedMovieId: () => movie.id,
		selectableMovies: () => [movie],
		poster: (_movie, className = 'movie-poster') => `<img class="${className}">`
	});
	for (const html of [views.renderHome(), views.renderCalendar(), views.renderDiary(), views.renderComingFilms(), views.renderMovieRows()]) {
		assert.match(html, /class="movie-poster-trigger[^\"]*" data-movie-id="tt1" type="button" aria-label="Apri i dettagli di Alien"/);
	}
	const script = readAppScripts();
	assert.match(script, /posterButton\(movie, 'movie-poster', 'search-result-poster'\)/);
	assert.match(script, /posterButton\(movie, 'pending-movie-poster', 'pending-movie-poster-trigger'\)/);
});

test('uses the sort switch padding inside watchlist cards', () => {
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	assert.match(styles, /\.sort-switch \{[^}]*padding: 4px;/);
	assert.match(styles, /\.movie-list\[data-view="cards"\] \.movie-row \{[^}]*padding: 4px;/);
	assert.match(styles, /\.movie-row \{[^}]*padding: 4px;/);
	assert.match(styles, /\.movie-row \{ grid-template-columns: 60px minmax\(0, 1fr\) 34px; gap: 10px; padding: 4px; \}/);
});

test('stretches row-view posters to the full card height', () => {
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	assert.match(styles, /\.movie-row \.movie-poster \{ width: 64px; height: auto; min-height: 92px; align-self: stretch; \}/);
	assert.match(styles, /\.movie-row \.movie-poster \{ width: 60px; min-height: 86px; \}/);
});

test('stretches posters across cards on home, calendar, archive, search and queue', () => {
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	for (const selector of ['.home-movie-poster', '.calendar-film-poster', '.archive-film-poster', '.search-result .movie-poster', '.pending-movie-poster']) {
		const rule = styles.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[^}]*\\}`))?.[0];
		assert.ok(rule, `Missing poster rule for ${selector}`);
		assert.match(rule, /height: auto;/);
		assert.match(rule, /align-self: stretch;/);
		assert.match(rule, /min-height:/);
	}
});

test('stacks archive film info and review actions in a right-side column', () => {
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	assert.match(styles, /\.archive-film-row \{[^}]*grid-template-columns: 72px minmax\(0, 1fr\) 30px;/);
	assert.match(styles, /\.archive-film-actions \{ display: flex; flex-direction: column; align-self: stretch; align-items: center; justify-content: space-evenly;/);
	assert.match(styles, /\.archive-film-actions \.icon-button\.small \.material-icons-outlined \{[^}]*transform: translateX\(-1px\);/);
	assert.match(styles, /\.archive-film-row \{ grid-template-columns: 58px minmax\(0, 1fr\) 30px; gap: 13px; \}/);
});

test('uses compact row-card padding, preserves archive spacing and removes empty queue space', () => {
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	for (const selector of ['.home-film-row', '.calendar-film-row', '.search-result', '.pending-additions-panel', '.pending-movie-row']) {
		const rule = styles.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[^}]*\\}`))?.[0];
		assert.ok(rule, `Missing card rule for ${selector}`);
		assert.match(rule, /padding: 4px;/);
	}
	assert.match(styles, /\.home-film-row \{[^}]*padding: 4px; \}/);
	assert.match(styles, /\.calendar-film-row \{[^}]*padding: 4px; \}/);
	assert.match(styles, /\.archive-entry \{ padding: 24px;/);
	assert.match(styles, /\.archive-entry \{ padding: 18px; \}/);
	assert.match(styles, /\.search-result \{[^}]*padding: 4px;/);
	assert.match(styles, /\.pending-additions-panel \{[^}]*margin: 22px 0 0;/);
	// Il messaggio di stato della coda è passato ai toast: niente riga vuota nella griglia.
	assert.doesNotMatch(styles, /pending-additions-status/);
	assert.match(styles, /\.pending-additions-panel \{[^}]*padding: 4px;/);
	assert.match(styles, /\.pending-movie-row \{[^}]*padding: 4px;/);
});

test('styles missing queued-film posters like search-result placeholders', () => {
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	assert.match(styles, /\.movie-poster\.placeholder, \.pending-movie-poster\.placeholder \{ display: grid; place-items: center; color: var\(--clay\); font-family: Spectral, serif; font-size: 1\.7rem; border-radius: var\(--radius-sm\); \}/);
});

test('uses matching queue action icons and allows clearing all queued movies', () => {
	const source = readAppScripts();
	const start = source.indexOf('function clearPendingMovies() {');
	const end = source.indexOf('async function addQueuedMovies()', start);
	assert.ok(start >= 0 && end > start);
	const movies = [{ id: 'tt1' }, { id: 'tt2' }];
	const pendingMovies = new Map(movies.map(movie => [movie.id, movie]));
	const pendingMovieConflicts = new Set(['tt1']);
	let renderCount = 0;
	const buttons = movies.map((movie, index) => ({
		dataset: { index: String(index) },
		disabled: true,
		attributes: {},
		setAttribute(name, value) { this.attributes[name] = value; },
		querySelector() { return {}; }
	}));
	runInNewContext(`${source.slice(start, end)}\nclearPendingMovies();`, {
		document: { querySelectorAll: () => buttons },
		imdbResults: movies,
		pendingMovies,
		pendingMovieConflicts,
		setIcon(element, name) { element.icon = name; },
		renderPendingAdditions() { renderCount += 1; },
		showToast() {}
	});
	assert.equal(pendingMovies.size, 0);
	assert.equal(pendingMovieConflicts.size, 0);
	assert.equal(renderCount, 1);
	for (const button of buttons) {
		assert.equal(button.disabled, false);
		assert.equal(button.attributes['aria-label'], 'Metti in coda');
	}
	const markup = source.slice(source.indexOf('function renderPendingAdditions() {'), start);
	assert.match(markup, /class="button secondary icon-only remove-pending-movie"/);
	assert.match(markup, /id="clear-pending-movies" class="button secondary icon-only"/);
	assert.match(markup, /id="commit-pending-movies" class="button icon-only"/);
	assert.match(markup, /class="pending-additions-actions"/);
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	assert.match(styles, /grid-template-areas: "header" "list" "actions";/);
	assert.match(styles, /\.pending-additions-actions \{ grid-area: actions;[^}]*justify-content: flex-end;/);
});

test('schedules OMDb search and keeps the watchlist hidden when clearing the query', () => {
	const html = makeViews({ isAuthorized: () => true }).renderMovieList();
	const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
		hidden: true,
		value: '',
		setAttribute() {},
		removeAttribute() {}
	}]));
	elements.get('movie-query').value = 'Alien';
	const source = readAppScripts();
	const start = source.indexOf('function scheduleMovieSearch(');
	const end = source.indexOf('async function searchMovies(', start);
	const timers = [];
	const requests = [];
	runInNewContext(`${source.slice(start, end)}\nscheduleMovieSearch();`, {
		hasDeviceAuthorization: () => true,
		document: { getElementById: id => elements.get(id) || null },
		window: {
			clearTimeout() {},
			setTimeout: (callback, delay) => timers.push({ callback, delay })
		},
		movieSearchMode: 'omdb',
		movieSearchSequence: 0,
		movieSearchTimer: null,
		omdbQuery: '',
		searchMovies: (query, sequence) => requests.push({ query, sequence })
	});
	assert.equal(timers.length, 1);
	assert.equal(timers[0].delay, 1000);
	assert.equal(elements.get('search-loader').hidden, false);
	timers[0].callback();
	assert.deepEqual(requests, [{ query: 'Alien', sequence: 1 }]);
	elements.get('movie-query').value = '';
	runInNewContext(`${source.slice(start, end)}\nscheduleMovieSearch();`, {
		hasDeviceAuthorization: () => true,
		document: { getElementById: id => elements.get(id) || null },
		window: { clearTimeout() {} },
		movieSearchMode: 'omdb',
		movieSearchSequence: 1,
		movieSearchTimer: null,
		omdbQuery: 'Alien',
		imdbResults: []
	});
	assert.equal(elements.get('watchlist-section').hidden, true);
	assert.equal(elements.get('search-results').hidden, true);
	assert.equal(elements.get('search-loader').hidden, true);
});

test('hides the OMDb loader after success or failure but not for an outdated response', async () => {
	const source = readAppScripts();
	const start = source.indexOf('async function searchMovies(');
	const end = source.indexOf('function renderSearchResults(', start);
	for (const outcome of ['success', 'failure', 'outdated']) {
		const loader = { hidden: false };
		const form = { busy: true, removeAttribute() { this.busy = false; } };
		const elements = {
			'search-loader': loader,
			'movie-search-form': form,
			'search-status': {},
			'search-results': {}
		};
		await runInNewContext(`${source.slice(start, end)}\nsearchMovies('Alien', 1);`, {
			document: { getElementById: id => elements[id] },
			apiRequest: async () => {
				if (outcome === 'failure') throw new Error('Errore API');
				return { d: [] };
			},
			movieSearchSequence: outcome === 'outdated' ? 2 : 1,
			imdbResults: [],
			isSessionRejected: error => error?.status === 401 || error?.status === 403,
			renderSearchResults() {},
			escapeHtml,
			contentType
		});
		assert.equal(loader.hidden, outcome !== 'outdated');
		assert.equal(form.busy, outcome === 'outdated');
	}
});

test('routes every used icon through one Material Icons map', () => {
	const names = [
		'add', 'add_comment', 'archive', 'arrow_downward', 'arrow_upward', 'casino', 'close', 'delete', 'done_all',
		'edit', 'event', 'event_busy', 'filter_list', 'format_bold', 'format_italic', 'format_list_bulleted',
		'format_list_numbered', 'format_quote', 'forum', 'grid_view', 'info', 'inventory_2', 'link', 'movie', 'place',
		'playlist_add', 'playlist_add_check', 'progress_activity', 'save', 'settings', 'share', 'strikethrough_s', 'view_list'
	];
	for (const name of names) {
		assert.equal(iconMap[name], name);
		assert.match(icon(name), new RegExp(`data-icon="${name}"[^>]*><svg focusable="false"><use href="#i-${name}"/></svg><`));
	}
});

test('draws every configured icon from the inline sprite, without Google Fonts', () => {
	const index = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
	for (const glyph of Object.values(iconMap)) assert.match(index, new RegExp(`<symbol id="i-${glyph}" viewBox="[^"]+">`));
	assert.doesNotMatch(index, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
	assert.doesNotMatch(index, /data-icon="\w+" aria-hidden="true">\w+<\/span>/);
});

test('updates a dynamic icon through the same route map', () => {
	const element = { dataset: {}, innerHTML: '' };
	setIcon(element, 'arrow_downward');
	assert.equal(element.dataset.icon, 'arrow_downward');
	assert.equal(element.innerHTML, '<svg focusable="false"><use href="#i-arrow_downward"/></svg>');
});
test('writes review ratings as spipe, singular up to one cat', () => {
	assert.equal(formatSpipe(0.5), '½ spipa su 10');
	assert.equal(formatSpipe(1), '1 spipa su 10');
	assert.equal(formatSpipe(1.5), '1 spipa e ½ su 10');
	assert.equal(formatSpipe(7), '7 spipe su 10');
	assert.equal(formatSpipe('7.5'), '7 spipe e ½ su 10');
	assert.equal(formatSpipe(10), '10 spipe su 10');
});

test('configures every toast in one file and uses only configured keys', () => {
	const script = readAppScripts();
	// Chiavi passate a showToast o, per le rimozioni annullabili, a runUndoable({ toastKey }).
	const used = new Set([...script.matchAll(/(?:showToast\(|toastKey: )'([a-zA-Z]+)'/g)].map(match => match[1]));
	if (/showErrorToast\(/.test(script)) used.add('error');
	assert.ok(used.size > 0);
	for (const key of used) assert.ok(TOASTS[key], `Toast non configurato: ${key}`);
	for (const [key, config] of Object.entries(TOASTS)) {
		assert.ok(used.has(key), `Toast configurato ma mai usato: ${key}`);
		assert.equal(typeof config.enabled, 'boolean');
		assert.ok(['string', 'function'].includes(typeof config.message));
	}
	assert.equal(toastMessage('moviesAdded', { count: 1 }), 'Film aggiunto alla watchlist');
	assert.equal(toastMessage('moviesAdded', { count: 3 }), '3 film aggiunti alla watchlist');
	assert.equal(toastMessage('meetingSaved', { past: true }), 'Serata salvata: la data è passata, in Home trovi «Com’è andata?»');
	assert.equal(toastMessage('themeChanged', { mode: 'night' }), 'Modalità notte');
	assert.equal(toastMessage('sconosciuto'), '');
	assert.equal(toastMessage('viewingSaved', { removed: true }), 'Segnato come visto e tolto dalla watchlist');
	TOASTS.viewingDeleted.enabled = false;
	assert.equal(toastMessage('viewingDeleted'), '');
	TOASTS.viewingDeleted.enabled = true;
});

test('reports action outcomes only through toasts, without inline status messages or alerts', () => {
	const script = readAppScripts();
	const views = readFileSync(new URL('../www/assets/js/views.js', import.meta.url), 'utf8');
	const share = readFileSync(new URL('../www/assets/js/share.js', import.meta.url), 'utf8');
	for (const id of ['settings-status', 'calendar-status', 'roulette-status', 'pending-additions-status', 'home-share-status']) {
		assert.doesNotMatch(script + views + share, new RegExp(id));
	}
	assert.doesNotMatch(script + views, /review-status/);
	assert.doesNotMatch(script, /window\.alert\(/);
	assert.equal(toastMessage('error', { message: 'Boom' }), 'Boom');
	assert.equal(TOASTS.error.variant, 'error');
});

test('sorts the watchlist by most recently added by default', () => {
	const script = readAppScripts();
	assert.match(script, /let movieSort = 'added-desc';/);
	const rows = makeViews({
		getMovieSort: () => 'added-desc',
		getData: () => ({ upcoming: null, archive: [], movies: [
			{ id: 'tt1', title: 'Vecchio', added_at: '2026-01-01 10:00:00' },
			{ id: 'tt2', title: 'Nuovo', added_at: '2026-10-27 21:00:00' },
			{ id: 'tt3', title: 'Medio', added_at: '2026-05-01 10:00:00' }
		] }),
		poster: () => '<img>'
	}).renderMovieRows();
	assert.deepEqual([...rows.matchAll(/data-movie-id="(tt\d)"/g)].map(match => match[1]).filter((id, index, ids) => ids.indexOf(id) === index), ['tt2', 'tt3', 'tt1']);
});

test('lists the "Aggiunto" sort tab first', () => {
	const html = makeViews({ getMovieSort: () => 'added-desc' }).renderMovieList();
	assert.deepEqual([...html.matchAll(/class="sort-tab[^"]*" data-field="([a-z]+)"/g)].map(match => match[1]), ['added', 'title', 'year', 'votes']);
});

test('sorts the watchlist by personal hype, filters by a minimum level and shows the level emoji on each row', () => {
	const movie = (id, title, hype) => ({ id, title, year: '2000', hype, votes: { total: hype ?? 0, count: hype === null ? 0 : 1, mine: hype } });
	const data = { upcoming: null, movies: [movie('tt1', 'Alfa', 3), movie('tt2', 'Beta', 5), movie('tt3', 'Gamma', null), movie('tt4', 'Delta', 0)], viewings: [] };
	const order = html => [...html.matchAll(/<h2 class="movie-title">([^<]+)<\/h2>/g)].map(match => match[1]);
	const sorted = makeViews({ getData: () => data, getMovieSort: () => 'votes-desc' }).renderMovieRows();
	// A pari livello (0) il titolo votato viene prima di quello non votato.
	assert.deepEqual(order(sorted), ['Beta', 'Alfa', 'Delta', 'Gamma']);
	assert.match(sorted, /<span aria-hidden="true">🔥<\/span><span class="visually-hidden">Hypometro: Non vedo l’ora \(5 su 5\)<\/span>/);
	assert.doesNotMatch(sorted, /🍿|membri/);
	const filtered = makeViews({ getData: () => data, getMovieSort: () => 'votes-desc', getWatchlistMinVotes: () => 3 }).renderMovieRows();
	assert.deepEqual(order(filtered), ['Beta', 'Alfa']);
	assert.equal(makeViews().minVotesLabel(3), 'Almeno 😃');
});

test('keeps the Hypometro emoji in hype.js, one per level from 0 to 5', async () => {
	const hype = await import('../www/assets/js/hype.js');
	assert.equal(hype.HYPE_LEVELS.length, 6);
	assert.equal(hype.HYPE_MAX, 5);
	assert.ok(hype.HYPE_LEVELS.every(level => level.emoji && level.label));
	assert.equal(hype.formatHype(3), 'Hypometro: Volentieri (3 su 5)');
	assert.equal(hype.formatHype(null), 'Non ancora votato');
	assert.equal('HYPE_MEMBERS_EMOJI' in hype, false);
	assert.deepEqual(hype.watchlistVotes({}), { total: 0, count: 0, mine: null });
	// Anche 0 è un voto: si distingue dal non aver votato.
	assert.deepEqual(hype.watchlistVotes({ votes: { total: 0, count: 2, mine: 0 } }), { total: 0, count: 2, mine: 0 });
});

test('saves the watchlist vote from the film modal slider', () => {
	const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
	assert.match(read('../www/index.html'), /<section id="movie-info-vote" class="movie-vote" aria-labelledby="movie-vote-title" hidden><\/section>/);
	const movieInfo = read('../www/assets/js/movie-info.js');
	assert.match(movieInfo, /type="range" min="0" max="\$\{HYPE_MAX\}" step="any"/);
	// Si salva al rilascio (change), non a ogni movimento (input).
	assert.match(movieInfo, /addEventListener\('change', event => \{\s*if \(event\.target\.id === 'movie-vote-range'[^)]*\) saveVote\(/);
	// Hypometro personale: sotto il titolo il livello in parole, niente totali dei membri; si salva con store.js.
	assert.doesNotMatch(movieInfo, /HYPE_MEMBERS_EMOJI|votes\.count/);
	assert.match(movieInfo, /Quanta voglia hai di vederlo\?/);
	assert.match(movieInfo, /await saveHype\(movieId, next\);/);
	assert.match(read('../www/script.js'), /saveHype: async \(movieId, score\) => \{\s*await store\.setHype\(movieId, score\);/);
});

test('styles the shared evening image with the active theme palette', () => {
	const share = readFileSync(new URL('../www/assets/js/share.js', import.meta.url), 'utf8');
	assert.match(share, /getComputedStyle\(document\.documentElement\)/);
	assert.match(share, /night: document\.documentElement\.dataset\.theme === 'night'|const night = document\.documentElement\.dataset\.theme === 'night'/);
	for (const variable of ['--paper', '--ink', '--surface', '--muted', '--rust', '--apricot', '--line']) {
		assert.ok(share.includes(`value('${variable}'`), `Variabile non letta: ${variable}`);
	}
	// Nessun colore fisso del vecchio tema chiaro nel disegno delle card e del fondo.
	assert.doesNotMatch(share, /fillStyle = '#(fbf4ec|ffffff|422007)'/);
});

test('draws the shared image icons from the inline sprite, not from the removed icon font', () => {
	const share = readFileSync(new URL('../www/assets/js/share.js', import.meta.url), 'utf8');
	const index = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
	assert.doesNotMatch(share, /Material Icons/);
	for (const glyph of ['event', 'place']) {
		assert.ok(share.includes(`shareIconPaths('${glyph}')`), `Icona non disegnata: ${glyph}`);
		assert.match(index, new RegExp(`<symbol id="i-${glyph}" viewBox="0 0 24 24"><path d="`));
	}
});

test('keeps the diary rating inside narrow cards by wrapping and switching to a single cat', () => {
	const movie = { id: 'tt1', title: 'Alien' };
	const diary = rating => makeViews({ getData: () => ({ upcoming: null, movies: [], viewings: [{ id: 'v1', movieId: 'tt1', date: '2026-10-20', rating, movie }] }) }).renderDiaryRows();
	assert.match(diary(7), /class="review-stars-compact" aria-hidden="true"><span class="cat-cell full">/);
	assert.match(diary(null), /class="review-stars-compact" aria-hidden="true"><span class="cat-cell empty">/);
	const styles = readFileSync(new URL('../www/style.css', import.meta.url), 'utf8');
	assert.match(styles, /\.review-summary \{ display: flex; flex-wrap: wrap;/);
	assert.match(styles, /\.archive-film-copy \{ container: film-copy \/ inline-size; \}/);
	// Sotto la larghezza della riga più lunga possibile i dati vanno a capo su tutti i film, non solo su alcuni.
	assert.match(styles, /@container film-copy \(max-width: 14\.75rem\) \{\s*\.review-rating-label \{ flex-basis: 100%; \}/);
	assert.match(styles, /@container film-copy \(max-width: 21rem\) \{\s*\.review-rating-label \{ flex-basis: 100%; \}/);
	assert.match(styles, /@container film-copy \(max-width: 9\.6rem\) \{\s*\.review-stars \{ display: none; \}\s*\.review-stars-compact \{ display: inline-flex; \}/);
});

test('draws rating cats with the bundled SVG instead of platform emoji', async () => {
	const { catState } = await import('../www/assets/js/domain.js');
	assert.deepEqual([0, 1, 2, 3].map(index => catState(2.5, index)), ['full', 'full', 'half', 'empty']);
	assert.equal(catState(10, 9), 'full');
	assert.equal(catState(0, 0), 'empty');
	const index = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
	assert.match(index, /<symbol id="cat-full" viewBox="0 0 32 32">/);
	assert.match(index, /<symbol id="cat-empty" viewBox="0 0 32 32">/);
	const views = readFileSync(new URL('../www/assets/js/views.js', import.meta.url), 'utf8');
	assert.doesNotMatch(views, /🐈/);
	const summary = makeViews({ getData: () => ({ upcoming: null, movies: [], viewings: [{ id: 'v1', movieId: 'tt1', date: '2026-10-20', rating: 7.5, movie: { id: 'tt1', title: 'Alien' } }] }) }).renderDiaryRows();
	assert.equal((summary.match(/class="cat-cell full"/g) || []).length, 8);
	assert.equal((summary.match(/class="cat-cell half"/g) || []).length, 1);
	assert.match(summary, /<use href="#cat-full"\/>/);
});

test('builds an all-day calendar event for the next meeting, escaping text and folding long lines', async () => {
	const { buildMeetingIcs } = await import('../www/assets/js/calendar-file.js');
	assert.equal(buildMeetingIcs({ date: null, place: 'Casa' }, movieName), '');
	const meeting = { date: '2026-12-31', place: 'Casa Rossi; piano 2, interno 3', movies: [{ title: 'Alien', year: 1979 }, { title: 'Brazil', year: 1985 }] };
	const ics = buildMeetingIcs(meeting, movieName, new Date('2026-11-03T10:20:30.456Z'));
	assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
	assert.match(ics, /\r\nDTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\n/);
	assert.match(ics, /\r\nDTSTAMP:20261103T102030Z\r\n/);
	assert.match(ics, /\r\nLOCATION:Casa Rossi\\; piano 2\\, interno 3\r\n/);
	assert.match(ics, /\r\nDESCRIPTION:In programma:\\nAlien \(1979\)\\nBrazil \(1985\)\r\n/);
	assert.match(ics, /END:VCALENDAR\r\n$/);
	const long = buildMeetingIcs({ date: '2026-12-31', place: 'è'.repeat(60), movies: [] }, movieName);
	for (const line of long.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
	assert.match(long, /\r\n è/);
	assert.doesNotMatch(buildMeetingIcs({ date: '2026-12-31', movies: [] }, movieName), /LOCATION|DESCRIPTION/);
	assert.match(makeViews({ getData: () => ({ upcoming: meeting, archive: [], movies: [] }) }).renderHome(), /id="calendar-home"/);
	assert.doesNotMatch(makeViews({ getData: () => ({ upcoming: { date: null, place: 'Casa', movies: [] }, archive: [], movies: [] }) }).renderHome(), /id="calendar-home"/);
});

test('opens every view from the top and moves focus to its heading', () => {
	const script = readAppScripts();
	const handler = script.slice(script.indexOf("window.addEventListener('hashchange'"));
	assert.match(handler.slice(0, handler.indexOf('\n});')), /window\.scrollTo\(\{ top: 0[^}]*\}\);[\s\S]*heading\.focus\(\{ preventScroll: true \}\)/);
});

test('boots the app from script.js and keeps each feature in its own module', () => {
	const script = readFileSync(new URL('../www/script.js', import.meta.url), 'utf8');
	const sources = readAppScripts();
	for (const name of APP_MODULES) {
		assert.ok(existsSync(new URL(`../www/assets/js/${name}.js`, import.meta.url)), `Modulo mancante: ${name}`);
		assert.match(sources, new RegExp(`from '\\./(assets/js/)?${name}\\.js';`), `Modulo mai importato: ${name}`);
	}
	// Import statici: l'import map di index.php li versiona tutti, script.js compreso.
	assert.doesNotMatch(script, /import\(/);
});

test('uses static local posters for cards, resized IMDb images otherwise, and a large version only for the lightbox', async () => {
	const { poster, sizedPosterUrl } = await import('../www/assets/js/movie-info.js');
	const original = 'https://m.media-amazon.com/images/M/MV5Babc@._V1_.jpg';
	assert.equal(sizedPosterUrl(original, 400), 'https://m.media-amazon.com/images/M/MV5Babc@._V1_SX400.jpg');
	assert.equal(sizedPosterUrl('https://m.media-amazon.com/images/M/MV5Babc@._V1_SX300.jpg', 1000), 'https://m.media-amazon.com/images/M/MV5Babc@._V1_SX1000.jpg');
	assert.equal(sizedPosterUrl('https://example.com/poster.jpg', 400), 'https://example.com/poster.jpg');
	const local = poster({ id: 'tt1', title: 'Film', poster: original, poster_local: 'assets/posters/tt1.webp' });
	assert.match(local, /src="assets\/posters\/tt1\.webp"/);
	assert.match(local, /data-fallback="[^"]*_V1_SX400\.jpg"/);
	assert.doesNotMatch(local, /data-full|_V1_\.jpg/);
	const remote = poster({ id: 'tt2', title: 'Film', poster: original, poster_cached: false });
	assert.match(remote, /src="[^"]*_V1_SX400\.jpg"/);
	assert.match(poster({ id: 'tt1', title: 'Film', poster: original, poster_local: 'assets/posters/tt1.webp' }, 'movie-info-cover', true), /data-full="[^"]*_V1_SX1000\.jpg"/);
	const dialogs = readFileSync(new URL('../www/assets/js/dialogs.js', import.meta.url), 'utf8');
	assert.match(dialogs, /const thumbnail = img\.currentSrc \|\| img\.src;[\s\S]*img\.dataset\.full[\s\S]*loader\.onload[\s\S]*loader\.onerror[\s\S]*loader\.src = large \|\| thumbnail/);
	assert.match(dialogs, /posterLightboxLoader\.hidden = false/);
	assert.match(dialogs, /createLightboxZoom\(posterLightboxImage, posterLightbox\)[\s\S]*lightboxZoom\.reset\(\)/);
});

