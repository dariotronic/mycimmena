// Modello dati delle viste: da quello che c'è in store.js all'oggetto `data` che le viste leggono
// (sul sito era la risposta del server). Niente DOM, così si testa da solo.

// Un titolo del catalogo nel formato delle viste: `poster` è l'URL di IMDb, `poster_local` la copia sul telefono.
// I campi dei dettagli (regista, trama…) arrivano da OMDb nella Fase 2; ora ci sono gli attori principali di IMDb.
export function viewMovie(movie, posterUrlFor = () => '') {
	if (!movie) return null;
	const details = movie.details || {};
	return {
		id: movie.id,
		title: movie.title,
		year: movie.year || '',
		type: movie.type || '',
		poster: movie.posterUrl || '',
		poster_local: posterUrlFor(movie.id) || '',
		stars: movie.stars || '',
		director: details.director || null,
		actors_full: details.actors || null,
		plot: details.plot || null,
		runtime: details.runtime || null,
		genre: details.genre || null,
		awards: details.awards || null,
		imdb_rating: details.imdbRating || null,
		box_office: details.boxOffice || null
	};
}

const byDateDesc = (first, second) => (second.date || '').localeCompare(first.date || '') || (second.createdAt || '').localeCompare(first.createdAt || '');

export function buildAppData(state, { posterUrlFor = () => '' } = {}) {
	const catalog = state?.movies instanceof Map ? state.movies : new Map();
	const movieFor = id => viewMovie(catalog.get(id), posterUrlFor);
	// Watchlist: l'Hypometro è personale (0–5, null se non votato). `votes` resta nel formato che leggono
	// ordinamento, filtri e randomizer: il totale è il voto stesso.
	const movies = (state?.watchlist || []).map(entry => {
		const movie = movieFor(entry.movieId);
		if (!movie) return null;
		const hype = entry.hype ?? null;
		return { ...movie, added_at: entry.addedAt, hype, votes: { total: hype ?? 0, count: hype === null ? 0 : 1, mine: hype } };
	}).filter(Boolean);
	const planned = state?.planned;
	const upcoming = planned ? {
		date: planned.date || null,
		place: planned.place || null,
		movies: (planned.movieIds || []).map(id => movies.find(movie => movie.id === id) || movieFor(id)).filter(Boolean)
	} : null;
	const viewings = (state?.viewings || [])
		.map(viewing => ({ ...viewing, movie: movieFor(viewing.movieId) }))
		.filter(viewing => viewing.movie)
		.sort(byDateDesc);
	return { movies, upcoming, viewings };
}

// Visioni di un titolo, dalla più recente, con la media dei voti dati (null se nessuno ha un voto).
export function viewingsOf(data, movieId) {
	const list = (data?.viewings || []).filter(viewing => viewing.movieId === movieId);
	const rated = list.filter(viewing => viewing.rating !== null && viewing.rating !== undefined);
	const average = rated.length ? rated.reduce((sum, viewing) => sum + Number(viewing.rating), 0) / rated.length : null;
	return { list, average, ratedCount: rated.length };
}
