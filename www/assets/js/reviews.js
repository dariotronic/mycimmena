// Recensioni dei film in archivio: dialog di lettura e scrittura, riepilogo dei voti, salvataggio ed eliminazione.
// L'editor sta in review-editor.js. Nella Fase 1 l'archivio con le recensioni diventa il Diario (PIANO.md, §6).
import { movieName } from './domain.js';
import { apiRequest } from './api.js';
import { hydrateIcons } from './icons.js';
import { showErrorToast, showToast } from './toasts.js';
import { applyReviewFormat, handleRatingKeydown, handleRatingPointerDown, handleReviewInput, initializeReviewForm, reviewTextLength, updateReviewCounter, updateReviewRating, updateReviewSaveButton } from './review-editor.js';

export function createReviews({ app, getData, viewRenderer, askConfirmation, updateArchiveRows }) {
	const reviewsDialog = document.getElementById('reviews-dialog');
	const reviewsDialogClose = document.getElementById('reviews-dialog-close');
	const reviewsDialogTitle = document.getElementById('reviews-dialog-title');
	const reviewsDialogBody = document.getElementById('reviews-dialog-body');
	let activeReviewMovieId = null;
	const reviewCache = new Map();

	reviewsDialogClose.addEventListener('click', () => reviewsDialog.close());
	// Mentre si scrive o modifica una recensione il dialog si chiude solo con "Annulla" (o salvando):
	// niente chiusura cliccando fuori, con Esc o con la X, per non perdere il testo per sbaglio.
	const editingInDialog = () => Boolean(reviewsDialogBody.querySelector('[data-review-form]'));
	reviewsDialog.addEventListener('click', event => {
		if (event.target === reviewsDialog && !editingInDialog()) reviewsDialog.close();
	});
	reviewsDialog.addEventListener('keydown', event => {
		if (event.key === 'Escape' && editingInDialog()) event.preventDefault();
	});
	reviewsDialog.addEventListener('cancel', event => {
		if (editingInDialog()) event.preventDefault();
	});
	reviewsDialog.addEventListener('close', () => {
		document.body.classList.remove('modal-open');
		const state = activeReviewMovieId ? reviewCache.get(activeReviewMovieId) : null;
		if (state) {
			state.expanded = false;
			state.editing = false;
		}
		if (activeReviewMovieId) {
			const movieId = activeReviewMovieId;
			activeReviewMovieId = null;
			updateReviewSummary(movieId, {
				review_count: findArchivedMovie(movieId)?.review_count || 0,
				average_rating: findArchivedMovie(movieId)?.average_rating ?? null
			});
		}
	});
	app.addEventListener('click', handleReviewClick);
	app.addEventListener('submit', handleReviewSubmit);
	app.addEventListener('input', handleReviewInput);
	app.addEventListener('pointerdown', handleRatingPointerDown);
	app.addEventListener('keydown', handleRatingKeydown);
	app.addEventListener('mousedown', event => {
		if (event.target.closest('[data-review-format]')) event.preventDefault();
	});
	reviewsDialog.addEventListener('click', handleReviewClick);
	reviewsDialog.addEventListener('submit', handleReviewSubmit);
	reviewsDialog.addEventListener('input', handleReviewInput);
	reviewsDialog.addEventListener('pointerdown', handleRatingPointerDown);
	reviewsDialog.addEventListener('keydown', handleRatingKeydown);
	reviewsDialog.addEventListener('mousedown', event => {
		if (event.target.closest('[data-review-format]')) event.preventDefault();
	});

	function renderReviewPanel(movieId) {
		const panel = document.getElementById(`review-panel-${movieId}`);
		if (!panel) return;
		panel.innerHTML = viewRenderer.renderArchiveReviews(movieId);
		hydrateIcons(panel);
		const form = panel.querySelector('[data-review-form]');
		if (form) {
			updateReviewRating(form);
			initializeReviewForm(form);
			updateReviewCounter(form);
		}
	}

	function findArchivedMovie(movieId) {
		return getData().archive.flatMap(entry => entry.movies || []).find(movie => movie.id === movieId) || null;
	}

	function renderReviewsDialog(movieId) {
		const movie = findArchivedMovie(movieId);
		if (!movie) return;
		reviewsDialogTitle.textContent = `Recensioni · ${movieName(movie)}`;
		reviewsDialogBody.innerHTML = viewRenderer.renderArchiveReviews(movieId, { dialog: true });
		hydrateIcons(reviewsDialogBody);
		const form = reviewsDialogBody.querySelector('[data-review-form]');
		reviewsDialogClose.hidden = Boolean(form);
		if (form) {
			updateReviewRating(form);
			initializeReviewForm(form);
			updateReviewCounter(form);
		}
	}

	// `mine` (facoltativo) dice se ora il film ha la recensione dell'utente: aggiorna l'icona aggiungi/matita.
	function updateReviewSummary(movieId, summary, mine) {
		const movie = findArchivedMovie(movieId);
		if (!movie) return;
		const hadReviews = Number(movie.review_count) > 0;
		movie.review_count = Number(summary.review_count) || 0;
		movie.average_rating = summary.average_rating === null ? null : Number(summary.average_rating);
		const mineChanged = mine !== undefined && movie.my_review !== mine;
		if (mine !== undefined) movie.my_review = mine;
		// Prima recensione o ultima eliminata: il riepilogo diventa (o smette di essere) cliccabile e
		// compare (o sparisce) il pulsante per leggerle, quindi si ridisegnano le righe dell'archivio.
		if (hadReviews !== movie.review_count > 0) {
			updateArchiveRows();
			return;
		}
		document.querySelectorAll(`[data-review-summary="${CSS.escape(movieId)}"]`).forEach(element => {
			element.innerHTML = viewRenderer.renderReviewSummary(movie);
		});
		if (!mineChanged) return;
		document.querySelectorAll(`[data-review-action="write"][data-movie-id="${CSS.escape(movieId)}"]`).forEach(button => {
			button.outerHTML = viewRenderer.renderReviewWriteButton(movie);
		});
	}

	async function loadMovieReviews(movieId, target = 'inline') {
		const current = reviewCache.get(movieId);
		reviewCache.set(movieId, { expanded: true, loading: true, editing: current?.editing || false });
		if (target === 'dialog') renderReviewsDialog(movieId);
		else renderReviewPanel(movieId);
		try {
			const result = await apiRequest(`api/reviews.php?movieId=${encodeURIComponent(movieId)}`);
			if (!Array.isArray(result.reviews) || (result.mine !== null && typeof result.mine !== 'object')
				|| !Number.isInteger(result.review_count) || (result.average_rating !== null && !Number.isFinite(Number(result.average_rating)))) {
				throw new Error('Il server ha restituito recensioni in un formato non valido.');
			}
			const dialogActive = target !== 'dialog' || (reviewsDialog.open && activeReviewMovieId === movieId);
			reviewCache.set(movieId, {
				expanded: dialogActive,
				loading: false,
				editing: dialogActive && (current?.editing || false),
				reviews: result.reviews,
				mine: result.mine
			});
			updateReviewSummary(movieId, result, Boolean(result.mine));
		} catch (error) {
			const dialogActive = target !== 'dialog' || (reviewsDialog.open && activeReviewMovieId === movieId);
			reviewCache.set(movieId, { expanded: dialogActive, loading: false, editing: false, error: error.message, reviews: [] });
		}
		if (target === 'dialog') {
			if (reviewsDialog.open && activeReviewMovieId === movieId) renderReviewsDialog(movieId);
		} else {
			renderReviewPanel(movieId);
		}
	}

	function openReviewsDialog(movieId, editing = false) {
		activeReviewMovieId = movieId;
		document.body.classList.add('modal-open');
		reviewsDialog.showModal();
		const state = reviewCache.get(movieId) || {};
		state.expanded = true;
		state.editing = editing;
		reviewCache.set(movieId, state);
		updateReviewSummary(movieId, {
			review_count: findArchivedMovie(movieId)?.review_count || 0,
			average_rating: findArchivedMovie(movieId)?.average_rating ?? null
		});
		loadMovieReviews(movieId, 'dialog');
	}

	function closeReviewEditor(movieId) {
		const panel = document.getElementById(`review-panel-${movieId}`);
		if (panel) panel.hidden = true;
		app.querySelectorAll(`.review-toggle[data-movie-id="${CSS.escape(movieId)}"]`).forEach(button => button.setAttribute('aria-expanded', 'false'));
		const state = reviewCache.get(movieId);
		if (state) {
			state.expanded = false;
			state.editing = false;
		}
		if (reviewsDialog.open) reviewsDialog.close();
	}

	async function deleteMovieReview(movieId, button) {
		if (!(await askConfirmation('Sei sicuro di voler eliminare la tua recensione?'))) return;
		button.disabled = true;
		try {
			const result = await apiRequest(`api/reviews.php?movieId=${encodeURIComponent(movieId)}`, { method: 'DELETE' });
			updateReviewSummary(movieId, result, false);
			reviewCache.delete(movieId);
			closeReviewEditor(movieId);
			showToast('reviewDeleted');
		} catch (error) {
			showErrorToast(error);
			button.disabled = false;
		}
	}

	async function handleReviewClick(event) {
		const toggle = event.target.closest('.review-toggle, .review-summary-button');
		if (toggle) {
			const movieId = toggle.dataset.movieId;
			const action = toggle.dataset.reviewAction;
			if (action === 'read') {
				openReviewsDialog(movieId);
				return;
			}
			openReviewsDialog(movieId, true);
			return;
		}

		const edit = event.target.closest('.review-edit');
		if (edit) {
			const state = reviewCache.get(edit.dataset.movieId);
			if (state) {
				state.editing = true;
				if (reviewsDialog.contains(edit)) {
					renderReviewsDialog(edit.dataset.movieId);
					reviewsDialogBody.querySelector('[data-review-editor]')?.focus();
				} else {
					renderReviewPanel(edit.dataset.movieId);
					document.querySelector(`#review-panel-${CSS.escape(edit.dataset.movieId)} [data-review-editor]`)?.focus();
				}
			}
			return;
		}

		const cancel = event.target.closest('.review-cancel');
		if (cancel) {
			const state = reviewCache.get(cancel.dataset.movieId);
			if (state) {
				state.editing = false;
				if (reviewsDialog.contains(cancel)) {
					reviewsDialog.close();
				} else {
					renderReviewPanel(cancel.dataset.movieId);
				}
			}
			return;
		}

		const remove = event.target.closest('.review-delete');
		if (remove) {
			const movieId = remove.dataset.movieId;
			await deleteMovieReview(movieId, remove);
			return;
		}

		const format = event.target.closest('[data-review-format]');
		if (format) applyReviewFormat(format);
	}

	async function handleReviewSubmit(event) {
		const form = event.target.closest('[data-review-form]');
		if (!form) return;
		event.preventDefault();
		const movieId = form.dataset.reviewForm;
		const rating = Number(form.querySelector('input[name="rating"]')?.value || 0);
		const editor = form.querySelector('[data-review-editor]');
		const length = reviewTextLength(editor);
		if (!rating) {
			showErrorToast('Seleziona un voto da mezza spipa a dieci spipe.');
			return;
		}
		if (length > 20000) {
			showErrorToast('La recensione supera il limite di 20.000 caratteri.');
			return;
		}

		const submit = form.querySelector('button[type="submit"]');
		updateReviewSaveButton(form);
		if (submit.disabled) return;
		submit.disabled = true;
		try {
			const result = await apiRequest('api/reviews.php', {
				method: 'PUT',
				body: JSON.stringify({ movieId, rating, content: editor.innerHTML })
			});
			updateReviewSummary(movieId, result, true);
			reviewCache.delete(movieId);
			closeReviewEditor(movieId);
			showToast('reviewSaved');
		} catch (error) {
			showErrorToast(error);
			updateReviewSaveButton(form);
		}
	}

	return {
		getReviewState: movieId => reviewCache.get(movieId),
		clearReviewCache: () => reviewCache.clear()
	};
}
