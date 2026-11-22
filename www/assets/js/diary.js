// Diario (PIANO.md, §6): ricerca nella lista e dialog per segnare una visione, modificarla o eliminarla.
// Le visioni si salvano con store.js; voto (slider dei gatti) e note usano l'editor delle recensioni del sito.
import { hydrateIcons } from './icons.js';
import { showErrorToast, showToast } from './toasts.js';
import { applyReviewFormat, handleRatingKeydown, handleRatingPointerDown, handleReviewInput, reviewTextLength, updateReviewCounter, updateReviewRating } from './review-editor.js';

export function createDiary({ app, store, getData, viewRenderer, askConfirmation, refresh }) {
	const dialog = document.getElementById('viewing-dialog');
	const dialogTitle = document.getElementById('viewing-dialog-title');
	const dialogBody = document.getElementById('viewing-dialog-body');
	const dialogClose = document.getElementById('viewing-dialog-close');
	let diaryQuery = '';
	let initialSnapshot = '';
	let scrollPosition = null;

	const findMovie = movieId => getData().movies.find(movie => movie.id === movieId)
		|| getData().viewings.find(viewing => viewing.movieId === movieId)?.movie
		|| getData().upcoming?.movies?.find(movie => movie.id === movieId)
		|| null;
	const form = () => dialogBody.querySelector('[data-viewing-form]');
	const snapshot = target => (target ? JSON.stringify([...new FormData(target).entries(), target.querySelector('[data-review-editor]')?.innerHTML || '']) : '');
	const isDirty = () => Boolean(form()) && snapshot(form()) !== initialSnapshot;

	// `movieId` per una visione nuova, `viewingId` per modificarne una esistente.
	function openViewingForm({ movieId = null, viewingId = null }) {
		const viewing = viewingId ? getData().viewings.find(item => item.id === viewingId) : null;
		const movie = viewing?.movie || findMovie(movieId);
		if (!movie) {
			showErrorToast('Questo titolo non è più tra quelli salvati.');
			return;
		}
		const inWatchlist = getData().movies.some(item => item.id === movie.id);
		dialogTitle.textContent = viewing ? 'Modifica la visione' : 'Segna come visto';
		dialogBody.innerHTML = viewRenderer.renderViewingForm({ movie, viewing, inWatchlist });
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
		target.querySelector('input[name="date"]')?.focus({ preventScroll: true });
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
			notes: editor.innerHTML
		};
		const submit = target.querySelector('button[type="submit"]');
		submit.disabled = true;
		try {
			if (target.dataset.viewingId) {
				await store.updateViewing(target.dataset.viewingId, input);
				showToast('viewingUpdated');
			} else {
				const removeFromWatchlist = data.get('removeFromWatchlist') === 'on';
				await store.addViewing(input, { removeFromWatchlist });
				showToast('viewingSaved', { removed: removeFromWatchlist });
			}
			await closeDialog({ confirm: false });
			await refresh();
		} catch (error) {
			showErrorToast(error);
			submit.disabled = false;
		}
	}

	async function deleteViewing(target) {
		if (!(await askConfirmation('Eliminare questa visione dal diario?'))) return;
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
	});

	function bind() {
		document.getElementById('diary-search-form')?.addEventListener('submit', event => event.preventDefault());
		document.getElementById('diary-query')?.addEventListener('input', event => {
			diaryQuery = event.target.value;
			updateDiaryRows();
		});
	}

	return { getDiaryQuery: () => diaryQuery, openViewingForm, updateDiaryRows, bind };
}
