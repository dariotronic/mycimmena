// Prossimo appuntamento: salvataggio, archiviazione, eliminazione e film in programma aggiunti o tolti.
import { meetingMovies, today } from './domain.js';
import { apiRequest } from './api.js';
import { showErrorToast, showToast } from './toasts.js';

export function createMeeting({ getData, render, loadData, askConfirmation, runUndoable, flushUndoable, clearSelectedMovie }) {
	const scheduledMovieIds = () => new Set(meetingMovies(getData().upcoming).map(movie => movie.id));
	const selectableMovies = () => {
		const scheduled = scheduledMovieIds();
		return getData().movies.filter(movie => !scheduled.has(movie.id));
	};

	async function saveMeeting(event) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		// Una rimozione ancora annullabile va salvata prima: partendo dopo, riscriverebbe la lista con i valori vecchi.
		await flushUndoable();
		// Data e luogo sono facoltativi: un campo vuoto viene salvato come "da definire".
		const next = {
			date: String(form.get('date') || '') || null,
			place: String(form.get('place') || '').trim() || null,
			movieIds: form.getAll('movieIds')
		};
		try {
			await apiRequest('api/meeting.php', { method: 'PUT', body: JSON.stringify(next) });
			await loadData();
			render();
			showToast('meetingSaved', { past: next.date !== null && next.date < today() });
		} catch (error) {
			showErrorToast(error);
		}
	}

	function removeScheduledMovie(movieId) {
		if (!getData().upcoming) return;
		const meeting = getData().upcoming;
		const index = meetingMovies(meeting).findIndex(movie => movie.id === movieId);
		if (index < 0) return;
		// Data e luogo del modulo, anche se non ancora salvati: come prima, la rimozione li salva insieme alla lista.
		const form = document.getElementById('calendar-form');
		const formData = form ? new FormData(form) : null;
		const date = formData ? String(formData.get('date') || '') || null : meeting.date || null;
		const place = formData ? String(formData.get('place') || '').trim() || null : meeting.place || null;
		const removed = meeting.movies[index];
		runUndoable({
			toastKey: 'movieUnscheduled',
			apply: () => meeting.movies.splice(index, 1),
			revert: () => meeting.movies.splice(Math.min(index, meeting.movies.length), 0, removed),
			commit: keepalive => apiRequest('api/meeting.php', {
				method: 'PUT',
				keepalive,
				body: JSON.stringify({ date, place, movieIds: meeting.movies.map(movie => movie.id) })
			}).then(() => {
				meeting.date = date;
				meeting.place = place;
			})
		});
	}

	async function archiveMeeting() {
		if (!(await askConfirmation('Archiviare l’appuntamento salvato e segnare i suoi titoli come visti? Le modifiche non salvate non saranno incluse.'))) return;
		try {
			await apiRequest('api/meeting.php', { method: 'POST' });
			await loadData();
			render();
			showToast('meetingArchived');
		} catch (error) {
			showErrorToast(error);
		}
	}

	async function clearMeeting() {
		if (!(await askConfirmation('Rimuovere il prossimo appuntamento?'))) return;
		try {
			await apiRequest('api/meeting.php', { method: 'DELETE' });
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
		// Come nel salvataggio: altrimenti un film tolto e subito rimesso sparirebbe di nuovo, senza notifica.
		await flushUndoable();
		const scheduledMovies = meetingMovies(getData().upcoming);
		try {
			await apiRequest('api/meeting.php', {
				method: 'PUT',
				body: JSON.stringify({ date: getData().upcoming?.date || null, place: getData().upcoming?.place || null, movieIds: [...scheduledMovies.map(item => item.id), movie.id] })
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
		document.getElementById('calendar-form')?.addEventListener('submit', saveMeeting);
		document.getElementById('clear-meeting')?.addEventListener('click', clearMeeting);
		document.getElementById('archive-meeting')?.addEventListener('click', archiveMeeting);
		document.querySelectorAll('.remove-scheduled-movie').forEach(button => button.addEventListener('click', () => removeScheduledMovie(button.dataset.movieId)));
	}

	return { selectableMovies, scheduleMovie, bind };
}
