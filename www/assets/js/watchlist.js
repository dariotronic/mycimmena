// Watchlist: filtri (tipo, punteggio minimo dei voti, vista a righe o a schede), ordinamento
// e rimozione annullabile.
import { contentType } from './domain.js';
import { HYPE_POINTS_EMOJI, HYPE_TITLE, watchlistVotes } from './hype.js';
import { apiRequest } from './api.js';
import { hydrateIcons, setIcon } from './icons.js';

const WATCHLIST_VIEW_KEY ='mycimmena-watchlist-view';
const WATCHLIST_CARDS_PER_ROW_KEY = 'mycimmena-watchlist-cards-per-row';
const WATCHLIST_MOBILE_CARDS_PER_ROW_KEY = 'mycimmena-watchlist-mobile-cards-per-row';

export function createWatchlist({ getData, viewRenderer, scheduleMovie, clearSelectedMovie, runUndoable, refreshSearchResults }) {
	const watchlistFilterDialog = document.getElementById('watchlist-filter-dialog');
	let watchlistType = '';
	// Punteggio minimo (somma dei voti) per restare in elenco; 0 = nessun filtro.
	let watchlistMinVotes = 0;
	let watchlistView = localStorage.getItem(WATCHLIST_VIEW_KEY) === 'cards' ? 'cards' : 'list';
	const savedCardsPerRow = Number(localStorage.getItem(WATCHLIST_CARDS_PER_ROW_KEY));
	let watchlistCardsPerRow = Number.isInteger(savedCardsPerRow) && savedCardsPerRow >= 2 && savedCardsPerRow <= 6 ? savedCardsPerRow : 3;
	const savedMobileCardsPerRow = Number(localStorage.getItem(WATCHLIST_MOBILE_CARDS_PER_ROW_KEY));
	let watchlistMobileCardsPerRow = savedMobileCardsPerRow === 2 || savedMobileCardsPerRow === 3
		? savedMobileCardsPerRow
		: Math.min(watchlistCardsPerRow, 3);
	let filterScrollPosition = null;
	let movieSort = 'added-desc';

	const matchesContentType = movie => !watchlistType || contentType(movie) === watchlistType;

	function updateFilterIndicator() {
		const active = watchlistFilterDialog.querySelector('.filter-tab.active');
		const indicator = watchlistFilterDialog.querySelector('.sort-switch-indicator');
		indicator.style.width = `${active.offsetWidth}px`;
		indicator.style.transform = `translateX(${active.offsetLeft}px)`;
	}
	function updateViewIndicator() {
		const active = watchlistFilterDialog.querySelector('.view-tab.active');
		const indicator = watchlistFilterDialog.querySelector('.view-option-switch .sort-switch-indicator');
		if (!active || !indicator) return;
		indicator.style.width = `${active.offsetWidth}px`;
		indicator.style.transform = `translateX(${active.offsetLeft}px)`;
	}
	function updateMobileCardsIndicator() {
		const active = watchlistFilterDialog.querySelector('.mobile-card-count-tab.active');
		const indicator = watchlistFilterDialog.querySelector('.mobile-card-count-switch .sort-switch-indicator');
		if (!active || !indicator) return;
		indicator.style.width = `${active.offsetWidth}px`;
		indicator.style.transform = `translateX(${active.offsetLeft}px)`;
	}
	function updateWatchlistFilterButton() {
		document.getElementById('watchlist-filter-open')?.setAttribute('aria-pressed', String(Boolean(watchlistType) || watchlistMinVotes > 0 || watchlistView === 'cards'));
	}
	// Filtro "Hypometro": slider da 0 al punteggio più alto in watchlist (nascosto se nessuno ha votato).
	function renderVoteFilter() {
		const section = document.getElementById('watchlist-vote-filter-section');
		const slider = document.getElementById('watchlist-min-votes');
		if (!section || !slider) return;
		section.querySelector('.filter-label').textContent = HYPE_TITLE;
		const max = Math.max(0, ...getData().movies.map(movie => watchlistVotes(movie).total));
		watchlistMinVotes = Math.min(watchlistMinVotes, max);
		section.hidden = !max;
		slider.max = String(Math.max(max, 1));
		slider.value = String(watchlistMinVotes);
		showMinVotes();
	}
	function showMinVotes() {
		const slider = document.getElementById('watchlist-min-votes');
		const output = document.getElementById('watchlist-min-votes-value');
		if (output) output.value = watchlistMinVotes ? `Almeno ${watchlistMinVotes} ${HYPE_POINTS_EMOJI}` : 'Tutti';
		slider?.setAttribute('aria-valuetext', watchlistMinVotes ? `Almeno ${watchlistMinVotes} ${watchlistMinVotes === 1 ? 'punto' : 'punti'}` : 'Tutti');
	}
	document.getElementById('watchlist-min-votes')?.addEventListener('input', event => {
		watchlistMinVotes = Number(event.currentTarget.value);
		showMinVotes();
		updateWatchlistFilterButton();
		updateWatchlistRows();
	});
	function updateWatchlistViewControls() {
		watchlistFilterDialog.querySelectorAll('.view-tab').forEach(button => {
			const active = button.dataset.view === watchlistView;
			button.classList.toggle('active', active);
			button.setAttribute('aria-pressed', String(active));
		});
		const sliderSettings = document.getElementById('watchlist-card-count-settings');
		const slider = document.getElementById('watchlist-card-count');
		const value = document.getElementById('watchlist-card-count-value');
		if (sliderSettings) sliderSettings.hidden = watchlistView !== 'cards';
		if (slider) slider.value = String(watchlistCardsPerRow);
		if (value) value.value = String(watchlistCardsPerRow);
		watchlistFilterDialog.querySelectorAll('.mobile-card-count-tab').forEach(button => {
			const active = Number(button.dataset.mobileCards) === watchlistMobileCardsPerRow;
			button.classList.toggle('active', active);
			button.setAttribute('aria-pressed', String(active));
		});
		updateViewIndicator();
		updateMobileCardsIndicator();
		updateWatchlistFilterButton();
	}
	document.getElementById('watchlist-filter-close').addEventListener('click', () => watchlistFilterDialog.close());
	watchlistFilterDialog.addEventListener('click', event => {
		if (event.target === watchlistFilterDialog) watchlistFilterDialog.close();
	});
	watchlistFilterDialog.addEventListener('close', () => {
		document.body.classList.remove('modal-open');
		if (filterScrollPosition) {
			window.scrollTo({ ...filterScrollPosition, behavior: 'instant' });
			filterScrollPosition = null;
		}
	});
	watchlistFilterDialog.querySelectorAll('.filter-tab').forEach(button => button.addEventListener('click', () => {
		watchlistType = button.dataset.type;
		watchlistFilterDialog.querySelectorAll('.filter-tab').forEach(tab => {
			const active = tab.dataset.type === watchlistType;
			tab.classList.toggle('active', active);
			tab.setAttribute('aria-pressed', String(active));
		});
		updateFilterIndicator();
		updateWatchlistFilterButton();
		updateWatchlistRows();
		refreshSearchResults();
	}));
	watchlistFilterDialog.querySelectorAll('.view-tab').forEach(button => button.addEventListener('click', () => {
		watchlistView = button.dataset.view;
		localStorage.setItem(WATCHLIST_VIEW_KEY, watchlistView);
		updateWatchlistViewControls();
		updateWatchlistRows();
	}));
	document.getElementById('watchlist-card-count')?.addEventListener('input', event => {
		watchlistCardsPerRow = Number(event.currentTarget.value);
		localStorage.setItem(WATCHLIST_CARDS_PER_ROW_KEY, String(watchlistCardsPerRow));
		document.getElementById('watchlist-card-count-value').value = String(watchlistCardsPerRow);
		updateWatchlistRows();
	});
	watchlistFilterDialog.querySelectorAll('.mobile-card-count-tab').forEach(button => button.addEventListener('click', () => {
		watchlistMobileCardsPerRow = Number(button.dataset.mobileCards);
		localStorage.setItem(WATCHLIST_MOBILE_CARDS_PER_ROW_KEY, String(watchlistMobileCardsPerRow));
		updateWatchlistViewControls();
		updateWatchlistRows();
	}));
	window.addEventListener('resize', () => {
		updateSortIndicator(false);
		if (watchlistFilterDialog.open) {
			updateFilterIndicator();
			updateViewIndicator();
			updateMobileCardsIndicator();
		}
	});

	// `animate` false: la barra è appena stata ridisegnata (ad esempio dopo aver aggiunto un film all'appuntamento),
	// quindi l'evidenziazione va subito sulla linguetta attiva invece di scorrere dalla prima a sinistra.
	function updateSortIndicator(animate = true) {
		const indicator = document.querySelector('.list-toolbar .sort-switch-indicator');
		const active = document.querySelector('.list-toolbar .sort-tab.active');
		if (!indicator || !active) return;
		if (!animate) indicator.style.transition = 'none';
		indicator.style.width = `${active.offsetWidth}px`;
		indicator.style.transform = `translateX(${active.offsetLeft}px)`;
		if (!animate) {
			void indicator.offsetWidth; // applica la posizione prima di riattivare la transizione
			indicator.style.transition = '';
		}
	}

	function applySort(nextField, nextDirection) {
		movieSort = `${nextField}-${nextDirection}`;
		document.querySelectorAll('.list-toolbar .sort-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.field === nextField));
		const directionButton = document.getElementById('sort-direction');
		if (directionButton) {
			const directionLabel = `Ordine ${nextDirection === 'desc' ? 'discendente' : 'ascendente'}`;
			setIcon(directionButton.querySelector('.material-icons-outlined'), nextDirection === 'desc' ? 'arrow_downward' : 'arrow_upward');
			directionButton.setAttribute('aria-label', directionLabel);
			directionButton.setAttribute('title', directionLabel);
		}
		updateSortIndicator();
		updateWatchlistRows();
	}

	function updateWatchlistRows() {
		const list = document.getElementById('movie-list-rows');
		if (!list) return;
		list.innerHTML = viewRenderer.renderMovieRows();
		list.dataset.view = watchlistView;
		list.dataset.mobileCardsPerRow = String(watchlistMobileCardsPerRow);
		list.style.setProperty('--cards-per-row', watchlistCardsPerRow);
		list.style.setProperty('--mobile-cards-per-row', watchlistMobileCardsPerRow);
		hydrateIcons(list);
		bindMovieActionEvents(list);
	}

	function bindMovieActionEvents(root = document) {
		root.querySelectorAll('.remove-movie').forEach(button => button.addEventListener('click', () => removeMovie(button.dataset.movieId)));
		root.querySelectorAll('.schedule-movie').forEach(button => button.addEventListener('click', () => scheduleMovie(button.dataset.movieId)));
	}

	function removeMovie(id) {
		const index = getData().movies.findIndex(movie => movie.id === id);
		if (index < 0) return;
		const removed = getData().movies[index];
		runUndoable({
			toastKey: 'movieRemoved',
			apply: () => {
				getData().movies.splice(index, 1);
				clearSelectedMovie(id);
			},
			revert: () => getData().movies.splice(Math.min(index, getData().movies.length), 0, removed),
			commit: keepalive => apiRequest(`api/movies.php?id=${encodeURIComponent(id)}`, { method: 'DELETE', keepalive })
		});
	}

	function bind() {
		document.getElementById('watchlist-filter-open')?.addEventListener('click', () => {
			filterScrollPosition = { left: window.scrollX, top: window.scrollY };
			document.body.classList.add('modal-open');
			renderVoteFilter();
			watchlistFilterDialog.showModal();
			updateFilterIndicator();
			updateWatchlistViewControls();
		});
		bindMovieActionEvents();
		if (document.querySelector('.sort-switch')) updateSortIndicator(false);
		document.querySelectorAll('.list-toolbar .sort-tab').forEach(tab => tab.addEventListener('click', () => {
			const [, direction] = movieSort.split('-');
			applySort(tab.dataset.field, direction);
		}));
		document.getElementById('sort-direction')?.addEventListener('click', () => {
			const [field, direction] = movieSort.split('-');
			applySort(field, direction === 'desc' ? 'asc' : 'desc');
		});
	}

	return {
		getMovieSort: () => movieSort,
		getWatchlistCardsPerRow: () => watchlistCardsPerRow,
		getWatchlistMinVotes: () => watchlistMinVotes,
		getWatchlistMobileCardsPerRow: () => watchlistMobileCardsPerRow,
		getWatchlistType: () => watchlistType,
		getWatchlistView: () => watchlistView,
		matchesContentType,
		updateWatchlistRows,
		bind
	};
}
