// Serata in programma (PIANO.md, §6): salvataggio, titoli aggiunti o tolti, serata conclusa ("Com'è andata?") e
// cancellazione. Tutto sul telefono con store.js; dopo ogni modifica si rileggono i dati (loadData) e si ridisegna.
import { meetingMovies, today } from './domain.js';
import { hydrateIcons } from './icons.js';
import { showErrorToast, showToast } from './toasts.js';

// renderMeetingForm: il modulo della finestra (views.js). onPlannedSaved: dopo il salvataggio di una serata (per chiedere il permesso delle notifiche, notifications.js).
export function createMeeting({ store, getData, render, loadData, askConfirmation, runUndoable, flushUndoable, clearSelectedMovie, renderMeetingForm, onPlannedSaved = () => {} }) {
	const scheduledMovieIds = () => new Set(meetingMovies(getData().upcoming).map(movie => movie.id));
	const selectableMovies = () => {
		const scheduled = scheduledMovieIds();
		return getData().movies.filter(movie => !scheduled.has(movie.id));
	};

	// Finestra della serata (matita in Home): data, luogo e titoli, salvati insieme.
	const dialog = document.getElementById('meeting-dialog');
	const dialogBody = document.getElementById('meeting-dialog-body');
	function openEditor() {
		dialogBody.innerHTML = renderMeetingForm();
		hydrateIcons(dialogBody);
		if (!dialog.open) dialog.showModal();
	}
	dialog.addEventListener('submit', event => {
		if (event.target.id === 'calendar-form') saveMeeting(event);
	});
	dialog.addEventListener('click', event => {
		const remove = event.target.closest('[data-meeting-remove]');
		if (remove) {
			const list = remove.closest('.calendar-film-list');
			remove.closest('[data-meeting-movie]').remove();
			if (list && !list.children.length) list.innerHTML = '<p class="help-text">Nessun titolo in programma.</p>';
			return;
		}
		if (event.target.closest('[data-meeting-cancel]')) dialog.close();
		else if (event.target.closest('[data-meeting-clear]')) clearMeeting();
	});
	document.getElementById('meeting-dialog-close').addEventListener('click', () => dialog.close());
	dialog.addEventListener('close', () => {
		dialogBody.innerHTML = '';
	});

	async function saveMeeting(event) {
		event.preventDefault();
		const form = new FormData(event.target);
		// Una rimozione ancora annullabile va salvata prima: partendo dopo, riscriverebbe la lista con i valori vecchi.
		await flushUndoable();
		// Data e luogo sono facoltativi: un campo vuoto viene salvato come "da definire".
		const next = {
			date: String(form.get('date') || '') || null,
			place: String(form.get('place') || '').trim() || null,
			movieIds: form.getAll('movieIds')
		};
		try {
			await store.savePlanned(next);
			dialog.close();
			await loadData();
			render();
			showToast('meetingSaved', { past: next.date !== null && next.date < today() });
			onPlannedSaved();
		} catch (error) {
			showErrorToast(error);
		}
	}

	// La serata è andata: i titoli entrano nel diario (con data e luogo della serata) ed escono dalla watchlist.
	async function completeMeeting() {
		const count = meetingMovies(getData().upcoming).length;
		if (!count || !(await askConfirmation(`Segnare la serata come vista? ${count === 1 ? 'Il titolo va' : `I ${count} titoli vanno`} nel diario ed esce${count === 1 ? '' : 'no'} dalla watchlist. Le modifiche non salvate qui sopra non sono incluse.`))) return;
		try {
			await flushUndoable();
			await store.completePlanned(today());
			await loadData();
			render();
			showToast('meetingCompleted', { count });
		} catch (error) {
			showErrorToast(error);
		}
	}

	async function clearMeeting() {
		if (!(await askConfirmation('Cancellare la serata? I titoli restano nella watchlist.'))) return;
		try {
			await flushUndoable();
			await store.clearPlanned();
			if (dialog.open) dialog.close();
			await loadData();
			render();
			showToast('meetingCleared');
		} catch (error) {
			showErrorToast(error);
		}
	}

	async function scheduleMovie(movieId) {
		const movie = getData().movies.find(item => item.id === movieId);
		if (!movie || scheduledMovieIds().has(movieId)) return;
		// Come nel salvataggio: altrimenti un titolo tolto e subito rimesso sparirebbe di nuovo, senza notifica.
		await flushUndoable();
		const upcoming = getData().upcoming;
		try {
			await store.savePlanned({
				date: upcoming?.date || null,
				place: upcoming?.place || null,
				movieIds: [...meetingMovies(upcoming).map(item => item.id), movie.id]
			});
			clearSelectedMovie();
			await loadData();
			render();
			showToast('movieScheduled');
		} catch (error) {
			showErrorToast(error);
		}
	}

	function bind() {
		// In Home: "Non l'abbiamo fatta" della serata passata, "Segna come vista" e la matita (o l'invito a organizzarla).
		document.getElementById('clear-meeting')?.addEventListener('click', clearMeeting);
		document.getElementById('complete-meeting')?.addEventListener('click', completeMeeting);
		document.querySelectorAll('[data-edit-meeting]').forEach(button => button.addEventListener('click', openEditor));
	}

	return { selectableMovies, scheduleMovie, bind, openEditor };
}
