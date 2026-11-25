// Serie TV (PIANO.md, §7): struttura delle stagioni, episodi visti, prossimo episodio e formati come "S2·E4–E6".
// Solo funzioni pure, senza DOM né IndexedDB, così si provano da sole.
//
// Struttura (movie.seasons):
//   { source: 'omdb' | 'custom' | 'mixed', list: [{ n, episodes, titles: string[] | null, source: 'omdb' | 'custom' }],
//     omdbTotal: numero di stagioni secondo OMDb o null, updatedAt, checkedAt }
// Episodi: { s, e } con numeri da 1. Le visioni di una serie hanno `episodes` (gli episodi visti in quella sessione),
// `scope` ('episodes', 'season' o 'series': a cosa si riferisce il voto), `season` (per scope 'season') e `round`.

export const MAX_SEASONS = 60;
export const MAX_EPISODES = 500;
export const SERIES_STATUSES = Object.freeze({
	watching: 'In corso',
	paused: 'In pausa',
	finished: 'Completata',
	dropped: 'Abbandonata'
});

export const episodeKey = ({ s, e }) => `${s}-${e}`;
export const parseEpisodeKey = key => {
	const [s, e] = String(key).split('-').map(Number);
	return { s, e };
};
const compareEpisodes = (first, second) => first.s - second.s || first.e - second.e;

// Episodi validi, senza doppioni e in ordine.
export function normalizeEpisodes(list) {
	const seen = new Map();
	for (const item of Array.isArray(list) ? list : []) {
		const s = Number(item?.s);
		const e = Number(item?.e);
		if (Number.isInteger(s) && Number.isInteger(e) && s >= 1 && e >= 1 && s <= MAX_SEASONS && e <= MAX_EPISODES) seen.set(`${s}-${e}`, { s, e });
	}
	return [...seen.values()].sort(compareEpisodes);
}

export const formatEpisode = ({ s, e }) => `S${s}·E${e}`;

// "S2·E4", "S2·E4–E6", "S1·E9–S2·E2" per una sequenza continua; altrimenti i pezzi separati da virgole.
export function formatEpisodes(list, seasons = null) {
	const episodes = normalizeEpisodes(list);
	if (!episodes.length) return '';
	const order = seasons ? allEpisodes(seasons) : null;
	const position = order ? new Map(order.map((item, index) => [episodeKey(item), index])) : null;
	const consecutive = (first, second) => (position && position.has(episodeKey(first)) && position.has(episodeKey(second))
		? position.get(episodeKey(second)) === position.get(episodeKey(first)) + 1
		: first.s === second.s && second.e === first.e + 1);
	const runs = [];
	for (const episode of episodes) {
		const run = runs[runs.length - 1];
		if (run && consecutive(run.end, episode)) run.end = episode;
		else runs.push({ start: episode, end: episode });
	}
	return runs.map(({ start, end }) => {
		if (start === end) return formatEpisode(start);
		return start.s === end.s ? `${formatEpisode(start)}–E${end.e}` : `${formatEpisode(start)}–${formatEpisode(end)}`;
	}).join(', ');
}

// Tutti gli episodi della struttura, in ordine.
export function allEpisodes(seasons) {
	return (seasons?.list || []).flatMap(season => Array.from({ length: season.episodes }, (_, index) => ({ s: season.n, e: index + 1 })));
}
export const totalEpisodes = seasons => (seasons?.list || []).reduce((sum, season) => sum + season.episodes, 0);
export const seasonOf = (seasons, n) => (seasons?.list || []).find(season => season.n === n) || null;
export const episodeTitle = (seasons, { s, e }) => seasonOf(seasons, s)?.titles?.[e - 1] || '';

// Episodi visti nel giro corrente: l'unione degli episodi delle visioni di quel giro.
export function watchedEpisodes(viewings, movieId, round = 1) {
	const watched = new Set();
	for (const viewing of viewings || []) {
		if (viewing.movieId !== movieId || (viewing.round || 1) !== round) continue;
		for (const episode of viewing.episodes || []) watched.add(episodeKey(episode));
	}
	return watched;
}

// Per ogni episodio visto nel giro corrente: quando, la sua visione nel diario e se ha una nota (solo per le visioni di
// un episodio solo). Se per errore un episodio sta in due visioni vale la più recente.
export function episodeDetails(viewings, movieId, round = 1) {
	const details = new Map();
	const sessions = (viewings || [])
		.filter(viewing => viewing.movieId === movieId && (viewing.round || 1) === round && viewing.scope === 'episodes')
		.sort((first, second) => String(first.date).localeCompare(String(second.date)));
	for (const viewing of sessions) {
		for (const episode of viewing.episodes || []) {
			const key = episodeKey(episode);
			details.set(key, { date: viewing.date, viewingId: viewing.id, hasNote: viewing.episodes.length === 1 && Boolean(viewing.notes) });
		}
	}
	return details;
}

