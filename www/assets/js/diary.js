// Diario (PIANO.md, §6): ricerca nella lista e dialog per segnare una visione, modificarla o eliminarla.
// Le visioni si salvano con store.js; voto (slider dei gatti) e note usano l'editor delle recensioni del sito.
import { hydrateIcons } from './icons.js';
import { showErrorToast, showToast } from './toasts.js';
import { applyReviewFormat, handleRatingKeydown, handleRatingPointerDown, handleReviewInput, reviewTextLength, updateReviewCounter, updateReviewRating } from './review-editor.js';

// Gli episodi delle serie non hanno un modulo loro: un giorno di episodi si apre con openEpisodeDay (data, dove, con chi).
export function createDiary({ app, store, getData, viewRenderer, askConfirmation, refresh }) {
	const dialog = document.getElementById('viewing-dialog');
	const dialogTitle = document.getElementById('viewing-dialog-title');
	const dialogBody = document.getElementById('viewing-dialog-body');
	const dialogClose = document.getElementById('viewing-dialog-close');
	let diaryQuery = '';
	let initialSnapshot = '';
	let scrollPosition = null;

	const findMovie = movieId => getData().movieById?.(movieId) || getData().movies.find(movie => movie.id === movieId)
		|| getData().viewings.find(viewing => viewing.movieId === movieId)?.movie
		|| getData().upcoming?.movies?.find(movie => movie.id === movieId)
		|| null;
	const form = () => dialogBody.querySelector('[data-viewing-form]');
	const snapshot = target => (target ? JSON.stringify([...new FormData(target).entries(), target.querySelector('[data-review-editor]')?.innerHTML || '']) : '');
	const dayForm = () => dialogBody.querySelector('[data-episode-day-form]');
	const isDirty = () => Boolean(form() || dayForm()) && snapshot(form() || dayForm()) !== initialSnapshot;

	// `movieId` per una visione nuova, `viewingId` per modificarne una esistente.
	function openViewingForm({ movieId = null, viewingId = null }) {
		const viewing = viewingId ? getData().viewings.find(item => item.id === viewingId) : null;
		const movie = viewing?.movie || findMovie(movieId);
		if (!movie) {
			showErrorToast('Questo titolo non è più tra quelli salvati.');
			return;
		}
		// Episodi delle serie: si apre il loro giorno.
		if (viewing?.scope === 'episodes') return void openEpisodeDay({ movieId: viewing.movieId, date: viewing.date });
		const inWatchlist = getData().movies.some(item => item.id === movie.id);
		dialogTitle.textContent = viewing ? 'Modifica la visione' : 'Segna come visto';
		dialogBody.innerHTML = viewRenderer.renderViewingForm({ movie, viewing, inWatchlist });
		hydrateIcons(dialogBody);
		const target = form();
		updateReviewRating(target);
		updateReviewCounter(target);
		syncClearRating(target);
		initialSnapshot = snapshot(target);
		showDialog();
		dialog.classList.remove('reading');
		scrollToFirstEmpty(target);
	}

	function showDialog() {
		if (dialog.open) return;
		scrollPosition = { left: window.scrollX, top: window.scrollY };
		document.body.classList.add('modal-open');
		dialog.showModal();
	}

	// Un giorno di episodi di una serie: data, dove e con chi per tutti, o toglierli dal diario.
	function openEpisodeDay({ movieId, date }) {
		const movie = findMovie(movieId);
		const viewings = (getData().viewings || []).filter(item => item.movieId === movieId && item.scope === 'episodes' && item.date === date);
		if (!movie || !viewings.length) return;
		dialogTitle.textContent = 'Il giorno';
		dialog.classList.remove('reading');
		dialogBody.innerHTML = viewRenderer.renderEpisodeDayForm({ movie, date, viewings });
		hydrateIcons(dialogBody);
		initialSnapshot = snapshot(dayForm());
		showDialog();
		document.activeElement?.blur?.();
		dialog.scrollTop = 0;
	}

	async function saveEpisodeDay(target) {
		const data = new FormData(target);
		const submit = target.querySelector('button[type="submit"]');
		submit.disabled = true;
		try {
			await store.updateEpisodeDay(target.dataset.movieId, target.dataset.date, {
				date: String(data.get('date') || ''),
				place: String(data.get('place') || ''),
				withWhom: String(data.get('withWhom') || '')
			});
			await closeDialog({ confirm: false });
			showToast('viewingUpdated');
			await refresh();
		} catch (error) {
			showErrorToast(error);
			submit.disabled = false;
		}
	}

	async function deleteEpisodeDay(target) {
		const viewings = (getData().viewings || []).filter(item => item.movieId === target.dataset.movieId && item.scope === 'episodes' && item.date === target.dataset.date);
		if (!(await askConfirmation('Togliere dal diario gli episodi di questo giorno? Tornano da vedere.'))) return;
		try {
			for (const viewing of viewings) await store.deleteViewing(viewing.id);
			if (getData().seriesOf(target.dataset.movieId)?.status === 'finished') await store.setSeriesStatus(target.dataset.movieId, 'watching');
			await closeDialog({ confirm: false });
			showToast('viewingDeleted');
			await refresh();
		} catch (error) {
			showErrorToast(error);
		}
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
		// La finestra mette il focus sulla croce: in sola lettura non serve (e si vedrebbe il bordo).
		document.activeElement?.blur?.();
		dialog.scrollTop = 0;
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
		const day = event.target.closest('[data-episode-day-form]');
		if (day) {
			event.preventDefault();
			return void saveEpisodeDay(day);
		}
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
		if (event.target.closest('.episode-day-delete')) return void deleteEpisodeDay(dayForm());
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
		const day = event.target.closest('.diary-day-edit');
		if (day) openEpisodeDay({ movieId: day.dataset.movieId, date: day.dataset.date });
	});

	function bind() {
		document.getElementById('diary-search-form')?.addEventListener('submit', event => event.preventDefault());
		document.getElementById('diary-query')?.addEventListener('input', event => {
			diaryQuery = event.target.value;
			updateDiaryRows();
		});
	}

	return { openViewingRead, getDiaryQuery: () => diaryQuery, openViewingForm, openEpisodeDay, updateDiaryRows, bind };
}
