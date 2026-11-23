// Statistiche personali (PIANO.md, §6 e Fase 5): visioni per mese e per anno, voti, ore passate davanti allo
// schermo, generi e registi più visti. Solo calcoli sui dati del diario (app-data.js); la vista è in stats-ui.js.
//
// Cosa conta come "visione": una serata con un film o una sessione di episodi. I voti dati a una stagione o a
// una serie intera (scope 'season' | 'series') sono voti, non visioni: entrano solo nella media dei voti.
export const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const TOP = 8;

const isWatch = viewing => !viewing.scope || viewing.scope === 'episodes';
// "117 min" → 117; per le serie OMDb dà la durata di un episodio.
const minutesOf = runtime => {
	const value = Number.parseInt(String(runtime || ''), 10);
	return Number.isFinite(value) && value > 0 && value < 1000 ? value : null;
};
// "Horror, Sci-Fi" → ['Horror', 'Sci-Fi']; per i registi lo stesso con le virgole.
const splitList = value => String(value || '').split(',').map(item => item.trim()).filter(item => item && item !== 'N/A');

// Generi di OMDb in italiano (quelli che non sono qui restano come sono).
export const GENRES_IT = {
	Action: 'Azione', Adventure: 'Avventura', Animation: 'Animazione', Biography: 'Biografico', Comedy: 'Commedia', Crime: 'Crimine',
	Documentary: 'Documentario', Drama: 'Drammatico', Family: 'Famiglia', Fantasy: 'Fantasy', 'Film-Noir': 'Noir', History: 'Storico',
	Horror: 'Horror', Music: 'Musica', Musical: 'Musical', Mystery: 'Mistero', Romance: 'Romantico', 'Sci-Fi': 'Fantascienza',
	Sport: 'Sport', Thriller: 'Thriller', War: 'Guerra', Western: 'Western', Short: 'Corto', 'Talk-Show': 'Talk show', 'Reality-TV': 'Reality', News: 'Notizie', 'Game-Show': 'Quiz'
};

// Anni che compaiono nel diario, dal più recente: per il filtro.
export function statsYears(viewings) {
	return [...new Set((viewings || []).map(viewing => String(viewing.date || '').slice(0, 4)).filter(year => /^\d{4}$/.test(year)))].sort().reverse();
}

const average = values => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
// Media arrotondata a mezza spipa, come i voti.
export const roundHalf = value => (value === null ? null : Math.round(value * 2) / 2);

// Classifica di nomi (generi o registi) per numero di visioni, con il voto medio di quelle votate.
function ranking(entries, limit = TOP) {
	const map = new Map();
	for (const { name, rating } of entries) {
		const item = map.get(name) || { name, count: 0, ratings: [] };
		item.count += 1;
		if (rating !== null && rating !== undefined) item.ratings.push(Number(rating));
		map.set(name, item);
	}
	return [...map.values()]
		.map(item => ({ name: item.name, count: item.count, average: roundHalf(average(item.ratings)) }))
		.sort((first, second) => second.count - first.count || (second.average ?? 0) - (first.average ?? 0) || first.name.localeCompare(second.name, 'it'))
		.slice(0, limit);
}