export function nextEpisode(seasons, watched) {
	return allEpisodes(seasons).find(episode => !watched.has(episodeKey(episode))) || null;
}

export function seasonProgress(seasons, watched, n) {
	const season = seasonOf(seasons, n);
	if (!season) return { seen: 0, total: 0 };
	let seen = 0;
	for (let e = 1; e <= season.episodes; e += 1) if (watched.has(`${n}-${e}`)) seen += 1;
	return { seen, total: season.episodes };
}

export function progress(seasons, watched) {
	const list = allEpisodes(seasons);
	const seen = list.filter(episode => watched.has(episodeKey(episode))).length;
	return { seen, total: list.length, remaining: list.length - seen };
}

// Episodi da segnare con "Segna fino a qui": quelli prima di `target` (compreso) non ancora visti.
export function episodesUpTo(seasons, watched, target) {
	return allEpisodes(seasons).filter(episode => compareEpisodes(episode, target) <= 0 && !watched.has(episodeKey(episode)));
}

// Stagioni e serie appena completate dagli episodi aggiunti (per proporre il voto).
export function completedBy(seasons, watchedBefore, added) {
	const after = new Set([...watchedBefore, ...added.map(episodeKey)]);
	const touched = [...new Set(added.map(episode => episode.s))];
	const seasonsDone = touched.filter(n => {
		const { seen, total } = seasonProgress(seasons, after, n);
		return total > 0 && seen === total && seasonProgress(seasons, watchedBefore, n).seen < total;
	});
	const { total, remaining } = progress(seasons, after);
	const seriesDone = total > 0 && remaining === 0 && progress(seasons, watchedBefore).remaining > 0;
	return { seasons: seasonsDone, series: seriesDone };
}

// Struttura da OMDb: `omdbTotal` stagioni, di cui alcune già scaricate (n → titoli degli episodi). Le stagioni non
// ancora scaricate hanno 0 episodi finché non si aprono.
export function structureFromOmdb(omdbTotal, fetchedSeasons = {}, now = new Date().toISOString()) {
	const count = Math.min(MAX_SEASONS, Math.max(0, Number(omdbTotal) || 0));
	return {
		source: 'omdb',
		list: Array.from({ length: count }, (_, index) => {
			const titles = fetchedSeasons[index + 1] || null;
			return { n: index + 1, episodes: titles ? Math.min(MAX_EPISODES, titles.length) : 0, titles, source: 'omdb' };
		}),
		omdbTotal: count || null,
		updatedAt: now,
		checkedAt: now
	};
}

// Una stagione scaricata da OMDb entra nella struttura, se quella stagione non è stata scritta a mano.
export function withOmdbSeason(seasons, n, titles, now = new Date().toISOString()) {
	const list = [...(seasons?.list || [])];
	const index = list.findIndex(season => season.n === n);
	if (index >= 0 && list[index].source === 'custom') return seasons;
	const season = { n, episodes: Math.min(MAX_EPISODES, titles.length), titles: titles.slice(0, MAX_EPISODES), source: 'omdb' };
	if (index >= 0) list[index] = season;
	else list.push(season);
	list.sort((first, second) => first.n - second.n);
	return { ...seasons, source: seasons?.source || 'omdb', list, updatedAt: now };
}

// Stagioni di OMDb non ancora scaricate (0 episodi): da chiedere quando servono.
export const missingOmdbSeasons = seasons => (seasons?.list || []).filter(season => season.source === 'omdb' && !season.titles).map(season => season.n);

// Struttura scritta a mano (editor "La struttura non è giusta?"): `counts` è il numero di episodi di ogni stagione,
// in ordine. Le stagioni di OMDb con lo stesso numero di episodi tengono i titoli, e quelle non ancora scaricate (0)
// restano di OMDb, da scaricare quando si aprono; le altre diventano "inserite da te".
export function customStructure(seasons, counts, now = new Date().toISOString()) {
	const clean = counts.slice(0, MAX_SEASONS).map(value => Math.min(MAX_EPISODES, Math.max(0, Math.floor(Number(value) || 0))));
	const list = clean.map((episodes, index) => {
		const previous = seasonOf(seasons, index + 1);
		if (previous?.source === 'omdb' && (previous.titles ? previous.episodes === episodes : episodes === 0)) return previous;
		return { n: index + 1, episodes, titles: null, source: 'custom' };
	});
	const sources = new Set(list.map(season => season.source));
	return {
		source: sources.size > 1 ? 'mixed' : (sources.has('omdb') ? 'omdb' : 'custom'),
		list,
		omdbTotal: seasons?.omdbTotal ?? null,
		updatedAt: now,
		checkedAt: seasons?.checkedAt || null
	};
}

// Episodi visti che non esisterebbero più con la nuova struttura (l'editor avvisa prima di salvare).
export function lostEpisodes(watched, seasons) {
	const valid = new Set(allEpisodes(seasons).map(episodeKey));
	return [...watched].filter(key => !valid.has(key)).map(parseEpisodeKey).sort(compareEpisodes);
}
