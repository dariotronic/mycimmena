// Hypometro: quanta voglia ha ogni membro di vedere un film della watchlist, da 0 a 5. Anche 0 è un voto:
// chi non ha votato ha `mine` null e non entra nel conteggio dei votanti.
// Le emoji si cambiano qui, senza toccare altro. I livelli devono restare 6 (da 0 a 5, li controlla anche il server);
// `label` non si vede, ma è il testo letto dagli screen reader e mostrato passando il mouse sull'emoji.
export const HYPE_TITLE = 'Hypometro';
export const HYPE_LEVELS = Object.freeze([
	{ emoji: '😶', label: 'Nessuna voglia' },
	{ emoji: '🥱', label: 'Se proprio capita' },
	{ emoji: '🙂', label: 'Perché no' },
	{ emoji: '😃', label: 'Volentieri' },
	{ emoji: '🤩', label: 'Ci tengo' },
	{ emoji: '🔥', label: 'Non vedo l’ora' }
]);
// Emoji al posto delle parole nel totale: "12 🍿 · 4 👥" sta per "12 punti da 4 membri".
export const HYPE_POINTS_EMOJI = '🍿';
export const HYPE_MEMBERS_EMOJI = '👥';

export const HYPE_MAX = HYPE_LEVELS.length - 1;
export const hypeLevel = score => HYPE_LEVELS[score] || HYPE_LEVELS[0];

// Voti di un film come arrivano da api/data.php (movies[].votes): totale e votanti a 0 se mancano,
// `mine` null se l'utente non ha votato (0 è un voto valido).
const voteScore = value => (value === null || value === undefined || value === '' || !Number.isInteger(Number(value)) ? null : Number(value));
export const watchlistVotes = movie => ({ total: Number(movie?.votes?.total) || 0, count: Number(movie?.votes?.count) || 0, mine: voteScore(movie?.votes?.mine) });

// Totale in parole, per screen reader e tooltip: "12 punti da 4 membri", "1 punto da 1 membro".
export const formatVoteTotal = ({ total, count }) => count
	? `${total} ${total === 1 ? 'punto' : 'punti'} da ${count} ${count === 1 ? 'membro' : 'membri'}`
	: 'Nessun voto';
