// Ricerca dei titoli con l'endpoint pubblico dei suggerimenti di IMDb (PIANO.md, §2 "Servizi esterni").
// Non è un'API ufficiale: niente chiave, ma può cambiare. Risponde con CORS anche all'origine dell'app
// (https://localhost nell'APK), quindi basta un fetch normale.
import { contentType } from './domain.js';

export const IMDB_SUGGESTION_URL = 'https://v2.sg.media-imdb.com/suggestion';
const MAX_RESULTS = 10;

export function imdbSearchUrl(query) {
	const cleaned = String(query || '').trim().toLocaleLowerCase('it').replace(/\s+/g, ' ');
	const first = /^[a-z0-9]/.test(cleaned) ? cleaned[0] : 'x';
	return `${IMDB_SUGGESTION_URL}/${first}/${encodeURIComponent(cleaned)}.json`;
}

// Un risultato IMDb ({ id, l, y, qid, s, i: { imageUrl } }) nel formato dei titoli dell'app.
// Restano fuori persone, franchise e pagine (id che non iniziano con "tt").
export function parseImdbResults(payload) {
	return (Array.isArray(payload?.d) ? payload.d : [])
		.filter(item => /^tt[0-9]{1,20}$/.test(item?.id || '') && item.l)
		.slice(0, MAX_RESULTS)
		.map(item => ({
			id: item.id,
			title: String(item.l),
			year: item.y ? String(item.y) : '',
			type: contentType(item),
			poster: /^https:\/\//.test(item.i?.imageUrl || '') ? item.i.imageUrl : '',
			stars: item.s ? String(item.s) : ''
		}));
}

export async function searchImdb(query, { fetchImpl = globalThis.fetch, signal } = {}) {
	if (!String(query || '').trim()) return [];
	let response;
	try {
		response = await fetchImpl(imdbSearchUrl(query), { signal, headers: { Accept: 'application/json' } });
	} catch (error) {
		if (error?.name === 'AbortError') throw error;
		const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
		throw new Error(offline ? 'Sei offline: per cercare un titolo serve la connessione.' : 'IMDb non risponde. Controlla la connessione e riprova.');
	}
	if (!response.ok) throw new Error(`La ricerca di IMDb non è disponibile in questo momento (HTTP ${response.status}).`);
	try {
		return parseImdbResults(await response.json());
	} catch {
		throw new Error('IMDb ha risposto in un formato inatteso: la ricerca potrebbe essere cambiata.');
	}
}
