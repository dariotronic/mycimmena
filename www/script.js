'use strict';

// Avvio dell'app: stato condiviso (i dati), routing delle viste hash ed eventi globali.
// Le funzionalità stanno nei moduli di assets/js/, creati qui sotto con le dipendenze che servono a ciascuno.
// I dati stanno sul telefono (store.js); app-data.js li prepara nel formato che leggono le viste.
import { contentType, escapeHtml, formatDate, meetingMovies, movieName, today } from './assets/js/domain.js';
import { store } from './assets/js/store.js';
import { buildAppData } from './assets/js/app-data.js';
import { createPosters, localPosterUrl } from './assets/js/posters.js';
import { shareHome as shareHomeImage } from './assets/js/share.js';
import { createViews } from './assets/js/views.js';
import { emptyState } from './assets/js/components.js';
import { hydrateIcons } from './assets/js/icons.js';
import { showErrorToast, showToast } from './assets/js/toasts.js';
import { downloadMeetingIcs } from './assets/js/calendar-file.js';
import { initColorMode } from './assets/js/theme.js';
import { createNavigation, route, updateBackToTopButton } from './assets/js/navigation.js';
import { createDialogs } from './assets/js/dialogs.js';
import { createMovieInfo, movieDetails, poster } from './assets/js/movie-info.js';
import { createUndo } from './assets/js/undo.js';
import { createDiary } from './assets/js/diary.js';
import { createRandomizer } from './assets/js/randomizer.js';
import { createMeeting } from './assets/js/meeting.js';
import { createWatchlist } from './assets/js/watchlist.js';
import { createSearch } from './assets/js/search.js';
import { initBackButton } from './assets/js/back-button.js';

hydrateIcons(document);

const app = document.getElementById('app');
let state = null;
let data = buildAppData(null);
let dataLoadError = '';
const getData = () => data;

initColorMode();
const navigation = createNavigation({ app });
initBackButton({ closeMenu: navigation.closeMenu });
const { askConfirmation, openImageLightbox } = createDialogs({ app });
// Le locandine scaricate in sottofondo compaiono al ridisegno successivo, senza interrompere chi sta scrivendo.
const posters = createPosters({ store, onSaved: () => { rebuildData(); renderWhenIdle(); } });
// Watchlist e diario si creano più sotto: le funzioni li usano solo dopo un'azione, quando esistono già.
const { infoButton, titleWithInfo } = createMovieInfo({
	app,
	openImageLightbox,
	getData,
	saveHype: async (movieId, score) => {
		await store.setHype(movieId, score);
		await loadData();
	},
	renderMyViewings: movie => viewRenderer.renderMyViewings(movie),
	openViewing: target => diary.openViewingForm(target),
	onVotesChanged: () => watchlist.updateWatchlistRows()
});
// Le viste leggono lo stato dai moduli che lo possiedono. I getter vengono chiamati solo al render,
// quando tutti i moduli qui sotto esistono già.
const viewRenderer = createViews({
	getColorMode: () => document.documentElement.dataset.theme,
	getDiaryQuery: () => diary.getDiaryQuery(),
	getData,
	getMovieSearchMode: () => search.getMovieSearchMode(),
	getMovieSort: () => watchlist.getMovieSort(),
	getOmdbQuery: () => search.getOmdbQuery(),
	getRandomizerState: () => randomizer.getState(),
	getSelectedMovieId: () => randomizer.getSelectedMovieId(),
	getWatchlistCardsPerRow: () => watchlist.getWatchlistCardsPerRow(),
	getWatchlistMobileCardsPerRow: () => watchlist.getWatchlistMobileCardsPerRow(),
	getWatchlistQuery: () => search.getWatchlistQuery(),
	getWatchlistType: () => watchlist.getWatchlistType(),
	getWatchlistMinVotes: () => watchlist.getWatchlistMinVotes(),
	getWatchlistView: () => watchlist.getWatchlistView(),
	contentType,
	emptyState,
	escapeHtml,
	formatDate,
	infoButton,
	meetingMovies,
	movieDetails,
	movieName,
	poster,
	selectableMovies: () => meetingActions.selectableMovies(),
	titleWithInfo,
	today
});
const { runUndoable, flushUndoable } = createUndo({ render });
const diary = createDiary({
	app,
	store,
	getData,
	viewRenderer,
	askConfirmation,
	refresh: async () => {
		await loadData();
		render();
	}
});
const randomizer = createRandomizer({
	render,
	viewRenderer,
	selectableMovies: () => meetingActions.selectableMovies(),
	scheduleMovie: movieId => meetingActions.scheduleMovie(movieId)
});
const meetingActions = createMeeting({ store, getData, render, loadData, askConfirmation, runUndoable, flushUndoable, clearSelectedMovie: randomizer.clearSelectedMovie });
const watchlist = createWatchlist({
	getData,
	viewRenderer,
	scheduleMovie: meetingActions.scheduleMovie,
	clearSelectedMovie: randomizer.clearSelectedMovie,
	runUndoable,
	refreshSearchResults: () => search.refreshResults(),
	commitRemoval: async movieId => {
		await store.removeFromWatchlist(movieId);
		await loadData();
	}
});
const search = createSearch({
	getData,
	render,
	addMovies: async movies => {
		const added = await store.addToWatchlist(movies);
		await loadData();
		posters.ensure([...state.movies.values()].filter(movie => added.includes(movie.id)));
		return added.length;
	},
	getWatchlistType: watchlist.getWatchlistType,
	matchesContentType: watchlist.matchesContentType,
	updateWatchlistRows: watchlist.updateWatchlistRows,
	infoButton,
	titleWithInfo
});

