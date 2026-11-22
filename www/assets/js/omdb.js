// OMDb con la chiave personale dell'utente (PIANO.md, §2 e §5): dettagli dei titoli, verifica della chiave ed episodi
// delle stagioni. OMDb risponde con CORS aperto, quindi basta un fetch. I dati OMDb sono sotto licenza CC BY-NC 4.0.
export const OMDB_URL = 'https://www.omdbapi.com/';
export const OMDB_SIGNUP_URL = 'https://www.omdbapi.com/apikey.aspx';
// Titolo usato per verificare una chiave nuova: Alien (1979).
export const OMDB_PROBE_ID = 'tt0078748';
// Le chiavi gratuite sono di 8 caratteri esadecimali (es. "a1b2c3d4"): serve solo a riconoscere quella copiata.
export const looksLikeOmdbKey = value => /^[a-f0-9]{8}$/i.test(String(value || '').trim());

// Errore di OMDb con un tipo, per decidere cosa fare: 'invalid' (chiave rifiutata o non attivata), 'limit' (1000 richieste
// al giorno esaurite), 'network' (rete o OMDb irraggiungibili), 'not-found' (titolo o stagione sconosciuti), 'other'.
export class OmdbError extends Error {
	constructor(kind, message) {
		super(message);
		this.name = 'OmdbError';
		this.kind = kind;
	}
}

const MESSAGES = {
	invalid: 'Chiave non valida o non ancora attivata: hai cliccato il link nella mail?',
	limit: 'Hai usato tutte le richieste di oggi a OMDb: si riprende domani.',
	network: 'OMDb non risponde. Controlla la connessione e riprova.',
	offline: 'Sei offline: per scaricare i dettagli serve la connessione.',
	'not-found': 'OMDb non conosce questo titolo.',
	other: 'OMDb ha risposto con un errore.'
};

function classify(message) {
	const text = String(message || '').toLowerCase();
	if (text.includes('invalid api key') || text.includes('no api key') || text.includes('not activated')) return 'invalid';
	if (text.includes('limit')) return 'limit';
	if (text.includes('not found') || text.includes('incorrect imdb id')) return 'not-found';
	return 'other';
}

async function omdbRequest(params, { key, fetchImpl = globalThis.fetch, signal } = {}) {
	const cleanKey = String(key || '').trim();
	if (!cleanKey) throw new OmdbError('invalid', MESSAGES.invalid);
	const url = `${OMDB_URL}?${new URLSearchParams({ ...params, apikey: cleanKey })}`;
	let response;
	try {
		response = await fetchImpl(url, { signal, headers: { Accept: 'application/json' } });
	} catch (error) {
		if (error?.name === 'AbortError') throw error;
		const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
		throw new OmdbError('network', offline ? MESSAGES.offline : MESSAGES.network);
	}
	let payload = null;
	try {
		payload = await response.json();
	} catch {
		throw new OmdbError(response.status === 401 ? 'invalid' : 'other', response.status === 401 ? MESSAGES.invalid : `${MESSAGES.other} (HTTP ${response.status})`);
	}
	if (payload?.Response !== 'True') {
		const kind = classify(payload?.Error) === 'other' && response.status === 401 ? 'invalid' : classify(payload?.Error);
		throw new OmdbError(kind, MESSAGES[kind] || `${MESSAGES.other}: ${payload?.Error || response.status}`);
	}
	return payload;
}

const value = field => (field && field !== 'N/A' ? String(field) : null);

// Risposta di OMDb per un titolo → dettagli salvati in movie.details.
export function normalizeOmdbDetails(payload) {
	const totalSeasons = Number.parseInt(payload?.totalSeasons, 10);
	return {
		director: value(payload?.Director),
		writer: value(payload?.Writer),
		actors: value(payload?.Actors),
		plot: value(payload?.Plot),
		runtime: value(payload?.Runtime),
		genre: value(payload?.Genre),
		awards: value(payload?.Awards),
		imdbRating: value(payload?.imdbRating),
		boxOffice: value(payload?.BoxOffice),
		language: value(payload?.Language),
		country: value(payload?.Country),
		type: ['movie', 'series', 'episode'].includes(payload?.Type) ? payload.Type : null,
		totalSeasons: Number.isInteger(totalSeasons) && totalSeasons > 0 ? totalSeasons : null
	};
}

export async function fetchOmdbDetails(imdbId, options) {
	return normalizeOmdbDetails(await omdbRequest({ i: imdbId, plot: 'full' }, options));
}

// Prova una chiave con una richiesta vera. Restituisce true, oppure lancia un OmdbError ('invalid', 'network', 'limit').
export async function verifyOmdbKey(key, options = {}) {
	await omdbRequest({ i: OMDB_PROBE_ID }, { ...options, key });
	return true;
}

// Titoli degli episodi di una stagione, in ordine; un episodio senza titolo resta "".
// OMDb a volte salta dei numeri: la lunghezza è quella dell'ultimo episodio elencato.
export async function fetchOmdbSeason(imdbId, season, options) {
	const payload = await omdbRequest({ i: imdbId, Season: String(season) }, options);
	const episodes = Array.isArray(payload.Episodes) ? payload.Episodes : [];
	const count = Math.max(0, ...episodes.map(item => Number.parseInt(item.Episode, 10)).filter(Number.isInteger));
	const titles = Array.from({ length: count }, () => '');
	for (const item of episodes) {
		const index = Number.parseInt(item.Episode, 10) - 1;
		if (index >= 0 && index < count) titles[index] = value(item.Title) || '';
	}
	const totalSeasons = Number.parseInt(payload.totalSeasons, 10);
	return { titles, totalSeasons: Number.isInteger(totalSeasons) ? totalSeasons : null };
}
