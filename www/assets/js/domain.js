export const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, character => ({
	'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export const movieName = movie => `${movie.title}${movie.year ? ` (${movie.year})` : ''}`;

export const contentType = movie => {
	if (['movie', 'series', 'episode'].includes(movie.type)) return movie.type;
	return ({ tvSeries: 'series', tvMiniSeries: 'series', tvEpisode: 'episode', movie: 'movie', feature: 'movie', tvMovie: 'movie', short: 'movie', tvShort: 'movie', video: 'movie' })[movie.qid] || '';
};

export const meetingMovies =meeting => Array.isArray(meeting?.movies) ? meeting.movies : [];

export const today = (now = new Date()) => {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'
	}).formatToParts(now);
	const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
};

// Voto di una recensione in parole: "7 spipe su 10", "7 spipe e ½ su 10", al singolare con un gatto ("1 spipa e ½ su 10", "½ spipa su 10").
export const formatSpipe = rating => {
	const value = Number(rating);
	const whole = Math.floor(value);
	const half = value - whole >= 0.5;
	if (!whole) return '½ spipa su 10';
	return `${whole} ${whole === 1 ? 'spipa' : 'spipe'}${half ? ' e ½' : ''} su 10`;
};

// Stato del gatto in posizione `index` (0-9) per un voto da 0 a 10 a mezzi punti.
export const catState = (rating, index) => {
	const value = Number(rating) || 0;
	return value >= index + 1 ? 'full' : value >= index + 0.5 ? 'half' : 'empty';
};

// Data ISO (AAAA-MM-GG) in italiano, es. "3 novembre 2026"; un valore non valido resta com'è.
export function formatDate(value) {
	if (!value) return '';
	const date = new Date(`${value}T12:00:00`);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat('it-IT', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		}).format(date);
}