function rebuildData() {
	data = buildAppData(state, { posterUrlFor: localPosterUrl });
}

async function loadData() {
	await flushUndoable();
	try {
		state = await store.loadAll();
		dataLoadError = '';
	} catch (error) {
		dataLoadError = error.message;
		state = null;
	}
	rebuildData();
}

const ROUTE_TITLES = { home: 'Home', calendario: 'Serata', diario: 'Diario', prossimi: 'Randomizer', lista: 'Watchlist', impostazioni: 'Impostazioni' };
// Nomi delle pagine sul sito: un link salvato porta comunque alla pagina giusta.
const OLD_ROUTES = { profilo: 'impostazioni', archivio: 'diario' };

function render() {
	if (OLD_ROUTES[route()]) {
		location.replace(`#${OLD_ROUTES[route()]}`);
		return;
	}
	updateDocumentTitle();
	const views = {
		home: viewRenderer.renderHome,
		calendario: viewRenderer.renderCalendar,
		diario: viewRenderer.renderDiary,
		prossimi: viewRenderer.renderComingFilms,
		lista: viewRenderer.renderMovieList,
		impostazioni: viewRenderer.renderSettings
	};
	app.innerHTML = (views[route()] || viewRenderer.renderHome)();
	hydrateIcons(app);
	document.querySelectorAll('.touch-nav a').forEach(link => {
		if (link.getAttribute('href') === `#${route()}`) link.setAttribute('aria-current', 'page');
		else link.removeAttribute('aria-current');
	});
	if (route() === 'lista') search.renderPendingAdditions();
	if (dataLoadError) {
		const warning = document.createElement('p');
		warning.className = 'status-message error';
		warning.textContent = `Impossibile leggere i dati salvati. Dettaglio: ${dataLoadError}`;
		app.prepend(warning);
	}
	bindViewEvents();
	updateBackToTopButton();
}

// Ridisegno in sottofondo (locandine appena salvate): non mentre si scrive o con una finestra aperta, e alla stessa
// altezza della pagina.
let renderPending = false;
function userIsBusy() {
	const active = document.activeElement;
	return Boolean(document.querySelector('dialog[open]'))
		|| Boolean(active?.closest?.('input, textarea, select, [contenteditable="true"]'));
}
function renderWhenIdle() {
	if (userIsBusy()) {
		if (!renderPending) {
			renderPending = true;
			window.setTimeout(() => {
				renderPending = false;
				renderWhenIdle();
			}, 1000);
		}
		return;
	}
	const top = window.scrollY;
	render();
	window.scrollTo({ top, left: 0, behavior: 'instant' });
}

function bindViewEvents() {
	document.getElementById('share-home')?.addEventListener('click', () => {
		const meeting = data.upcoming && (!data.upcoming.date || data.upcoming.date >= today()) ? data.upcoming : null;
		shareHomeImage(meeting, formatDate, meetingMovies).then(outcome => {
			if (outcome === 'shared') showToast('shareDone');
			if (outcome === 'downloaded') showToast('shareDownloaded');
		}).catch(showErrorToast);
	});
	document.getElementById('calendar-home')?.addEventListener('click', () => {
		if (downloadMeetingIcs(data.upcoming, movieName)) showToast('calendarDownloaded');
	});
	meetingActions.bind();
	watchlist.bind();
	randomizer.bind();
	search.bind(route());
	diary.bind();
}

// Cambio di vista accessibile: <main> non è una regione aria-live (lo screen reader rileggerebbe tutta la pagina
// a ogni render). Dopo la navigazione il focus va sul titolo della vista e il titolo del documento si aggiorna.
function updateDocumentTitle() {
	const title = ROUTE_TITLES[route()];
	document.title = title && route() !== 'home' ? `${title} · myCimmena` : 'myCimmena';
}

window.addEventListener('hashchange', () => {
	navigation.closeMenu();
	randomizer.clearSelectedMovie();
	render();
	// Le viste sono simulate nella stessa pagina: senza questo, la nuova vista si apre all'altezza di quella precedente.
	window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
	const heading = app.querySelector('h1');
	if (heading) {
		heading.setAttribute('tabindex', '-1');
		heading.focus({ preventScroll: true });
	}
});
// Tornando online si scaricano le locandine rimaste indietro.
window.addEventListener('online', () => state && posters.ensure([...state.movies.values()]));

// Apertura: le locandine già salvate, poi i dati, poi la vista. Intanto si chiede al sistema di non cancellare i dati
// per fare spazio, e si scaricano in sottofondo le locandine che mancano.
(async () => {
	store.requestPersistence();
	try {
		await posters.loadSaved();
	} catch (error) {
		console.warn('Locandine salvate non disponibili.', error);
	}
	await loadData();
	render();
	if (state) posters.ensure([...state.movies.values()]);
})();