// year: '' per tutto il diario, oppure '2026'. today: 'AAAA-MM-GG' (per gli ultimi 12 mesi).
export function computeStats(data, { year = '', today }) {
	const all = (data?.viewings || []).filter(viewing => viewing.movie && /^\d{4}-\d{2}-\d{2}$/.test(String(viewing.date || '')));
	const inPeriod = year ? all.filter(viewing => viewing.date.startsWith(year)) : all;
	const watches = inPeriod.filter(isWatch);
	const films = watches.filter(viewing => viewing.movie.type !== 'series');
	const sessions = watches.filter(viewing => viewing.movie.type === 'series');
	const rated = inPeriod.filter(viewing => viewing.rating !== null && viewing.rating !== undefined);

	// Ore: i film con la durata nota (schede complete), più gli episodi per la durata di un episodio della serie.
	let minutes = 0;
	let timedWatches = 0;
	for (const viewing of watches) {
		const runtime = minutesOf(viewing.movie.runtime);
		if (runtime === null) continue;
		const episodes = viewing.movie.type === 'series' ? (viewing.episodes || []).length : 1;
		minutes += runtime * episodes;
		timedWatches += 1;
	}

	// Mesi: dell'anno scelto, oppure gli ultimi 12 fino a oggi.
	const months = [];
	if (year) {
		for (let month = 1; month <= 12; month += 1) months.push(`${year}-${String(month).padStart(2, '0')}`);
	} else {
		const [y, m] = String(today).split('-').map(Number);
		for (let back = 11; back >= 0; back -= 1) {
			const date = new Date(y, m - 1 - back, 1);
			months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
		}
	}
	const perMonth = months.map(key => ({
		key,
		label: MONTHS[Number(key.slice(5)) - 1],
		year: key.slice(0, 4),
		count: (year ? watches : all.filter(isWatch)).filter(viewing => viewing.date.startsWith(key)).length
	}));
	const perYear = statsYears(all).reverse().map(key => ({ key, label: key, count: all.filter(isWatch).filter(viewing => viewing.date.startsWith(key)).length }));

	// Voti: dieci colonne, da 1 a 10 spipe (le mezze vanno con l'intero sopra: 6½ conta come 7).
	const ratingBuckets = Array.from({ length: 10 }, (_, index) => ({ key: String(index + 1), label: String(index + 1), count: 0 }));
	for (const viewing of rated) ratingBuckets[Math.min(9, Math.max(0, Math.ceil(Number(viewing.rating)) - 1))].count += 1;

	const withDetails = watches.filter(viewing => viewing.movie.has_details);
	const genres = ranking(withDetails.flatMap(viewing => splitList(viewing.movie.genre).map(name => ({ name: GENRES_IT[name] || name, rating: viewing.rating }))));
	const directors = ranking(films.filter(viewing => viewing.movie.has_details).flatMap(viewing => splitList(viewing.movie.director).map(name => ({ name, rating: viewing.rating }))));
	const best = [...rated]
		.filter(viewing => isWatch(viewing) || viewing.scope === 'series')
		.sort((first, second) => second.rating - first.rating || second.date.localeCompare(first.date))
		.slice(0, 5);

	// "Il regista che non sbaglia mai" dell'onboarding contro i registi visti davvero.
	const favouriteName = String(data?.profile?.director || '').trim();
	const favouriteKey = favouriteName.toLocaleLowerCase('it');
	const favouriteViewings = favouriteKey ? films.filter(viewing => splitList(viewing.movie.director).some(name => name.toLocaleLowerCase('it') === favouriteKey)) : [];
	const favouriteRatings = favouriteViewings.map(viewing => viewing.rating).filter(value => value !== null && value !== undefined).map(Number);

	return {
		year,
		watches: watches.length,
		films: new Set(films.map(viewing => viewing.movieId)).size,
		filmViewings: films.length,
		rewatches: films.length - new Set(films.map(viewing => viewing.movieId)).size,
		series: new Set(sessions.map(viewing => viewing.movieId)).size,
		episodes: sessions.reduce((sum, viewing) => sum + (viewing.episodes || []).length, 0),
		hours: Math.round(minutes / 60),
		timedWatches,
		rated: rated.length,
		average: roundHalf(average(rated.map(viewing => Number(viewing.rating)))),
		perMonth,
		perYear,
		ratingBuckets,
		genres,
		directors,
		detailsShare: watches.length ? withDetails.length / watches.length : 0,
		best,
		favourite: favouriteName ? { name: favouriteName, count: favouriteViewings.length, films: new Set(favouriteViewings.map(viewing => viewing.movieId)).size, average: roundHalf(average(favouriteRatings)), rank: directors.findIndex(item => item.name.toLocaleLowerCase('it') === favouriteKey) + 1 } : null
	};
}
