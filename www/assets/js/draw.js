// Estrazione del Randomizer: filtri, pesi, probabilità e scelta del film. Niente DOM, così si può testare da solo.
import { contentType } from './domain.js';
import { watchlistVotes } from './hype.js';

export const DEFAULT_DRAW_FILTERS = Object.freeze({ type: '', minVotes: 0 });

// Estrazione pesata con l'Hypometro: ogni film ha una pallina più una per ogni punto 🍿, quindi anche un film
// senza voti (o votato 0) può uscire, solo meno spesso. Senza peso tutti i film hanno una pallina.
export const drawWeight = (movie, weighted) => (weighted ? 1 + Math.max(0, watchlistVotes(movie).total) : 1);

// Film in gioco: quelli selezionabili che passano i filtri e non sono stati esclusi.
export function drawPool(movies, { filters = DEFAULT_DRAW_FILTERS, excluded = new Set() } = {}) {
	const minVotes = Number(filters.minVotes) || 0;
	return movies.filter(movie => !excluded.has(movie.id)
		&& (!filters.type || contentType(movie) === filters.type)
		&& watchlistVotes(movie).total >= minVotes);
}

// Probabilità di ogni film, dalla più alta (a parità, per titolo).
export function drawChances(pool, weighted) {
	const weights = pool.map(movie => drawWeight(movie, weighted));
	const sum = weights.reduce((total, weight) => total + weight, 0);
	return pool
		.map((movie, index) => ({ movie, weight: weights[index], chance: sum ? weights[index] / sum : 0 }))
		.sort((first, second) => second.chance - first.chance
			|| String(first.movie.title).localeCompare(String(second.movie.title), 'it', { sensitivity: 'base' }));
}

// Sceglie un film del gruppo in proporzione al suo peso. `random` è sostituibile nei test.
export function drawMovie(pool, weighted, random = Math.random) {
	if (!pool.length) return null;
	const weights = pool.map(movie => drawWeight(movie, weighted));
	let ticket = random() * weights.reduce((total, weight) => total + weight, 0);
	for (let index = 0; index < pool.length; index += 1) {
		ticket -= weights[index];
		if (ticket < 0) return pool[index];
	}
	return pool[pool.length - 1];
}

// "12%", "0,8%": un decimale solo sotto l'1%.
export const formatChance = chance => `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: chance > 0 && chance < 0.01 ? 1 : 0 }).format(chance * 100)}%`;
