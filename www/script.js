'use strict';

// Avvio dell'app: stato condiviso (i dati), routing delle viste hash ed eventi globali.
// Le funzionalità stanno nei moduli di assets/js/, creati qui sotto con le dipendenze che servono a ciascuno.
import { contentType, escapeHtml, formatDate, meetingMovies, movieName, today } from './assets/js/domain.js';
import { emptyAppData, fetchAppData } from './assets/js/api.js';
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
import { createArchive } from './assets/js/archive.js';
import { createReviews } from './assets/js/reviews.js';
import { createRandomizer } from './assets/js/randomizer.js';
import { createMeeting } from './assets/js/meeting.js';
import { createWatchlist } from './assets/js/watchlist.js';
import { createSearch } from './assets/js/search.js';
import { initBackButton } from './assets/js/back-button.js';

hydrateIcons(document);

const app = document.getElementById('app');
let data = emptyAppData();
let dataLoadError = '';
const getData = () => data;

initColorMode();
const navigation = createNavigation({ app });
initBackButton({ closeMenu: navigation.closeMenu });
const { askConfirmation, openImageLightbox } = createDialogs({ app });
// La watchlist si crea più sotto: il callback la usa solo dopo un voto, quando esiste già.
const { infoButton, titleWithInfo } = createMovieInfo({ app, openImageLightbox, getData, onVotesChanged: () => watchlist.updateWatchlistRows() });
// Le viste leggono lo stato dai moduli che lo possiedono. I getter vengono chiamati solo al render,
// quando tutti i moduli qui sotto esistono già.
const viewRenderer = createViews({
	getColorMode: () => document.documentElement.dataset.theme,
	getArchiveQuery: () => archive.getArchiveQuery(),
	getData,
	getMovieSearchMode: () => search.getMovieSearchMode(),
	getMovieSort: () => watchlist.getMovieSort(),
	getOmdbQuery: () => search.getOmdbQuery(),
	getReviewState: movieId => reviews.getReviewState(movieId),
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
const archive = createArchive({ viewRenderer });
const reviews = createReviews({ app, getData, viewRenderer, askConfirmation, updateArchiveRows: archive.updateArchiveRows });
const randomizer = createRandomizer({
	render,
	viewRenderer,
	selectableMovies: () => meetingActions.selectableMovies(),
	scheduleMovie: movieId => meetingActions.scheduleMovie(movieId)
});
const meetingActions = createMeeting({ getData, render, loadData, askConfirmation, runUndoable, flushUndoable, clearSelectedMovie: randomizer.clearSelectedMovie });
const watchlist = createWatchlist({
	getData,
	viewRenderer,
	scheduleMovie: meetingActions.scheduleMovie,
	clearSelectedMovie: randomizer.clearSelectedMovie,
	runUndoable,
	refreshSearchResults: () => search.refreshResults()
});
const search = createSearch({
	getData,
	render,
	loadData,
	getWatchlistType: watchlist.getWatchlistType,
	matchesContentType: watchlist.matchesContentType,
	updateWatchlistRows: watchlist.updateWatchlistRows,
	infoButton,
	titleWithInfo
});

async function loadData() {
	await flushUndoable();
	try {
		data = await fetchAppData();
		dataLoadError = '';
	} catch (error) {
		dataLoadError = error.message;
		data = emptyAppData();
	}
}

const ROUTE_TITLES = { home: 'Home', calendario: 'Serata', archivio: 'Archivio', prossimi: 'Randomizer', lista: 'Watchlist', impostazioni: 'Impostazioni' };

function render() {
	// Vecchio nome della pagina Impostazioni sul sito: un link salvato con #profilo porta comunque qui.
	if (route() === 'profilo') {
		location.replace('#impostazioni');
		return;
	}
	updateDocumentTitle();
	const views = {
		home: viewRenderer.renderHome,
		calendario: viewRenderer.renderCalendar,
		archivio: viewRenderer.renderArchive,
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
	archive.bind();
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

// Apertura: i dati stanno sul telefono, quindi si leggono e si disegna subito la vista.
loadData().then(render);
