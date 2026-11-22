// Ricerca OMDb e coda delle aggiunte alla watchlist. La stessa casella, nell'altra modalità, filtra la watchlist.
import { contentType, escapeHtml } from './domain.js';
import { apiRequest } from './api.js';
import { hydrateIcons, icon, setIcon } from './icons.js';
import { showErrorToast, showToast } from './toasts.js';
import { posterButton } from './movie-info.js';

export function createSearch({ getData, render, loadData, getWatchlistType, matchesContentType, updateWatchlistRows, infoButton, titleWithInfo }) {
	let imdbResults = [];
	const pendingMovies = new Map();
	let pendingMovieConflicts = new Set();
	let movieSearchTimer = null;
	let movieSearchSequence = 0;
	let movieSearchMode = 'watchlist';
	let watchlistQuery = '';
	let omdbQuery = '';

	function toggleMovieSearchMode() {
		window.clearTimeout(movieSearchTimer);
		movieSearchSequence += 1;
		imdbResults = [];
		watchlistQuery = '';
		omdbQuery = '';
		movieSearchMode = movieSearchMode === 'watchlist' ? 'omdb' : 'watchlist';
		render();
		document.getElementById(movieSearchMode === 'omdb' ? 'movie-query' : 'watchlist-query')?.focus();
	}

	function scheduleMovieSearch(immediate = false) {
		const input = document.getElementById('movie-query');
		if (!input || movieSearchMode !== 'omdb') return;
		omdbQuery = input.value;
		const query = input.value.trim();
		const watchlist = document.getElementById('watchlist-section');
		const results = document.getElementById('search-results');
		const status = document.getElementById('search-status');
		const loader = document.getElementById('search-loader');
		const form = document.getElementById('movie-search-form');
		window.clearTimeout(movieSearchTimer);
		const sequence = ++movieSearchSequence;
		if (!query) {
			watchlist.hidden = true;
			results.hidden = true;
			results.innerHTML = '';
			status.textContent = '';
			loader.hidden = true;
			form.removeAttribute('aria-busy');
			imdbResults = [];
			return;
		}

		watchlist.hidden = true;
		results.hidden = false;
		results.innerHTML = '';
		status.textContent = 'Ricerca OMDb in corso.';
		loader.hidden = false;
		form.setAttribute('aria-busy', 'true');
		movieSearchTimer = window.setTimeout(() => searchMovies(query, sequence), immediate ? 0 : 1000);
	}

	async function searchMovies(query, sequence) {
		const status = document.getElementById('search-status');
		const results = document.getElementById('search-results');
		const loader = document.getElementById('search-loader');
		const form = document.getElementById('movie-search-form');
		try {
			const payload = await apiRequest(`api/search.php?q=${encodeURIComponent(query)}`);
			if (sequence !== movieSearchSequence) return;
			imdbResults = (payload.d || []).filter(item => /^tt[0-9]{1,20}$/.test(item.id || '') && item.l).slice(0, 8).map(item => ({
				id: item.id,
				type: contentType(item),
				title: item.l,
				year: item.y || item.yr || '',
				poster: item.i?.imageUrl || '',
				director: item.director || null,
				actors_full: item.actors_full || null,
				plot: item.plot || null,
				runtime: item.runtime || null,
				genre: item.genre || null,
				awards: item.awards || null,
				imdb_rating: item.imdb_rating || null,
				box_office: item.box_office || null
			}));
			renderSearchResults();
		} catch (error) {
			if (sequence !== movieSearchSequence) return;
			status.textContent = `Ricerca OMDb non disponibile: ${error.message}`;
			results.innerHTML = `
				<p class="search-empty error">${escapeHtml(status.textContent)}</p>
			`;
		} finally {
			if (sequence === movieSearchSequence) {
				loader.hidden = true;
				form.removeAttribute('aria-busy');
			}
		}
	}

	function renderSearchResults() {
		const status = document.getElementById('search-status');
		const results = document.getElementById('search-results');
		if (!status || !results) return;
		const unique = imdbResults.filter(movie => matchesContentType(movie) && !getData().movies.some(existing => existing.id === movie.id));
		if (!unique.length) {
			status.textContent = getWatchlistType() ? 'Nessun risultato corrisponde ai filtri selezionati.' : imdbResults.length ? 'Tutti i risultati trovati sono già in watchlist.' : 'Nessun risultato. Prova con un altro titolo.';
			results.innerHTML = `
				<p class="search-empty">${escapeHtml(status.textContent)}</p>
			`;
			return;
		}
		status.textContent = `${unique.length} risultati trovati.`;
		results.innerHTML = unique.map(movie => {
			const originalIndex = imdbResults.indexOf(movie);
			const queued = pendingMovies.has(movie.id);
			const directorLine = movie.director
				? `<p class="movie-director">${escapeHtml(movie.director)}</p>`
				: '';
			const queueLabel = queued ? 'Già in coda' : 'Metti in coda';
			return `
				<article class="search-result">
					${posterButton(movie, 'movie-poster', 'search-result-poster')}
					<div>
						<h2 class="movie-title">${escapeHtml(movie.title)}</h2>
						${directorLine}
						<p class="movie-year">${escapeHtml(movie.year || 'Anno non indicato')}</p>
					</div>
					<div class="movie-actions">
						${infoButton(movie)}
						<button class="button secondary icon-only queue-search-result" data-index="${originalIndex}" type="button" aria-label="${queueLabel}" title="${queueLabel}" ${queued ? 'disabled' : ''}>
							${icon(queued ? 'playlist_add_check' : 'playlist_add')}
						</button>
					</div>
				</article>
			`;
		}).join('');
		hydrateIcons(results);
		results.querySelectorAll('.queue-search-result').forEach(button => {
			button.addEventListener('click', () => queueMovie(button.dataset.index));
		});
	}

	function queueMovie(index) {
		const movie = imdbResults[Number(index)];
		if (!movie || getData().movies.some(existing => existing.id === movie.id) || pendingMovies.has(movie.id)) return;
		pendingMovies.set(movie.id, movie);
		pendingMovieConflicts.delete(movie.id);
		const resultButton = [...document.querySelectorAll('.queue-search-result')].find(button => Number(button.dataset.index) === Number(index));
		if (resultButton) {
			resultButton.disabled = true;
			resultButton.setAttribute('aria-label', 'Già in coda');
			resultButton.setAttribute('title', 'Già in coda');
			setIcon(resultButton.querySelector('.material-icons-outlined'), 'playlist_add_check');
		}
		renderPendingAdditions();
		showToast('movieQueued');
	}

	function renderPendingAdditions() {
		const container = document.getElementById('pending-additions');
		if (!container) return;
		if (!pendingMovies.size) {
			container.hidden = true;
			container.innerHTML = '';
			return;
		}
		container.hidden = false;
		const rows = [...pendingMovies.values()].map(movie => `
			<article class="pending-movie-row">
				${posterButton(movie, 'pending-movie-poster', 'pending-movie-poster-trigger')}
				<div class="pending-movie-copy">
					${titleWithInfo(movie, `<h3>${escapeHtml(movie.title)}</h3>`)}
					<p>${escapeHtml(movie.year || 'Anno non indicato')}</p>
					${pendingMovieConflicts.has(movie.id) ? '<span class="pending-conflict">Già presente nella watchlist</span>' : ''}
				</div>
				<button class="button secondary icon-only remove-pending-movie" data-movie-id="${escapeHtml(movie.id)}" type="button" aria-label="Rimuovi ${escapeHtml(movie.title)} dalla coda" title="Rimuovi dalla coda">
					${icon('close')}
				</button>
			</article>
		`).join('');
		container.innerHTML = `
			<section class="pending-additions-panel">
				<div class="pending-additions-header">
					<div>
						<p class="eyebrow">Aggiunte in attesa</p>
						<p class="pending-additions-count">${pendingMovies.size} ${pendingMovies.size === 1 ? 'film selezionato' : 'film selezionati'}</p>
					</div>
				</div>
				<div class="pending-additions-actions">
					<button id="clear-pending-movies" class="button secondary icon-only" type="button" aria-label="Annulla tutte le aggiunte in coda" title="Svuota la coda">
						${icon('close')}
					</button>
					<button id="commit-pending-movies" class="button icon-only" type="button" aria-label="Aggiungi i film in coda alla watchlist" title="Aggiungi alla watchlist">
						${icon('done_all')}
					</button>
				</div>
				<div class="pending-movie-list">${rows}</div>
			</section>
		`;
		hydrateIcons(container);
		container.querySelectorAll('.remove-pending-movie').forEach(button => button.addEventListener('click', () => removePendingMovie(button.dataset.movieId)));
		container.querySelector('#clear-pending-movies').addEventListener('click', clearPendingMovies);
		container.querySelector('#commit-pending-movies').addEventListener('click', addQueuedMovies);
	}

	function removePendingMovie(movieId) {
		pendingMovies.delete(movieId);
		pendingMovieConflicts.delete(movieId);
		const resultButton = [...document.querySelectorAll('.queue-search-result')].find(button => imdbResults[Number(button.dataset.index)]?.id === movieId);
		if (resultButton) {
			resultButton.disabled = false;
			resultButton.setAttribute('aria-label', 'Metti in coda');
			resultButton.setAttribute('title', 'Metti in coda');
			setIcon(resultButton.querySelector('.material-icons-outlined'), 'playlist_add');
		}
		renderPendingAdditions();
		showToast('movieUnqueued');
	}

	function clearPendingMovies() {
		document.querySelectorAll('.queue-search-result').forEach(button => {
			const movie = imdbResults[Number(button.dataset.index)];
			if (!movie || !pendingMovies.has(movie.id)) return;
			button.disabled = false;
			button.setAttribute('aria-label', 'Metti in coda');
			button.setAttribute('title', 'Metti in coda');
			setIcon(button.querySelector('.material-icons-outlined'), 'playlist_add');
		});
		pendingMovies.clear();
		pendingMovieConflicts.clear();
		renderPendingAdditions();
		showToast('queueCleared');
	}

	async function addQueuedMovies() {
		if (!pendingMovies.size) return;
		const button = document.getElementById('commit-pending-movies');
		button.disabled = true;
		try {
			const addedCount = pendingMovies.size;
			const result = await apiRequest('api/movies.php', {
				method: 'POST',
				body: JSON.stringify({ movies: [...pendingMovies.values()] })
			});
			showToast('moviesAdded', { count: addedCount });
			pendingMovies.clear();
			pendingMovieConflicts.clear();
			// Finite le aggiunte si torna alla watchlist, in cima alla pagina e senza lasciare il focus sulla ricerca.
			window.clearTimeout(movieSearchTimer);
			movieSearchSequence += 1;
			movieSearchMode = 'watchlist';
			omdbQuery = '';
			imdbResults = [];
			await loadData();
			render();
			if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
			window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
			if (result.poster_errors?.length) {
				showErrorToast(`Film aggiunti, ma il download non è riuscito per ${result.poster_errors.length} copertine: verranno usate le immagini originali.`);
			}
		} catch (error) {
			const conflicts = Array.isArray(error.conflicts) ? error.conflicts : [];
			pendingMovieConflicts = new Set(conflicts.map(movie => movie.id));
			renderPendingAdditions();
			const conflictTitles = conflicts.map(movie => movie.title).join(', ');
			showErrorToast(error.status === 409
				? `Nel frattempo questi film sono già stati aggiunti: ${conflictTitles}. Rimuovili dalla coda con la × e riprova.`
				: error);
		}
	}

	// Svuota ricerca e coda: senza login non servono, e dopo l'uscita non devono restare a chi usa il dispositivo.
	function resetSearch() {
		pendingMovies.clear();
		pendingMovieConflicts.clear();
		movieSearchMode = 'watchlist';
		omdbQuery = '';
		imdbResults = [];
	}

	// Dopo un cambio di filtro i risultati OMDb già trovati si ridisegnano con il nuovo tipo.
	function refreshResults() {
		if (movieSearchMode === 'omdb' && imdbResults.length) renderSearchResults();
	}

	function bind(currentRoute) {
		const searchForm = document.getElementById('movie-search-form');
		searchForm?.addEventListener('submit', event => {
			event.preventDefault();
			if (movieSearchMode === 'omdb') scheduleMovieSearch(true);
			else updateWatchlistRows();
		});
		document.getElementById('watchlist-query')?.addEventListener('input', event => {
			watchlistQuery = event.target.value;
			updateWatchlistRows();
		});
		document.getElementById('search-mode-toggle')?.addEventListener('click', toggleMovieSearchMode);
		document.getElementById('movie-query')?.addEventListener('input', () => scheduleMovieSearch());
		if (currentRoute === 'lista' && movieSearchMode === 'omdb' && omdbQuery.trim()) scheduleMovieSearch();
	}

	return {
		getMovieSearchMode: () => movieSearchMode,
		getOmdbQuery: () => omdbQuery,
		getWatchlistQuery: () => watchlistQuery,
		refreshResults,
		renderPendingAdditions,
		resetSearch,
		bind
	};
}
