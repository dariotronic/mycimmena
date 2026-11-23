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
import { hideToast, showErrorToast, showToast } from './assets/js/toasts.js';
import { addMeetingToCalendar } from './assets/js/calendar-file.js';
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
import { createDetails } from './assets/js/details.js';
import { createSeriesUi, renderSeriesSection } from './assets/js/series-ui.js';
import { createOnboarding } from './assets/js/onboarding.js';
import { createSettings } from './assets/js/settings.js';
import { createBackupUi } from './assets/js/backup-ui.js';
import { createImportUi } from './assets/js/import-ui.js';
import { createUpdates } from './assets/js/update-ui.js';
import { createFeedbackUi } from './assets/js/feedback-ui.js';
import { createNotifications } from './assets/js/notifications.js';
import { createPosterTheme } from './assets/js/poster-theme-ui.js';
import { renderStats } from './assets/js/stats-ui.js';
import { pageHeader } from './assets/js/components.js';

hydrateIcons(document);

const app = document.getElementById('app');
let state = null;
let data = buildAppData(null);
let dataLoadError = '';
const getData = () => data;

initColorMode();
const navigation = createNavigation({ app });
initBackButton({ closeMenu: navigation.closeMenu, onBack: () => onboarding.handleBack() });
const { ask, askConfirmation, openImageLightbox } = createDialogs({ app });
// Colori dal film del cuore: si riallineano dopo ogni lettura dei dati e quando arriva la sua locandina.
const posterTheme = createPosterTheme({ store, getData });
// Le locandine scaricate in sottofondo compaiono al ridisegno successivo, senza interrompere chi sta scrivendo.
const posters = createPosters({ store, onSaved: () => { rebuildData(); renderWhenIdle(); posterTheme.sync(); } });
// Dettagli da OMDb (modalità completa): quando arrivano si rileggono i dati e si aggiornano vista e scheda aperta.
const details = createDetails({
	store,
	getState: () => state,
	onChange: async () => {
		await loadData();
		renderWhenIdle();
		refreshMovieInfo();
		settings.updateBanner();
	},
	onProgress: progress => settings.showProgress(progress),
	notify: message => showToast('error', { message })
});
// Watchlist e diario si creano più sotto: le funzioni li usano solo dopo un'azione, quando esistono già.
const { infoButton, titleWithInfo, refreshMovieInfo } = createMovieInfo({
	app,
	openImageLightbox,
	getData,
	saveHype: async (movieId, score) => {
		await store.setHype(movieId, score);
		await loadData();
	},
	renderMyViewings: movie => viewRenderer.renderMyViewings(movie),
	// Gli episodi solo per le serie salvate: un risultato della ricerca non ancora aggiunto ha la scheda semplice, come i film.
	renderSeries: movie => (data.movieById(movie.id) ? renderSeriesSection(movie, data.seriesOf(movie.id), { mode: data.mode }) : ''),
	// All'apertura della scheda: dettagli da OMDb se mancano, e per le serie la prima stagione e quella in corso.
	onShow: movie => {
		details.ensure(movie.id);
		if (movie.type === 'series' && data.movieById(movie.id)) details.ensureSeasons(movie.id, [1, data.seriesOf(movie.id).next?.s || 1]);
	},
	openViewing: target => diary.openViewingForm(target),
	openViewingRead: viewingId => diary.openViewingRead(viewingId),
	onVotesChanged: () => watchlist.updateWatchlistRows(),
	scheduleMovie: movieId => meetingActions.scheduleMovie(movieId)
});
// Le viste leggono lo stato dai moduli che lo possiedono. I getter vengono chiamati solo al render,
// quando tutti i moduli qui sotto esistono già.
const viewRenderer = createViews({
	getColorMode: () => document.documentElement.dataset.theme,
	getDiaryQuery: () => diary.getDiaryQuery(),
	getDiaryOpenGroups: () => diary.getDiaryOpenGroups(),
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
	renderVersionRow: () => updates.renderVersionRow(),
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
	refresh,
	// Dopo la visione nuova di un episodio: voto proposto alla stagione o alla serie appena finite.
	onEpisodeSaved: (movieId, before, episodes) => seriesUi.proposeVotes(movieId, before, episodes)
});
const seriesUi = createSeriesUi({ app, store, details, getData, refresh, ask, askConfirmation, openViewing: target => diary.openViewingForm(target), refreshMovieInfo });
// Notifiche locali: si riallineano da sole dopo ogni lettura dei dati; il permesso si chiede solo dopo un'azione.
const notifications = createNotifications({ getData });
const askNotifications = () => notifications.sync({ ask: true }).then(updateNotifyStatus);
const settings = createSettings({ store, details, getData, refresh, onProfileSaved: () => getData().profile?.birthday && askNotifications() });
const feedback = createFeedbackUi({ store, getData, refresh: loadData });
// Dopo un ripristino o un'importazione: locandine e dettagli dei titoli nuovi in sottofondo.
const completeNewTitles = ids => {
	if (!state) return;
	posters.ensure([...state.movies.values()].filter(movie => !ids || ids.includes(movie.id)));
	details.complete(ids);
};
const backup = createBackupUi({ store, getData, getState: () => state, refresh, askConfirmation, onRestored: () => completeNewTitles() });
const importer = createImportUi({ store, getData, refresh: loadData, askConfirmation, onImported: completeNewTitles });
// Gli aggiornamenti ridisegnano senza disturbare chi sta scrivendo; l'avviso non copre l'onboarding.
const updates = createUpdates({
	store,
	getData,
	refresh: async () => {
		await loadData();
		renderWhenIdle();
	},
	canShowDialog: () => !onboarding.isActive() && !document.querySelector('dialog[open]')
});
const onboarding = createOnboarding({
	store,
	details,
	getData,
	refresh: loadData,
	openBackup: options => backup.open(options),
	openImport: options => importer.open(options),
	onProfileSaved: askNotifications,
	onFinish: () => {
		location.hash = '#lista';
		render();
	}
});
const randomizer = createRandomizer({
	render,
	viewRenderer,
	selectableMovies: () => meetingActions.selectableMovies(),
	scheduleMovie: movieId => meetingActions.scheduleMovie(movieId)
});
const meetingActions = createMeeting({ store, getData, render, loadData, askConfirmation, runUndoable, flushUndoable, clearSelectedMovie: randomizer.clearSelectedMovie, renderMeetingForm: () => viewRenderer.renderMeetingForm(), onPlannedSaved: () => getData().upcoming?.date && askNotifications() });
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
		// In modalità completa i dettagli dei titoli appena aggiunti arrivano subito, in sottofondo.
		details.complete(added);
		return added.length;
	},
	getWatchlistType: watchlist.getWatchlistType,
	matchesContentType: watchlist.matchesContentType,
	updateWatchlistRows: watchlist.updateWatchlistRows,
	infoButton,
	titleWithInfo
});

