// Locandine, pulsante (i) e scheda del film. La scheda chiede i dettagli ad api/movie.php alla prima apertura.
import { contentType, escapeHtml, movieName } from './domain.js';
import { formatVoteTotal, HYPE_LEVELS, HYPE_MAX, HYPE_MEMBERS_EMOJI, HYPE_POINTS_EMOJI, HYPE_TITLE, hypeLevel, watchlistVotes } from './hype.js';
import { apiRequest } from './api.js';
import { icon } from './icons.js';
import { showErrorToast } from './toasts.js';

export const movieDetails = movie => {
	const directorLine = movie.director ? `<p class="movie-director">${escapeHtml(movie.director)}</p>` : '';
	return directorLine;
};

// Le locandine di IMDb si possono chiedere già ridimensionate: ._V1_SX<larghezza>.jpg. L'originale senza misura
// arriva a 1728 × 2552 px e quasi 1 MB; gli altri indirizzi restano com'erano.
export const POSTER_CARD_WIDTH = 400;
export const POSTER_FULL_WIDTH = 1000;
export function sizedPosterUrl(url, width) {
	const value = String(url || '');
	if (!/^https:\/\/m\.media-amazon\.com\/images\/M\/[^?#]+\._V1_[^/?#]*\.(jpe?g|png)$/i.test(value)) return value;
	return value.replace(/\._V1_[^/?#]*\.(jpe?g|png)$/i, `._V1_SX${width}.$1`);
}

// Miniatura per card e righe: la copia locale (file statico in assets/posters/, in cache su Cloudflare), altrimenti
// la versione ridimensionata di IMDb. Con original === true (scheda del film) l'immagine porta anche data-full,
// la versione grande che il lightbox carica sopra la miniatura già visibile.
export function poster(movie, className = 'movie-poster', original = false) {
	const full = original === true;
	const validId = /^tt[0-9]{1,20}$/.test(movie.id || '');
	const remote = sizedPosterUrl(movie.poster, POSTER_CARD_WIDTH);
	let source = movie.poster_local || '';
	if (!source && validId && original === 'preview') source = `api/poster.php?i=${encodeURIComponent(movie.id)}&preview=1`;
	else if (!source && validId && movie.poster_cached === true) source = `api/poster.php?i=${encodeURIComponent(movie.id)}`;
	source ||= remote;
	const fallback = remote && remote !== source ? ` data-fallback="${escapeHtml(remote)}"` : '';
	const large = full ? sizedPosterUrl(movie.poster, POSTER_FULL_WIDTH) : '';
	const fullAttribute = large && large !== source ? ` data-full="${escapeHtml(large)}"` : '';
	if (source) {
		return `
			<img
				class="${className}"
				src="${escapeHtml(source)}"${fallback}${fullAttribute}
				alt="Locandina di ${escapeHtml(movie.title)}"
				loading="${full || className === 'home-movie-poster' ? 'eager' : 'lazy'}"
				decoding="async"
				data-poster-class="${escapeHtml(className)}"
			>
		`;
	}
	return `<div class="${className} placeholder" aria-hidden="true">C</div>`;
}

// Download della locandina dal lightbox: api/poster.php la scarica in grande da IMDb (o dà la copia locale)
// e la consegna con il nome "Locandina <titolo>". Stringa vuota se il film non ha un ID IMDb.
export function posterDownloadUrl(movie) {
	if (!/^tt[0-9]{1,20}$/.test(movie?.id || '')) return '';
	const params = new URLSearchParams({ i: movie.id, download: '1', title: movieName(movie) });
	const large = sizedPosterUrl(movie.poster, POSTER_FULL_WIDTH);
	if (/^https:\/\/m\.media-amazon\.com\//.test(large)) params.set('src', large);
	else if (!movie.poster_local && movie.poster_cached !== true) return '';
	return `api/poster.php?${params}`;
}

export function posterButton(movie, className, extraClass = '') {
	const classes = ['movie-poster-trigger', extraClass].filter(Boolean).join(' ');
	return `<button class="${classes}" data-movie-id="${escapeHtml(movie.id)}" type="button" aria-label="Apri i dettagli di ${escapeHtml(movie.title)}">${poster(movie, className)}</button>`;
}

// `onVotesChanged` (facoltativo) gira dopo ogni voto salvato: la watchlist si riordina e rifiltra.
export function createMovieInfo({ app, openImageLightbox, getData = () => ({ movies: [] }), onVotesChanged = () => {} }) {
	const movieInfoDialog = document.getElementById('movie-info-dialog');
	const movieInfoClose = document.getElementById('movie-info-close');
	const movieInfoPoster = document.getElementById('movie-info-poster');
	const movieInfoTitle = document.getElementById('movie-info-title');
	const movieInfoVote = document.getElementById('movie-info-vote');
	const movieInfoDetails = document.getElementById('movie-info-details');
	const movieInfoRegistry = new Map();
	let movieInfoScrollPosition = null;

	function infoButton(movie) {
		movieInfoRegistry.set(movie.id, movie);
		return `
			<button class="icon-button small movie-info-trigger" data-movie-id="${escapeHtml(movie.id)}" type="button" aria-label="Informazioni su ${escapeHtml(movie.title)}" title="Informazioni">
				${icon('info')}
			</button>
		`;
	}
	function titleWithInfo(movie, titleHtml, actionsHtml = '') {
		return `
			<div class="title-row">
				${titleHtml}
				${infoButton(movie)}
				${actionsHtml}
			</div>
		`;
	}

	// Gli elenchi di data.php non portano attori, trama e gli altri dettagli: la scheda li chiede ad api/movie.php
	// la prima volta che si apre, e li tiene in memoria. I risultati della ricerca OMDb li hanno già.
	const movieDetailCache = new Map();
	const hasMovieDetails = movie => 'plot' in movie;

	function showMovieInfo(movieId) {
		const movie = movieInfoRegistry.get(movieId);
		if (!movie) return;
		movieInfoPoster.innerHTML = poster(movie, 'movie-info-cover', true);
		movieInfoTitle.textContent = movieName(movie);
		renderVote(movieId);
		const details = hasMovieDetails(movie) ? movie : movieDetailCache.get(movieId);
		renderMovieInfoDetails(details ? { ...movie, ...details } : movie, !details);
		movieInfoDialog.dataset.movieId = movieId;
		movieInfoScrollPosition = { left: window.scrollX, top: window.scrollY };
		document.body.classList.add('modal-open');
		movieInfoDialog.showModal();
		if (!details) loadMovieDetails(movie);
	}

	async function loadMovieDetails(movie) {
		try {
			const result = await apiRequest(`api/movie.php?id=${encodeURIComponent(movie.id)}`);
			movieDetailCache.set(movie.id, result.movie);
			if (movieInfoDialog.open && movieInfoDialog.dataset.movieId === movie.id) renderMovieInfoDetails({ ...movie, ...result.movie });
		} catch (error) {
			if (movieInfoDialog.open && movieInfoDialog.dataset.movieId === movie.id) renderMovieInfoDetails(movie);
			showErrorToast(error);
		}
	}

	function renderMovieInfoDetails(movie, loading = false) {
		movieInfoDetails.setAttribute('aria-busy', String(loading));
		const rows = [
			['Regista', movie.director],
			['Attori', movie.actors_full],
			['Trama', movie.plot],
			['Durata', movie.runtime],
			['Genere', movie.genre],
			['Riconoscimenti', movie.awards],
			['Valutazione IMDb', movie.imdb_rating ? `${movie.imdb_rating}/10` : ''],
			['Incasso', movie.box_office],
			['Tipo', ({ movie: 'Film', series: 'Serie TV', episode: 'Episodio' })[contentType(movie)] || 'Non disponibile']
		].filter(([, value]) => value);
		const rowsHtml = rows.map(([label, value]) => `
			<div class="movie-info-row">
				<dt>${escapeHtml(label)}</dt>
				<dd>${escapeHtml(value)}</dd>
			</div>
		`).join('');
		if (loading) movieInfoDetails.innerHTML = `${rowsHtml}<p class="movie-info-empty">Caricamento dei dettagli…</p>`;
		else movieInfoDetails.innerHTML = rows.length ? rowsHtml : '<p class="movie-info-empty">Nessuna informazione aggiuntiva disponibile.</p>';
	}

	// Hypometro: solo per i film ancora in watchlist. Lo slider va da 0 (nessuna voglia, ma è un voto) a 5 e si salva quando
	// lo si lascia (evento change: rilascio del dito o del mouse, oppure ogni tasto freccia). Emoji in hype.js.
	const watchlistMovie = movieId => getData().movies.find(movie => movie.id === movieId) || null;
	// `score` null = l'utente non ha ancora votato (anche 0 è un voto).
	const hypeText = score => (score === null ? 'Non hai ancora votato' : `${score} su ${HYPE_MAX}: ${hypeLevel(score).label}`);
	// Salvataggi in coda per film: con più voti di fila parte solo l'ultimo non ancora inviato.
	const voteQueues = new Map();
	// Su desktop il riquadro sta sotto la locandina con lo slider verticale (style.css); su mobile, a colonna unica,
	// resta dopo il titolo, con lo slider orizzontale.
	const movieInfoSide = document.getElementById('movie-info-side');
	const desktopLayout = window.matchMedia('(min-width: 641px)');
	function placeVote() {
		if (desktopLayout.matches) movieInfoSide.append(movieInfoVote);
		else movieInfoTitle.after(movieInfoVote);
	}
	placeVote();
	desktopLayout.addEventListener('change', placeVote);

	function renderVote(movieId) {
		const movie = watchlistMovie(movieId);
		movieInfoVote.hidden = !movie;
		if (!movie) {
			movieInfoVote.innerHTML = '';
			return;
		}
		const votes = watchlistVotes(movie);
		resetVoteSlider(votes.mine);
		// Scala di emoji accanto allo slider: quella del voto attuale è evidenziata, e toccarne una vota quel livello.
		const scale = HYPE_LEVELS.map(({ emoji, label }, score) => `<span class="movie-vote-step${score === votes.mine ? ' active' : ''}" data-hype-score="${score}" title="${escapeHtml(label)}">${escapeHtml(emoji)}</span>`).join('');
		movieInfoVote.innerHTML = `
			<h3 id="movie-vote-title" class="movie-vote-title">${escapeHtml(HYPE_TITLE)}</h3>
			<p class="movie-vote-total" aria-live="polite">${voteTotalHtml(votes)}</p>
			<div class="movie-vote-control">
				<label class="visually-hidden" for="movie-vote-range">Il tuo voto nell’${escapeHtml(HYPE_TITLE)}</label>
				<input id="movie-vote-range" class="movie-vote-range" type="range" min="0" max="${HYPE_MAX}" step="any" value="${votes.mine ?? 0}"
					aria-valuetext="${escapeHtml(hypeText(votes.mine))}">
				<div class="movie-vote-scale" aria-hidden="true">${scale}</div>
			</div>
		`;
	}

	// Totale con le emoji di hype.js ("12 🍿 · 4 👥"), anche senza voti ("0 🍿 · 0 👥"): i votanti distinguono
	// un film che nessuno ha votato da uno votato 0. Il testo per gli screen reader resta in parole.
	function voteTotalHtml(votes) {
		return `<span aria-hidden="true" title="${escapeHtml(formatVoteTotal(votes))}"><strong>${votes.total}</strong> ${escapeHtml(HYPE_POINTS_EMOJI)} · ${votes.count} ${escapeHtml(HYPE_MEMBERS_EMOJI)}</span><span class="visually-hidden">${escapeHtml(formatVoteTotal(votes))}</span>`;
	}

	// Come lo Spipometro, il cursore è sempre agganciato a un livello (l'emoji più vicina al punto trascinato),
	// ma tra un'emoji e l'altra scivola invece di saltare: step="any" permette le posizioni intermedie
	// dell'animazione, mentre `targetVote` è il livello agganciato e `shownVote` la posizione mostrata.
	// Finché l'utente non vota, `targetVote` è null: il cursore sta sullo 0 ma nessuna emoji è evidenziata,
	// e anche scegliere lo 0 conta come voto.
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	let rangeAnimation = 0;
	let shownVote = 0;
	let targetVote = 0;

	function stopRangeAnimation() {
		cancelAnimationFrame(rangeAnimation);
		rangeAnimation = 0;
	}

	function resetVoteSlider(score) {
		stopRangeAnimation();
		targetVote = score;
		shownVote = score ?? 0;
	}

	function showVoteValue(range, score) {
		range.setAttribute('aria-valuetext', hypeText(score));
		movieInfoVote.querySelectorAll('.movie-vote-step').forEach(step => step.classList.toggle('active', Number(step.dataset.hypeScore) === score));
		if (score === targetVote && rangeAnimation) return;
		targetVote = score;
		stopRangeAnimation();
		const position = score ?? 0;
		const from = shownVote;
		const distance = position - from;
		if (!distance || reducedMotion.matches) {
			shownVote = position;
			range.value = String(position);
			return;
		}
		const duration = Math.min(280, 110 + Math.abs(distance) * 50);
		const start = performance.now();
		const frame = now => {
			const progress = Math.min(1, (now - start) / duration);
			shownVote = progress === 1 ? position : from + distance * (1 - (1 - progress) ** 3);
			range.value = String(shownVote);
			rangeAnimation = progress === 1 ? 0 : requestAnimationFrame(frame);
		};
		range.value = String(from);
		rangeAnimation = requestAnimationFrame(frame);
	}

	// Aggiorna il riepilogo nel modale, se mostra ancora lo stesso film.
	function refreshVoteTotal(movieId, movie) {
		if (!movieInfoDialog.open || movieInfoDialog.dataset.movieId !== movieId) return;
		const total = movieInfoVote.querySelector('.movie-vote-total');
		if (total) total.innerHTML = voteTotalHtml(watchlistVotes(movie));
	}

	async function saveVote(movieId, score) {
		const queue = voteQueues.get(movieId) || { saving: false, pending: null };
		voteQueues.set(movieId, queue);
		queue.pending = score;
		if (queue.saving) return;
		queue.saving = true;
		while (queue.pending !== null) {
			const next = queue.pending;
			queue.pending = null;
			try {
				const result = await apiRequest('api/watchlist-votes.php', { method: 'PUT', body: JSON.stringify({ movieId, score: next }) });
				// Dopo un ricaricamento dei dati l'oggetto del film può essere cambiato: si aggiorna quello attuale.
				const movie = watchlistMovie(movieId);
				if (movie) {
					movie.votes = result.votes;
					refreshVoteTotal(movieId, movie);
				}
			} catch (error) {
				queue.pending = null;
				showErrorToast(error);
				const movie = watchlistMovie(movieId);
				const range = document.getElementById('movie-vote-range');
				if (movie && range && movieInfoDialog.dataset.movieId === movieId) showVoteValue(range, watchlistVotes(movie).mine);
			}
		}
		queue.saving = false;
		onVotesChanged(movieId);
	}

	// Trascinando, il browser porta il valore sotto il dito: lo si sostituisce subito con la posizione agganciata,
	// e quando il punto più vicino diventa un'altra emoji il cursore ci scivola sopra (con una vibrazione sui touch,
	// come lo Spipometro).
	movieInfoVote.addEventListener('input', event => {
		const range = event.target;
		if (range.id !== 'movie-vote-range') return;
		const score = Math.round(Number(range.value));
		range.value = String(shownVote);
		if (score === targetVote) return;
		showVoteValue(range, score);
		if (window.matchMedia('(pointer: coarse)').matches && typeof navigator.vibrate === 'function') navigator.vibrate(8);
	});
	// Si salva al rilascio il livello agganciato.
	movieInfoVote.addEventListener('change', event => {
		if (event.target.id === 'movie-vote-range' && targetVote !== null) saveVote(movieInfoDialog.dataset.movieId, snapVote(event.target, targetVote));
	});
	// Con step="any" le frecce sposterebbero il cursore di frazioni: la tastiera va di un livello alla volta
	// (senza voto si parte dallo 0, quindi la freccia giù vota 0).
	const VOTE_KEYS = { ArrowUp: 1, ArrowRight: 1, PageUp: 1, ArrowDown: -1, ArrowLeft: -1, PageDown: -1 };
	movieInfoVote.addEventListener('keydown', event => {
		const range = event.target;
		if (range.id !== 'movie-vote-range') return;
		let score;
		if (event.key in VOTE_KEYS) score = Math.max(0, Math.min(HYPE_MAX, (targetVote ?? 0) + VOTE_KEYS[event.key]));
		else if (event.key === 'Home') score = 0;
		else if (event.key === 'End') score = HYPE_MAX;
		else return;
		event.preventDefault();
		if (score !== targetVote) saveVote(movieInfoDialog.dataset.movieId, snapVote(range, score));
	});
	movieInfoVote.addEventListener('click', event => {
		const step = event.target.closest('[data-hype-score]');
		const range = document.getElementById('movie-vote-range');
		if (!step || !range) return;
		const score = Number(step.dataset.hypeScore);
		if (score === targetVote) return;
		saveVote(movieInfoDialog.dataset.movieId, snapVote(range, score));
	});

	function snapVote(range, score) {
		showVoteValue(range, score);
		return score;
	}

	movieInfoClose.addEventListener('click', () => movieInfoDialog.close());
	movieInfoDialog.addEventListener('click', event => {
		if (event.target === movieInfoDialog) movieInfoDialog.close();
	});
	movieInfoDialog.addEventListener('close', () => {
		document.body.classList.remove('modal-open');
		if (movieInfoScrollPosition) {
			window.scrollTo({ ...movieInfoScrollPosition, behavior: 'instant' });
			movieInfoScrollPosition = null;
		}
	});
	movieInfoPoster.addEventListener('click', event => {
		const img = event.target.closest('img');
		if (img) openImageLightbox(img, posterDownloadUrl(movieInfoRegistry.get(movieInfoDialog.dataset.movieId)));
	});
	app.addEventListener('click', event => {
		const trigger = event.target.closest('.movie-info-trigger');
		if (trigger) showMovieInfo(trigger.dataset.movieId);
		const posterTrigger = event.target.closest('.movie-poster-trigger');
		if (posterTrigger && !posterTrigger.disabled) showMovieInfo(posterTrigger.dataset.movieId);
	});

	// Locandina che non si carica: prima l'URL originale (data-fallback), poi il segnaposto.
	// Un solo listener in cattura invece di un onerror inline, che la Content Security Policy blocca.
	document.addEventListener('error', event => {
		const image = event.target;
		if (!(image instanceof HTMLImageElement) || !image.dataset.posterClass) return;
		if (image.dataset.fallback) {
			const fallbackSource = image.dataset.fallback;
			delete image.dataset.fallback;
			image.src = fallbackSource;
			return;
		}
		const placeholder = document.createElement('div');
		placeholder.className = `${image.dataset.posterClass} placeholder`;
		placeholder.setAttribute('aria-hidden', 'true');
		placeholder.textContent = 'C';
		image.replaceWith(placeholder);
	}, true);

	return { infoButton, titleWithInfo };
}
