// Diario (PIANO.md, §6): ricerca nella lista e dialog per segnare una visione, modificarla o eliminarla.
// Le visioni si salvano con store.js; voto (slider dei gatti) e note usano l'editor delle recensioni del sito.
import { viewingLabel } from './app-data.js';
import { hydrateIcons } from './icons.js';
import { showErrorToast, showToast } from './toasts.js';
import { applyReviewFormat, handleRatingKeydown, handleRatingPointerDown, handleReviewInput, reviewTextLength, updateReviewCounter, updateReviewRating } from './review-editor.js';

// onEpisodeSaved(movieId, before, episodes): dopo la visione nuova di un episodio, per proporre il voto alla stagione o
// alla serie appena finite (series-ui.js).
export function createDiary({ app, store, getData, viewRenderer, askConfirmation, refresh, onEpisodeSaved = async () => {} }) {
	const dialog = document.getElementById('viewing-dialog');
	const dialogTitle = document.getElementById('viewing-dialog-title');
	const dialogBody = document.getElementById('viewing-dialog-body');
	const dialogClose = document.getElementById('viewing-dialog-close');
	let diaryQuery = '';
	// Gruppi di episodi aperti (views.js, episodeGroupRow): restano aperti quando la lista si ridisegna.
	const openGroups = new Set();
	let initialSnapshot = '';
	let scrollPosition = null;

	const findMovie = movieId => getData().movieById?.(movieId) || getData().movies.find(movie => movie.id === movieId)
		|| getData().viewings.find(viewing => viewing.movieId === movieId)?.movie
		|| getData().upcoming?.movies?.find(movie => movie.id === movieId)
		|| null;
	const form = () => dialogBody.querySelector('[data-viewing-form]');
	const snapshot = target => (target ? JSON.stringify([...new FormData(target).entries(), target.querySelector('[data-review-editor]')?.innerHTML || '']) : '');
	const isDirty = () => Boolean(form()) && snapshot(form()) !== initialSnapshot;

	// `movieId` per una visione nuova, `viewingId` per modificarne una esistente. Per le serie `scope` 'season' (con
	// `season`) o 'series' apre il voto a una stagione o a tutta la serie; 'episodes' (con `episode`) la visione di un episodio.
	function openViewingForm({ movieId = null, viewingId = null, scope = null, season = null, episode = null }) {
		const viewing = viewingId ? getData().viewings.find(item => item.id === viewingId) : null;
		const movie = viewing?.movie || findMovie(movieId);
		if (!movie) {
			showErrorToast('Questo titolo non è più tra quelli salvati.');
			return;
		}
		const inWatchlist = getData().movies.some(item => item.id === movie.id);
		dialogTitle.textContent = viewing ? 'Modifica la visione' : scope && scope !== 'episodes' ? 'Il tuo voto' : 'Segna come visto';
		// Episodi: dove, con chi e (per uno nuovo) la data vengono dall'ultimo episodio della serie compilato a mano.
		const isEpisode = viewing ? viewing.scope === 'episodes' : scope === 'episodes';
		const prefill = isEpisode ? episodePrefill(movie.id, viewing?.id) : null;
		dialogBody.innerHTML = viewRenderer.renderViewingForm({ movie, viewing, inWatchlist, scope, season, episode, prefill });
		hydrateIcons(dialogBody);
		const target = form();
		updateReviewRating(target);
		updateReviewCounter(target);
		syncClearRating(target);
		initialSnapshot = snapshot(target);
		if (!dialog.open) {
			scrollPosition = { left: window.scrollX, top: window.scrollY };
			document.body.classList.add('modal-open');
			dialog.showModal();
		}
		dialog.classList.remove('reading');
		scrollToFirstEmpty(target);
	}

	// L'ultimo episodio della stessa serie con "Dove" o "Con chi" compilati: voto e nota no, restano di ciascuno.
	function episodePrefill(movieId, excludeId = null) {
		const reference = (getData().viewings || [])
			.filter(item => item.movieId === movieId && item.scope === 'episodes' && item.id !== excludeId && (item.place || item.withWhom))
			.sort((first, second) => String(second.updatedAt || '').localeCompare(String(first.updatedAt || '')))[0];
		return reference ? { date: reference.date, place: reference.place || '', withWhom: reference.withWhom || '' } : null;
	}

	// Una visione in sola lettura: data, dove, voto e note per intero. La matita passa al modulo, nella stessa finestra.
	function openViewingRead(viewingId) {
		const viewing = getData().viewings.find(item => item.id === viewingId);
		if (!viewing) return;
		dialogTitle.textContent = 'La visione';
		dialog.classList.add('reading');
		dialogBody.innerHTML = viewRenderer.renderViewingSummary(viewing);
		hydrateIcons(dialogBody);
		initialSnapshot = '';
		if (!dialog.open) {
			scrollPosition = { left: window.scrollX, top: window.scrollY };
			document.body.classList.add('modal-open');
			dialog.showModal();
		}
	}

	// All'apertura del modulo: nessun campo col focus (niente tastiera), e la finestra scorre fino al primo campo
	// ancora vuoto, che può essere anche il voto o le note.
	function scrollToFirstEmpty(target) {
		document.activeElement?.blur?.();
		const fields = [
			[target.querySelector('input[name="date"]'), element => !element.value],
			[target.querySelector('input[name="place"]'), element => !element.value.trim()],
			[target.querySelector('input[name="withWhom"]'), element => !element.value.trim()],
			[target.querySelector('.review-rating'), () => !target.querySelector('input[name="rating"]').value],
			[target.querySelector('.review-editor-wrap'), () => !reviewTextLength(target.querySelector('[data-review-editor]'))]
		];
		const empty = fields.find(([element, isEmpty]) => element && isEmpty(element))?.[0];
		dialog.scrollTop = 0;
		if (empty) window.requestAnimationFrame(() => empty.scrollIntoView({ block: 'center', behavior: 'instant' }));
	}

	function syncClearRating(target) {
		const button = target?.querySelector('.viewing-clear-rating');
		if (button) button.hidden = !target.querySelector('input[name="rating"]').value;
	}

	async function closeDialog({ confirm = true } = {}) {
		if (confirm && isDirty() && !(await askConfirmation('Chiudere senza salvare? Le modifiche andranno perse.'))) return;
		initialSnapshot = '';
		dialog.close();
	}

	async function saveViewing(target) {
		const data = new FormData(target);
		const editor = target.querySelector('[data-review-editor]');
		if (reviewTextLength(editor) > 20000) {
			showErrorToast('Le note superano il limite di 20.000 caratteri.');
			return;
		}
		const input = {
			movieId: target.dataset.reviewForm,
			date: String(data.get('date') || ''),
			place: String(data.get('place') || ''),
			withWhom: String(data.get('withWhom') || ''),
			rating: String(data.get('rating') || ''),
			notes: editor.innerHTML,
			...(target.dataset.scope ? { scope: target.dataset.scope, season: target.dataset.season ? Number(target.dataset.season) : null } : {})
		};
		const episodes = target.dataset.episode ? [target.dataset.episode.split('-').map(Number)].map(([s, e]) => ({ s, e })) : [];
		if (episodes.length) input.episodes = episodes;
		const before = episodes.length ? getData().seriesOf(input.movieId) : null;
		const submit = target.querySelector('button[type="submit"]');
		submit.disabled = true;
		try {
			if (target.dataset.viewingId) {
				await store.updateViewing(target.dataset.viewingId, input);
				showToast('viewingUpdated');
			} else {
				const removeFromWatchlist = data.get('removeFromWatchlist') === 'on';
				if (input.scope) input.round = getData().seriesOf?.(input.movieId)?.round || 1;
				await store.addViewing(input, { removeFromWatchlist });
				if (episodes.length) showToast('episodesMarked', { label: viewingLabel({ scope: 'episodes', episodes }, before.seasons) });
				else if (input.scope) showToast('seriesRated');
				else showToast('viewingSaved', { removed: removeFromWatchlist });
			}
			await closeDialog({ confirm: false });
			await refresh();
			if (episodes.length) await onEpisodeSaved(input.movieId, before, episodes);
		} catch (error) {
			showErrorToast(error);
			submit.disabled = false;
		}
	}

	async function deleteViewing(target) {
		const question = target.querySelector('.viewing-delete')?.dataset.confirm || 'Eliminare questa visione dal diario?';
		if (!(await askConfirmation(question))) return;
		try {
			await store.deleteViewing(target.dataset.viewingId);
			await closeDialog({ confirm: false });
			showToast('viewingDeleted');
			await refresh();
		} catch (error) {
			showErrorToast(error);
		}
	}

	dialog.addEventListener('submit', event => {
		const target = event.target.closest('[data-viewing-form]');
		if (!target) return;
		event.preventDefault();
		saveViewing(target);
	});
	dialog.addEventListener('click', event => {
		if (event.target === dialog) return; // il tocco fuori non chiude: si perderebbe quello che si sta scrivendo
		const target = form();
		const summaryEdit = event.target.closest('.viewing-summary-edit');
		if (summaryEdit) return void openViewingForm({ viewingId: summaryEdit.dataset.viewingId });
		if (event.target.closest('.viewing-cancel')) closeDialog();
		else if (event.target.closest('.viewing-delete')) deleteViewing(target);
		else if (event.target.closest('.viewing-clear-rating')) {
			target.querySelector('input[name="rating"]').value = '';
			updateReviewRating(target);
			syncClearRating(target);
		} else {
			const format = event.target.closest('[data-review-format]');
			if (format) applyReviewFormat(format);
		}
	});
	dialog.addEventListener('mousedown', event => {
		if (event.target.closest('[data-review-format]')) event.preventDefault();
	});
	dialog.addEventListener('input', handleReviewInput);
	dialog.addEventListener('pointerdown', handleRatingPointerDown);
	dialog.addEventListener('keydown', handleRatingKeydown);
	// Il voto cambia con lo slider senza eventi propri: "Togli il voto" si aggiorna a fine gesto.
	['pointerup', 'pointercancel', 'keyup'].forEach(type => dialog.addEventListener(type, () => syncClearRating(form())));
	// Esc, tasto Indietro di Android: con modifiche non salvate si chiede prima di chiudere.
	dialog.addEventListener('cancel', event => {
		event.preventDefault();
		closeDialog();
	});
	dialogClose.addEventListener('click', () => closeDialog());
	dialog.addEventListener('close', () => {
		dialogBody.innerHTML = '';
		document.body.classList.remove('modal-open');
		if (scrollPosition) {
			window.scrollTo({ ...scrollPosition, behavior: 'instant' });
			scrollPosition = null;
		}
	});

	function updateDiaryRows() {
		const list = document.getElementById('diary-rows');
		if (!list) return;
		list.innerHTML = viewRenderer.renderDiaryRows();
		hydrateIcons(list);
	}

	// "Segna come visto" (watchlist, scheda del titolo) e "modifica" (diario, "I miei voti"): un solo ascoltatore
	// sull'app, così funziona anche sulle righe ridisegnate.
	app.addEventListener('click', event => {
		const mark = event.target.closest('.mark-seen');
		if (mark) {
			openViewingForm({ movieId: mark.dataset.movieId });
			return;
		}
		const edit = event.target.closest('.viewing-edit');
		if (edit) openViewingForm({ viewingId: edit.dataset.viewingId });
		const read = event.target.closest('.viewing-read');
		if (read) openViewingRead(read.dataset.viewingId);
		const episode = event.target.closest('.diary-episode-edit');
		if (episode) openOldEpisode(episode.dataset.movieId, episode.dataset.episode);
	});
	// Il tocco sulla locandina dentro l'intestazione del gruppo apre la scheda, senza aprire o chiudere il gruppo.
	app.addEventListener('click', event => {
		if (event.target.closest('.diary-episodes > summary .movie-poster-trigger')) event.preventDefault();
	});
	app.addEventListener('toggle', event => {
		const group = event.target.closest?.('[data-diary-group]');
		if (!group) return;
		if (group.open) openGroups.add(group.dataset.diaryGroup);
		else openGroups.delete(group.dataset.diaryGroup);
	}, true);

	// Episodio dentro una visione di più episodi (fino alla 0.5): diventa una visione sua, poi si apre.
	async function openOldEpisode(movieId, key) {
		const [s, e] = String(key).split('-').map(Number);
		try {
			const viewingId = await store.splitEpisode(movieId, { s, e });
			await refresh();
			if (viewingId) openViewingForm({ viewingId });
		} catch (error) {
			showErrorToast(error);
		}
	}

	function bind() {
		document.getElementById('diary-search-form')?.addEventListener('submit', event => event.preventDefault());
		document.getElementById('diary-query')?.addEventListener('input', event => {
			diaryQuery = event.target.value;
			updateDiaryRows();
		});
	}

	return { openViewingRead, getDiaryQuery: () => diaryQuery, getDiaryOpenGroups: () => openGroups, openViewingForm, updateDiaryRows, bind };
}