// Dopo un salvataggio: dati riletti, vista ridisegnata, scheda aperta aggiornata.
async function refresh() {
	await loadData();
	render();
	refreshMovieInfo();
}

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
	notifications.sync();
	posterTheme.sync();
}

// Riga "Notifiche" delle Impostazioni: avviso se Android le ha bloccate.
async function updateNotifyStatus() {
	const status = document.querySelector('[data-notify-status]');
	if (!status) return;
	const state = await notifications.permission();
	status.textContent = state === 'denied' ? 'Android blocca le notifiche di myCimmena: riattivale da Impostazioni di Android → App → myCimmena → Notifiche.' : '';
}

const ROUTE_TITLES = { home: 'Home', diario: 'Diario', statistiche: 'Statistiche', prossimi: 'Randomizer', lista: 'Watchlist', impostazioni: 'Impostazioni', informazioni: 'Informazioni' };
// Anno scelto nelle statistiche ('' = tutto il diario).
let statsYear = '';
// Nomi delle pagine sul sito (e la vecchia pagina Serata, ora in Home): un link salvato porta comunque alla pagina giusta.
const OLD_ROUTES = { profilo: 'impostazioni', archivio: 'diario', calendario: 'home' };

function render() {
	if (OLD_ROUTES[route()]) {
		location.replace(`#${OLD_ROUTES[route()]}`);
		return;
	}
	updateDocumentTitle();
	const views = {
		home: viewRenderer.renderHome,
		diario: viewRenderer.renderDiary,
		statistiche: () => `${pageHeader('Statistiche', 'Il tuo diario in numeri.')}<div class="stats-page">${renderStats(data, { year: statsYear, today: today(), formatDate })}</div>`,
		prossimi: viewRenderer.renderComingFilms,
		lista: viewRenderer.renderMovieList,
		impostazioni: viewRenderer.renderSettings,
		informazioni: viewRenderer.renderInfo
	};
	onboarding.render();
	settings.updateBanner();
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

// Ridisegno in sottofondo (locandine appena salvate, schede da OMDb): non mentre si scrive, con una finestra aperta o
// mentre girano i rulli del randomizer (il ridisegno rimpiazzerebbe la slot a metà giro), e alla stessa altezza della pagina.
let renderPending = false;
function userIsBusy() {
	const active = document.activeElement;
	return Boolean(document.querySelector('dialog[open]'))
		|| Boolean(active?.closest?.('input, textarea, select, [contenteditable="true"]'))
		|| randomizer.isSpinning();
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
		if (!meeting || document.getElementById('share-home').disabled) return;
		// "Preparo l'immagine…" finché il menu Condividi non è aperto (o finché non va storto).
		showToast('sharePreparing');
		shareHomeImage(meeting, formatDate, meetingMovies, { onReady: hideToast }).then(outcome => {
			if (outcome === 'shared') showToast('shareDone');
			else if (outcome === 'downloaded') showToast('shareDownloaded');
			else hideToast();
		}).catch(showErrorToast);
	});
	// Nell'app si apre il calendario con l'evento già compilato; nel browser si scarica il file .ics.
	document.getElementById('calendar-home')?.addEventListener('click', () => {
		addMeetingToCalendar(data.upcoming, movieName).then(outcome => {
			if (outcome === 'downloaded') showToast('calendarDownloaded');
		}).catch(showErrorToast);
	});
	meetingActions.bind();
	watchlist.bind();
	randomizer.bind();
	search.bind(route());
	diary.bind();
	settings.bind();
	updates.bind();
	document.querySelector('[data-open-backup]')?.addEventListener('click', () => backup.open());
	document.querySelector('[data-open-feedback]')?.addEventListener('click', () => feedback.open());
	document.querySelectorAll('[data-notify]').forEach(toggle => toggle.addEventListener('click', async event => {
		const on = event.currentTarget.getAttribute('aria-checked') !== 'true';
		await store.updateKv('settings', { [event.currentTarget.dataset.notify]: on });
		await refresh();
		showToast('notificationsChanged', { on });
		if (on) askNotifications();
	}));
	updateNotifyStatus();
	document.querySelector('[data-stats-year]')?.addEventListener('change', event => {
		statsYear = event.target.value;
		render();
	});
	document.querySelector('button[data-poster-theme-switch]')?.addEventListener('click', async event => {
		const on = event.currentTarget.getAttribute('aria-checked') !== 'true';
		await store.updateKv('settings', { posterTheme: on });
		await refresh();
		showToast('posterThemeChanged', { on });
	});
	document.querySelector('[data-backup-reminder]')?.addEventListener('click', async event => {
		const on = event.currentTarget.getAttribute('aria-checked') !== 'true';
		await store.updateKv('settings', { backupReminder: on });
		await refresh();
		showToast('backupReminderChanged', { on });
	});
	document.querySelectorAll('[data-open-import]').forEach(button => button.addEventListener('click', () => importer.open({ kind: button.dataset.openImport || 'watchlist' })));
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
	// Modalità completa: si completano in sottofondo le schede dei titoli salvati senza dettagli.
	details.complete();
	// Aggiornamenti: subito, poi ogni ora e al ritorno in primo piano. Promemoria del backup se è vecchio.
	updates.start();
	backup.maybeRemind().catch(error => console.warn('Promemoria del backup non disponibile.', error));
})();
