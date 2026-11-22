// Hypometro: quanta voglia hai di vedere un titolo della watchlist, da 0 a 5 (PIANO.md, §6). Anche 0 è un voto:
// un titolo non votato ha `mine` null.
// Le emoji si cambiano qui, senza toccare altro. I livelli devono restare 6 (da 0 a 5, li controlla anche store.js);
// `label` non si vede, ma è il testo letto dagli screen reader e mostrato passando il dito o il mouse sull'emoji.
export const HYPE_TITLE = 'Hypometro';
export const HYPE_LEVELS = Object.freeze([
	{ emoji: '😶', label: 'Nessuna voglia' },
	{ emoji: '🥱', label: 'Se proprio capita' },
	{ emoji: '🙂', label: 'Perché no' },
	{ emoji: '😃', label: 'Volentieri' },
	{ emoji: '🤩', label: 'Ci tengo' },
	{ emoji: '🔥', label: 'Non vedo l’ora' }
]);
// Il secchiello resta il simbolo dei punti nelle probabilità del randomizer e nell'icona dell'ordinamento.
export const HYPE_POINTS_EMOJI = '🍿';

export const HYPE_MAX = HYPE_LEVELS.length - 1;
export const hypeLevel = score => HYPE_LEVELS[score] || HYPE_LEVELS[0];

// Voto di un titolo come lo prepara app-data.js (movie.votes): `total` è il voto stesso (0 se non votato),
// `count` 1 se votato, `mine` null se non votato. Ordinamento, filtri e randomizer leggono `total`.
const voteScore = value => (value === null || value === undefined || value === '' || !Number.isInteger(Number(value)) ? null : Number(value));
export const watchlistVotes = movie => ({ total: Number(movie?.votes?.total) || 0, count: Number(movie?.votes?.count) || 0, mine: voteScore(movie?.votes?.mine) });

// Voto in parole, per screen reader e tooltip: "Hypometro: Volentieri (3 su 5)".
export const formatHype = score => (score === null || score === undefined
	? 'Non ancora votato'
	: `${HYPE_TITLE}: ${hypeLevel(score).label} (${score} su ${HYPE_MAX})`);
