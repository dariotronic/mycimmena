// Negozio dati dell'app: tutto quello che l'utente salva sta qui, in IndexedDB, sul telefono (PIANO.md, §2 e §3).
// Le viste non toccano mai IndexedDB: chiamano queste funzioni, che restituiscono promesse.
//
// Store (versione 1 dello schema):
// - movies     catalogo dei titoli conosciuti, per id IMDb: { id, title, year, type, posterUrl, stars, details, detailsFetchedAt }
// - watchlist  { movieId, addedAt, hype (0–5 o null), note }
// - viewings   il diario: { id, movieId, date, place, withWhom, rating (0,5–10 o null), notes (HTML filtrato), createdAt, updatedAt }
// - posters    locandine salvate per vederle offline: { movieId, blob, savedAt }
// - kv         record singoli per chiave: 'planned' (la serata in programma), 'meta', e dalla Fase 2 'profile' e 'settings'
import { sanitizeNotes } from './sanitize.js';

export const DB_NAME = 'mycimmena';
export const SCHEMA_VERSION = 1;

// Migrazioni in ordine: la funzione di indice N porta lo schema dalla versione N alla N+1.
// Per cambiare lo schema si aggiunge una funzione in fondo e si alza SCHEMA_VERSION; quelle vecchie non si toccano.
const MIGRATIONS = [
	db => {
		db.createObjectStore('movies', { keyPath: 'id' });
		db.createObjectStore('watchlist', { keyPath: 'movieId' });
		const viewings = db.createObjectStore('viewings', { keyPath: 'id' });
		viewings.createIndex('movieId', 'movieId');
		viewings.createIndex('date', 'date');
		db.createObjectStore('posters', { keyPath: 'movieId' });
		db.createObjectStore('kv', { keyPath: 'key' });
	}
];

