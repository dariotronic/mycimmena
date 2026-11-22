// Serata in programma (PIANO.md, §6): salvataggio, titoli aggiunti o tolti, serata conclusa ("Com'è andata?") e
// cancellazione. Tutto sul telefono con store.js; dopo ogni modifica si rileggono i dati (loadData) e si ridisegna.
import { meetingMovies, today } from './domain.js';
import { showErrorToast, showToast } from './toasts.js';

export function createMeeting({ store, getData, render, loadData, askConfirmation, runUndoable, flushUndoable, clearSelectedMovie }) {
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
			await store.savePlanned(next);
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
		// Data e luogo del modulo, anche se non ancora salvati: la rimozione li salva insieme alla lista.
		const form = document.getElementById('calendar-form');
		const formData = form ? new FormData(form) : null;
		const date = formData ? String(formData.get('date') || '') || null : meeting.date || null;
		const place = formData ? String(formData.get('place') || '').trim() || null : meeting.place || null;
		const removed = meeting.movies[index];
		runUndoable({
			toastKey: 'movieUnscheduled',
			apply: () => meeting.movies.splice(index, 1),
			revert: () => meeting.movies.splice(Math.min(index, meeting.movies.length), 0, removed),
			commit: () => store.savePlanned({ date, place, movieIds: meeting.movies.map(movie => movie.id) }).then(() => {
				meeting.date = date;
				meeting.place = place;
			})
		});
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
		document.getElementById('calendar-form')?.addEventListener('submit', saveMeeting);
		document.getElementById('clear-meeting')?.addEventListener('click', clearMeeting);
		// Nella Serata il pulsante si chiama ancora archive-meeting come sul sito; in Home complete-meeting.
		document.getElementById('archive-meeting')?.addEventListener('click', completeMeeting);
		document.getElementById('complete-meeting')?.addEventListener('click', completeMeeting);
		document.querySelectorAll('.remove-scheduled-movie').forEach(button => button.addEventListener('click', () => removeScheduledMovie(button.dataset.movieId)));
	}

	return { selectableMovies, scheduleMovie, bind };
}
