// Modello dati delle viste: da quello che c'è in store.js all'oggetto `data` che le viste leggono
// (sul sito era la risposta del server). Niente DOM, così si testa da solo.
import { detailModeOf } from './details.js';
import { episodeDetails, episodeTitle, formatEpisodes, nextEpisode, progress, watchedEpisodes } from './series.js';

// Un titolo del catalogo nel formato delle viste: `poster` è l'URL di IMDb, `poster_local` la copia sul telefono.
// I dettagli (regista, trama…) arrivano da OMDb in modalità completa; in light ci sono gli attori principali di IMDb.
export function viewMovie(movie, posterUrlFor = () => '') {
	if (!movie) return null;
	const details = movie.details || {};
	return {
		id: movie.id,
		title: movie.title,
		year: movie.year || '',
		type: movie.type || details.type || '',
		poster: movie.posterUrl || '',
		poster_local: posterUrlFor(movie.id) || '',
		stars: movie.stars || '',
		director: details.director || null,
		writer: details.writer || null,
		actors_full: details.actors || null,
		plot: details.plot || null,
		runtime: details.runtime || null,
		genre: details.genre || null,
		awards: details.awards || null,
		imdb_rating: details.imdbRating || null,
		box_office: details.boxOffice || null,
		has_details: Boolean(movie.details),
		seasons: movie.seasons || null
	};
}

const byDateDesc = (first, second) => (second.date || '').localeCompare(first.date || '') || (second.createdAt || '').localeCompare(first.createdAt || '');

// Avanzamento di una serie: giro corrente, episodi visti, prossimo episodio e quanti ne mancano.
export function seriesProgress(state, movieId) {
	const record = state?.series?.get?.(movieId) || null;
	const movie = state?.movies?.get?.(movieId);
	const round = record?.round || 1;
	const watched = watchedEpisodes(state?.viewings || [], movieId, round);
	const seasons = movie?.seasons || null;
	const next = seasons ? nextEpisode(seasons, watched) : null;
	return {
		status: record?.status || null,
		// Nota generale sulla serie (HTML filtrato), dalla scheda della serie.
		notes: record?.notes || '',
		// Voti dati alle stagioni nel giro corrente: n → visione (scope 'season').
		seasonVotes: new Map((state?.viewings || []).filter(viewing => viewing.movieId === movieId && viewing.scope === 'season' && (viewing.round || 1) === round).map(viewing => [viewing.season, viewing])),
		round,
		startedAt: record?.startedAt || null,
		watched,
		// Data, visione e nota di ogni episodio visto (series.js, episodeDetails).
		episodes: episodeDetails(state?.viewings || [], movieId, round),
		seasons,
		next,
		...(seasons ? progress(seasons, watched) : { seen: watched.size, total: 0, remaining: 0 })
	};
}

// Etichetta di una visione nel diario: per le serie dice cosa si è visto o votato.
export function viewingLabel(viewing, seasons = null) {
	if (viewing.scope === 'episodes') {
		// Un episodio solo (dalla 0.6 è sempre così): anche il titolo, se si conosce.
		const title = viewing.episodes?.length === 1 ? episodeTitle(seasons, viewing.episodes[0]) : '';
		return `${formatEpisodes(viewing.episodes, seasons) || 'Episodi'}${title ? ` «${title}»` : ''}`;
	}
	if (viewing.scope === 'season') return `Stagione ${viewing.season}`;
	if (viewing.scope === 'series') return 'Voto alla serie';
	return '';
}

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
		.map(viewing => {
			const movie = movieFor(viewing.movieId);
			return movie ? { ...viewing, movie, label: viewingLabel(viewing, movie.seasons) } : null;
		})
		.filter(Boolean)
		.sort(byDateDesc);
	// "Stai guardando": serie in corso o in pausa, dall'ultima toccata.
	const watching = [...(state?.series?.values?.() || [])]
		.filter(record => ['watching', 'paused'].includes(record.status) && catalog.has(record.movieId))
		.sort((first, second) => (second.updatedAt || '').localeCompare(first.updatedAt || ''))
		.map(record => ({ movie: movieFor(record.movieId), ...seriesProgress(state, record.movieId) }));
	const settings = state?.settings || {};
	return {
		movies,
		upcoming,
		viewings,
		watching,
		profile: state?.profile || {},
		settings,
		mode: detailModeOf(settings),
		onboarding: state?.onboarding || {},
		meta: state?.meta || {},
		// Importazione della watchlist lasciata a metà (watchlist-import.js): solo quanto serve alle Impostazioni.
		importJob: state?.importJob ? { source: state.importJob.source, kind: state.importJob.kind || 'watchlist', total: state.importJob.items?.length || 0 } : null,
		favorite: state?.profile?.favoriteMovieId ? movieFor(state.profile.favoriteMovieId) : null,
		movieById: id => movies.find(movie => movie.id === id) || movieFor(id),
		seriesOf: id => seriesProgress(state, id)
	};
}

// Visioni di un titolo, dalla più recente, con la media dei voti dati (null se nessuno ha un voto).
export function viewingsOf(data, movieId) {
	const list = (data?.viewings || []).filter(viewing => viewing.movieId === movieId);
	const rated = list.filter(viewing => viewing.rating !== null && viewing.rating !== undefined);
	const average = rated.length ? rated.reduce((sum, viewing) => sum + Number(viewing.rating), 0) / rated.length : null;
	return { list, average, ratedCount: rated.length };
}