const STORES = ['movies', 'watchlist', 'viewings', 'posters', 'kv'];
const IMDB_ID = /^tt[0-9]{1,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const request = req => new Promise((resolve, reject) => {
	req.onsuccess = () => resolve(req.result);
	req.onerror = () => reject(req.error);
});
const done = tx => new Promise((resolve, reject) => {
	tx.oncomplete = () => resolve();
	tx.onerror = () => reject(tx.error);
	tx.onabort = () => reject(tx.error || new Error('Salvataggio annullato.'));
});

export const newId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const nowIso = () => new Date().toISOString();

// Dati di un titolo da salvare nel catalogo, presi da un risultato di ricerca o da un import: solo i campi noti.
export function normalizeMovie(movie) {
	if (!IMDB_ID.test(String(movie?.id || ''))) throw new Error('Titolo senza un ID IMDb valido.');
	const title = String(movie.title || '').trim();
	if (!title) throw new Error('Titolo senza nome.');
	const year = String(movie.year ?? '').trim();
	return {
		id: movie.id,
		title: title.slice(0, 300),
		year: /^\d{4}/.test(year) ? year.slice(0, 20) : '',
		type: ['movie', 'series', 'episode'].includes(movie.type) ? movie.type : '',
		posterUrl: /^https:\/\//.test(String(movie.posterUrl || movie.poster || '')) ? String(movie.posterUrl || movie.poster) : '',
		stars: String(movie.stars || '').slice(0, 300),
		details: movie.details && typeof movie.details === 'object' ? movie.details : null,
		detailsFetchedAt: movie.detailsFetchedAt || null
	};
}

const validRating = value => (value === null || value === undefined || value === '' ? null
	: (Number.isFinite(Number(value)) && Number(value) >= 0.5 && Number(value) <= 10 && Number(value) * 2 === Math.round(Number(value) * 2) ? Number(value) : undefined));
const validHype = value => (value === null || value === undefined ? null
	: (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 5 ? Number(value) : undefined));
const cleanText = (value, max) => String(value ?? '').trim().slice(0, max) || null;

// Visione pronta da salvare, con i controlli che il server del sito faceva sulle recensioni.
export function normalizeViewing(input, existing = null) {
	const date = String(input.date || '');
	if (!DATE.test(date)) throw new Error('Indica la data della visione.');
	if (!IMDB_ID.test(String(input.movieId || existing?.movieId || ''))) throw new Error('Visione senza un titolo valido.');
	const rating = validRating(input.rating);
	if (rating === undefined) throw new Error('Il voto va da mezza spipa a dieci spipe, a passi di mezza.');
	const notes = sanitizeNotes(String(input.notes || ''));
	if (notes.text.length > 20000) throw new Error('Le note superano il limite di 20.000 caratteri.');
	const stamp = nowIso();
	return {
		id: existing?.id || input.id || newId(),
		movieId: existing?.movieId || input.movieId,
		date,
		place: cleanText(input.place, 120),
		withWhom: cleanText(input.withWhom, 120),
		rating,
		notes: notes.html,
		createdAt: existing?.createdAt || input.createdAt || stamp,
		updatedAt: stamp
	};
}

export function createStore({ indexedDB = globalThis.indexedDB, name = DB_NAME } = {}) {
	let dbPromise = null;

	function open() {
		if (!indexedDB) return Promise.reject(new Error('Questo dispositivo non permette di salvare i dati (IndexedDB non disponibile).'));
		dbPromise ||= new Promise((resolve, reject) => {
			const req = indexedDB.open(name, SCHEMA_VERSION);
			req.onupgradeneeded = event => {
				const db = req.result;
				for (let version = event.oldVersion; version < SCHEMA_VERSION; version += 1) MIGRATIONS[version](db, req.transaction);
			};
			req.onsuccess = () => {
				const db = req.result;
				// Un'altra copia dell'app (per esempio dopo un aggiornamento) chiede uno schema nuovo: si chiude per lasciarla fare.
				db.onversionchange = () => db.close();
				resolve(db);
			};
			req.onerror = () => reject(req.error);
			req.onblocked = () => reject(new Error('Chiudi le altre schede di myCimmena e riprova.'));
		});
		return dbPromise;
	}

	async function transaction(storeNames, mode, work) {
		const db = await open();
		const tx = db.transaction(storeNames, mode);
		// Si ascolta la fine della transazione da subito, per non perdere l'evento se arriva prima del previsto.
		const finished = done(tx);
		const stores = Object.fromEntries([storeNames].flat().map(storeName => [storeName, tx.objectStore(storeName)]));
		let result;
		try {
			result = await work(stores, tx);
		} catch (error) {
			try { tx.abort(); } catch { /* già chiusa */ }
			finished.catch(() => {});
			throw error;
		}
		await finished;
		return result;
	}

	const getKv = (kv, key) => request(kv.get(key)).then(record => record?.value ?? null);
	const putKv = (kv, key, value) => request(kv.put({ key, value }));

	// Tutto quello che serve alle viste, in una lettura sola. Le locandine restano fuori: le carica posters.js.
	async function loadAll() {
		return transaction(['movies', 'watchlist', 'viewings', 'kv'], 'readonly', async ({ movies, watchlist, viewings, kv }) => {
			const [movieList, watchlistEntries, viewingList, planned, meta] = await Promise.all([
				request(movies.getAll()), request(watchlist.getAll()), request(viewings.getAll()), getKv(kv, 'planned'), getKv(kv, 'meta')
			]);
			return { movies: new Map(movieList.map(movie => [movie.id, movie])), watchlist: watchlistEntries, viewings: viewingList, planned, meta };
		});
	}

	// Aggiunge titoli alla watchlist; quelli già presenti si saltano. Restituisce gli id aggiunti davvero.
	async function addToWatchlist(movieList) {
		const items = movieList.map(normalizeMovie);
		return transaction(['movies', 'watchlist'], 'readwrite', async ({ movies, watchlist }) => {
			const added = [];
			for (const movie of items) {
				const known = await request(movies.get(movie.id));
				// I dettagli già scaricati restano: un nuovo risultato di ricerca non li cancella.
				await request(movies.put(known ? { ...known, ...movie, details: known.details || movie.details, detailsFetchedAt: known.detailsFetchedAt || movie.detailsFetchedAt } : movie));
				if (await request(watchlist.get(movie.id))) continue;
				await request(watchlist.put({ movieId: movie.id, addedAt: nowIso(), hype: null, note: null }));
				added.push(movie.id);
			}
			return added;
		});
	}

	async function removeFromWatchlist(movieId) {
		await transaction(['watchlist', 'kv'], 'readwrite', async ({ watchlist, kv }) => {
			await request(watchlist.delete(movieId));
			// Un titolo tolto dalla watchlist esce anche dalla serata in programma.
			const planned = await getKv(kv, 'planned');
			if (planned?.movieIds?.includes(movieId)) await putKv(kv, 'planned', { ...planned, movieIds: planned.movieIds.filter(id => id !== movieId) });
		});
	}

	async function setHype(movieId, hype) {
		const value = validHype(hype);
		if (value === undefined) throw new Error('L’Hypometro va da 0 a 5.');
		return transaction('watchlist', 'readwrite', async ({ watchlist }) => {
			const entry = await request(watchlist.get(movieId));
			if (!entry) throw new Error('Il titolo non è più nella watchlist.');
			await request(watchlist.put({ ...entry, hype: value }));
			return value;
		});
	}

	// Serata in programma: data e luogo facoltativi, titoli presi dalla watchlist in ordine.
	async function savePlanned({ date = null, place = null, movieIds = [] }) {
		if (date !== null && !DATE.test(String(date))) throw new Error('Data della serata non valida.');
		const ids = [...new Set(movieIds)].filter(id => IMDB_ID.test(id));
		return transaction(['watchlist', 'kv'], 'readwrite', async ({ watchlist, kv }) => {
			for (const id of ids) if (!(await request(watchlist.get(id)))) throw new Error('Un titolo della serata non è più nella watchlist.');
			const planned = { date: date || null, place: cleanText(place, 120), movieIds: ids, updatedAt: nowIso() };
			await putKv(kv, 'planned', planned);
			return planned;
		});
	}

	async function clearPlanned() {
		await transaction('kv', 'readwrite', ({ kv }) => request(kv.delete('planned')));
	}

	// Fine della serata: ogni titolo diventa una visione nel diario (senza voto, si aggiunge dopo) ed esce dalla
	// watchlist; la serata si cancella. Tutto in una transazione: o va tutto, o niente.
	async function completePlanned(fallbackDate) {
		return transaction(['watchlist', 'viewings', 'kv'], 'readwrite', async ({ watchlist, viewings, kv }) => {
			const planned = await getKv(kv, 'planned');
			if (!planned) throw new Error('Non c’è una serata in programma.');
			const date = planned.date || fallbackDate;
			const created = [];
			for (const movieId of planned.movieIds) {
				const viewing = normalizeViewing({ movieId, date, place: planned.place });
				await request(viewings.put(viewing));
				await request(watchlist.delete(movieId));
				created.push(viewing);
			}
			await request(kv.delete('planned'));
			return created;
		});
	}

	// Nuova visione. Con removeFromWatchlist il titolo esce dalla watchlist (e dalla serata) nella stessa transazione.
	async function addViewing(input, { removeFromWatchlist: remove = false } = {}) {
		const viewing = normalizeViewing(input);
		await transaction(['movies', 'viewings', 'watchlist', 'kv'], 'readwrite', async ({ movies, viewings, watchlist, kv }) => {
			if (!(await request(movies.get(viewing.movieId)))) throw new Error('Titolo sconosciuto: aggiungilo prima dalla ricerca.');
			await request(viewings.put(viewing));
			if (!remove) return;
			await request(watchlist.delete(viewing.movieId));
			const planned = await getKv(kv, 'planned');
			if (planned?.movieIds?.includes(viewing.movieId)) await putKv(kv, 'planned', { ...planned, movieIds: planned.movieIds.filter(id => id !== viewing.movieId) });
		});
		return viewing;
	}

	async function updateViewing(id, input) {
		return transaction('viewings', 'readwrite', async ({ viewings }) => {
			const existing = await request(viewings.get(id));
			if (!existing) throw new Error('Questa visione non esiste più.');
			const viewing = normalizeViewing({ ...existing, ...input }, existing);
			await request(viewings.put(viewing));
			return viewing;
		});
	}

	async function deleteViewing(id) {
		await transaction('viewings', 'readwrite', ({ viewings }) => request(viewings.delete(id)));
	}

	async function getPoster(movieId) {
		return transaction('posters', 'readonly', ({ posters }) => request(posters.get(movieId)).then(record => record?.blob || null));
	}

	async function savePoster(movieId, blob) {
		await transaction('posters', 'readwrite', ({ posters }) => request(posters.put({ movieId, blob, savedAt: nowIso() })));
	}

	async function posterIds() {
		return transaction('posters', 'readonly', ({ posters }) => request(posters.getAllKeys()));
	}

	// Chiede al sistema di non cancellare i dati per fare spazio (PIANO.md, §2). Non garantisce niente contro la
	// disinstallazione: per quella c'è il backup.
	async function requestPersistence() {
		try {
			return Boolean(await navigator.storage?.persist?.());
		} catch {
			return false;
		}
	}

	async function close() {
		if (!dbPromise) return;
		(await dbPromise).close();
		dbPromise = null;
	}

	return {
		open, close, loadAll, addToWatchlist, removeFromWatchlist, setHype, savePlanned, clearPlanned, completePlanned,
		addViewing, updateViewing, deleteViewing, getPoster, savePoster, posterIds, requestPersistence, STORES
	};
}

export const store = createStore();
