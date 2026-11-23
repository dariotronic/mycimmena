// Negozio dati dell'app: tutto quello che l'utente salva sta qui, in IndexedDB, sul telefono (PIANO.md, §2 e §3).
// Le viste non toccano mai IndexedDB: chiamano queste funzioni, che restituiscono promesse.
//
// Store (versione 2 dello schema):
// - movies     catalogo dei titoli conosciuti, per id IMDb: { id, title, year, type, posterUrl, stars, details (OMDb),
//              detailsFetchedAt, seasons (struttura delle stagioni delle serie, vedi series.js) }
// - watchlist  { movieId, addedAt, hype (0–5 o null), note, source ('app' | 'letterboxd' | 'imdb'), updatedAt }
// - viewings   il diario: { id, movieId, date, place, withWhom, rating (0,5–10 o null), notes (HTML filtrato), createdAt, updatedAt;
//              per le serie anche episodes [{ s, e }], scope ('episodes' | 'season' | 'series'), season, round }
// - posters    locandine salvate per vederle offline: { movieId, blob, savedAt }
// - kv         record singoli per chiave: 'planned' (la serata in programma), 'profile', 'settings', 'onboarding', 'meta',
//              'import' (l'importazione della watchlist in corso, vedi watchlist-import.js)
// - series     avanzamento delle serie (dalla versione 2): { movieId, status, round, startedAt, updatedAt }
import { sanitizeNotes } from './sanitize.js';
import { normalizeEpisodes, SERIES_STATUSES } from './series.js';

export const DB_NAME = 'mycimmena';
export const SCHEMA_VERSION = 2;

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
	},
	// 1 → 2: avanzamento delle serie TV (Fase 2).
	db => {
		db.createObjectStore('series', { keyPath: 'movieId' });
	}
];

const STORES = ['movies', 'watchlist', 'viewings', 'posters', 'kv', 'series'];
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
		detailsFetchedAt: movie.detailsFetchedAt || null,
		seasons: movie.seasons && typeof movie.seasons === 'object' ? movie.seasons : null
	};
}

const validRating = value => (value === null || value === undefined || value === '' ? null
	: (Number.isFinite(Number(value)) && Number(value) >= 0.5 && Number(value) <= 10 && Number(value) * 2 === Math.round(Number(value) * 2) ? Number(value) : undefined));
const validHype = value => (value === null || value === undefined ? null
	: (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 5 ? Number(value) : undefined));
const cleanText = (value, max) => String(value ?? '').trim().slice(0, max) || null;
const SCOPES = ['episodes', 'season', 'series'];
const positiveInt = value => (Number.isInteger(Number(value)) && Number(value) >= 1 ? Number(value) : null);

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
		...seriesFields(input, existing),
		createdAt: existing?.createdAt || input.createdAt || stamp,
		updatedAt: stamp
	};
}


// Campi delle visioni delle serie: solo se ci sono (i film non li hanno).
function seriesFields(input, existing) {
	const scope = SCOPES.includes(input.scope) ? input.scope : (existing?.scope || null);
	if (!scope) return {};
	const episodes = normalizeEpisodes(input.episodes ?? existing?.episodes);
	return {
		scope,
		episodes: scope === 'episodes' ? episodes : [],
		season: scope === 'season' ? positiveInt(input.season ?? existing?.season) : null,
		round: positiveInt(input.round ?? existing?.round) || 1
	};
}

// Unione di un titolo presente sia sul telefono sia nel backup: dettagli e stagioni più recenti; i dati di base
// del telefono, completati con quelli del backup dove mancano.
export function mergeMovie(local, incoming) {
	const localNewer = (a, b) => String(a || '') >= String(b || '');
	const keepLocalDetails = Boolean(local.details) && localNewer(local.detailsFetchedAt, incoming.detailsFetchedAt);
	const keepLocalSeasons = Boolean(local.seasons) && localNewer(local.seasons?.updatedAt, incoming.seasons?.updatedAt);
	return {
		...incoming,
		...Object.fromEntries(Object.entries(local).filter(([, value]) => value !== '' && value !== null && value !== undefined)),
		details: keepLocalDetails ? local.details : (incoming.details || local.details || null),
		detailsFetchedAt: keepLocalDetails ? local.detailsFetchedAt : (incoming.detailsFetchedAt || local.detailsFetchedAt || null),
		seasons: keepLocalSeasons ? local.seasons : (incoming.seasons || local.seasons || null)
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
		return transaction(['movies', 'watchlist', 'viewings', 'kv', 'series'], 'readonly', async ({ movies, watchlist, viewings, kv, series }) => {
			const [movieList, watchlistEntries, viewingList, seriesList, planned, meta, profile, settings, onboarding, importJob] = await Promise.all([
				request(movies.getAll()), request(watchlist.getAll()), request(viewings.getAll()), request(series.getAll()),
				getKv(kv, 'planned'), getKv(kv, 'meta'), getKv(kv, 'profile'), getKv(kv, 'settings'), getKv(kv, 'onboarding'), getKv(kv, 'import')
			]);
			return {
				movies: new Map(movieList.map(movie => [movie.id, movie])),
				watchlist: watchlistEntries,
				viewings: viewingList,
				series: new Map(seriesList.map(record => [record.movieId, record])),
				planned, meta, profile, settings, onboarding, importJob
			};
		});
	}

	// Record singoli: profilo, impostazioni, stato dell'onboarding. `patch` si unisce al valore salvato.
	const KV_KEYS = ['profile', 'settings', 'onboarding', 'meta'];
	async function updateKv(key, patch) {
		if (!KV_KEYS.includes(key)) throw new Error(`Chiave sconosciuta: ${key}`);
		return transaction('kv', 'readwrite', async ({ kv }) => {
			// updatedAt serve all'unione dei backup (vince la versione modificata più di recente); meta resta solo qui.
			const next = { ...(await getKv(kv, key) || {}), ...patch, ...(key === 'meta' ? {} : { updatedAt: nowIso() }) };
			await putKv(kv, key, next);
			return next;
		});
	}

	// Titolo nel catalogo senza aggiungerlo alla watchlist (per esempio il film del cuore).
	async function saveMovie(movie) {
		const item = normalizeMovie(movie);
		return transaction('movies', 'readwrite', async ({ movies }) => {
			const known = await request(movies.get(item.id));
			const next = known ? { ...known, ...item, details: known.details || item.details, detailsFetchedAt: known.detailsFetchedAt || item.detailsFetchedAt, seasons: known.seasons || item.seasons } : item;
			await request(movies.put(next));
			return next;
		});
	}

	// Dettagli di OMDb (omdb.js li normalizza). Se OMDb dice che è una serie, il tipo si aggiorna.
	async function saveDetails(movieId, details) {
		return transaction('movies', 'readwrite', async ({ movies }) => {
			const movie = await request(movies.get(movieId));
			if (!movie) return null;
			const next = { ...movie, details, detailsFetchedAt: new Date().toISOString(), type: details?.type || movie.type };
			await request(movies.put(next));
			return next;
		});
	}

	async function saveSeasons(movieId, seasons) {
		return transaction('movies', 'readwrite', async ({ movies }) => {
			const movie = await request(movies.get(movieId));
			if (!movie) throw new Error('Titolo sconosciuto.');
			await request(movies.put({ ...movie, seasons }));
			return seasons;
		});
	}

	async function currentSeries(series, movieId) {
		return await request(series.get(movieId)) || null;
	}

	// Dopo un episodio segnato la serie passa "in corso" (anche se era finita e sono arrivate stagioni nuove: se con
	// questo è finita davvero, la scheda la segna "Finita" subito dopo, series-ui.js) ed esce dalla watchlist e dalla
	// serata in programma.
	async function startWatching({ series, watchlist, kv }, movieId) {
		const stamp = new Date().toISOString();
		const record = await currentSeries(series, movieId) || { movieId, round: 1, startedAt: stamp };
		const nextRecord = { ...record, status: 'watching', round: record.round || 1, updatedAt: stamp };
		await request(series.put(nextRecord));
		await request(watchlist.delete(movieId));
		const planned = await getKv(kv, 'planned');
		if (planned?.movieIds?.includes(movieId)) await putKv(kv, 'planned', { ...planned, movieIds: planned.movieIds.filter(id => id !== movieId) });
		return nextRecord;
	}

	// Visioni degli episodi del giro corrente di una serie.
	async function episodeSessions(viewings, movieId, round) {
		return (await request(viewings.index('movieId').getAll(movieId)))
			.filter(viewing => viewing.scope === 'episodes' && (viewing.round || 1) === round);
	}

	// Segna episodi visti in una data: ognuno diventa una visione a sé nel diario (con la sua card, voto e note).
	// Gli episodi già segnati nel giro corrente si saltano.
	async function markEpisodes(movieId, episodes, { date }) {
		if (!DATE.test(String(date || ''))) throw new Error('Data non valida.');
		const list = normalizeEpisodes(episodes);
		if (!list.length) throw new Error('Nessun episodio da segnare.');
		return transaction(['movies', 'viewings', 'series', 'watchlist', 'kv'], 'readwrite', async ({ movies, viewings, series, watchlist, kv }) => {
			if (!(await request(movies.get(movieId)))) throw new Error('Titolo sconosciuto.');
			const round = (await currentSeries(series, movieId))?.round || 1;
			const watched = new Set((await episodeSessions(viewings, movieId, round)).flatMap(viewing => (viewing.episodes || []).map(({ s, e }) => `${s}-${e}`)));
			const created = [];
			for (const episode of list) {
				if (watched.has(`${episode.s}-${episode.e}`)) continue;
				const viewing = normalizeViewing({ movieId, date, scope: 'episodes', episodes: [episode], round });
				await request(viewings.put(viewing));
				created.push(viewing);
			}
			const record = await startWatching({ series, watchlist, kv }, movieId);
			return { viewings: created, series: record };
		});
	}

	// Toglie il segno a degli episodi del giro corrente. Una visione rimasta senza episodi, voto e note sparisce
	// (le visioni di più episodi insieme vengono dalle versioni fino alla 0.5).
	async function unmarkEpisodes(movieId, episodes) {
		const keys = new Set(normalizeEpisodes(episodes).map(({ s, e }) => `${s}-${e}`));
		return transaction(['viewings', 'series'], 'readwrite', async ({ viewings, series }) => {
			const record = await currentSeries(series, movieId);
			for (const viewing of await episodeSessions(viewings, movieId, record?.round || 1)) {
				const remaining = (viewing.episodes || []).filter(({ s, e }) => !keys.has(`${s}-${e}`));
				if (remaining.length === (viewing.episodes || []).length) continue;
				if (!remaining.length && !viewing.rating && !viewing.notes) await request(viewings.delete(viewing.id));
				else await request(viewings.put({ ...viewing, episodes: remaining, updatedAt: new Date().toISOString() }));
			}
			// Con un episodio in meno la serie non è più finita.
			if (record?.status === 'finished') await request(series.put({ ...record, status: 'watching', updatedAt: new Date().toISOString() }));
		});
	}

	// La visione di un singolo episodio già segnato, per aprirla nel diario. Se l'episodio sta in una visione di più
	// episodi (versioni fino alla 0.5) ne esce e ne diventa una sua, con la stessa data, dove e con chi; voto e note
	// restano a quella di prima. Restituisce l'id della visione, o null se l'episodio non è segnato.
	async function splitEpisode(movieId, episode) {
		const [item] = normalizeEpisodes([episode]);
		if (!item) throw new Error('Episodio non valido.');
		const key = `${item.s}-${item.e}`;
		return transaction(['viewings', 'series'], 'readwrite', async ({ viewings, series }) => {
			const round = (await currentSeries(series, movieId))?.round || 1;
			const session = (await episodeSessions(viewings, movieId, round))
				.find(viewing => (viewing.episodes || []).some(({ s, e }) => `${s}-${e}` === key));
			if (!session) return null;
			if (session.episodes.length === 1) return session.id;
			const stamp = new Date().toISOString();
			await request(viewings.put({ ...session, episodes: session.episodes.filter(({ s, e }) => `${s}-${e}` !== key), updatedAt: stamp }));
			const own = normalizeViewing({ movieId, date: session.date, place: session.place, withWhom: session.withWhom, scope: 'episodes', episodes: [item], round });
			await request(viewings.put(own));
			return own.id;
		});
	}

	async function setSeriesStatus(movieId, status) {
		if (!(status in SERIES_STATUSES)) throw new Error('Stato della serie non valido.');
		return transaction('series', 'readwrite', async ({ series }) => {
			const stamp = new Date().toISOString();
			const record = { ...(await currentSeries(series, movieId) || { movieId, round: 1, startedAt: stamp }), status, updatedAt: stamp };
			await request(series.put(record));
			return record;
		});
	}

	// "Ricomincia da capo": nuovo giro, il precedente resta nel diario.
	async function restartSeries(movieId) {
		return transaction('series', 'readwrite', async ({ series }) => {
			const stamp = new Date().toISOString();
			const previous = await currentSeries(series, movieId);
			const record = { movieId, status: 'watching', round: (previous?.round || 0) + 1, startedAt: stamp, updatedAt: stamp };
			await request(series.put(record));
			return record;
		});
	}

	// Aggiunge titoli alla watchlist; quelli già presenti si saltano. Restituisce gli id aggiunti davvero.
	// Dall'importazione arrivano anche addedAt (la data originale) e source ('letterboxd' | 'imdb').
	async function addToWatchlist(movieList) {
		const items = movieList.map(movie => ({ ...normalizeMovie(movie), addedAt: movie.addedAt, source: movie.source }));
		return transaction(['movies', 'watchlist'], 'readwrite', async ({ movies, watchlist }) => {
			const added = [];
			for (const movie of items) {
				const known = await request(movies.get(movie.id));
				// I dettagli già scaricati restano: un nuovo risultato di ricerca non li cancella.
				const { addedAt, source, ...fields } = movie;
				await request(movies.put(known ? { ...known, ...fields, details: known.details || fields.details, detailsFetchedAt: known.detailsFetchedAt || fields.detailsFetchedAt, seasons: known.seasons || fields.seasons } : fields));
				if (await request(watchlist.get(movie.id))) continue;
				const stamp = nowIso();
				await request(watchlist.put({ movieId: movie.id, addedAt: DATE.test(String(addedAt || '').slice(0, 10)) ? addedAt : stamp, hype: null, note: null, source: ['letterboxd', 'imdb'].includes(source) ? source : 'app', updatedAt: stamp }));
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
			await request(watchlist.put({ ...entry, hype: value, updatedAt: nowIso() }));
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
	// Per la visione di un episodio (scope 'episodes') la serie passa "in corso" ed esce da watchlist e serata, come
	// con markEpisodes.
	async function addViewing(input, { removeFromWatchlist: remove = false } = {}) {
		const viewing = normalizeViewing(input);
		await transaction(['movies', 'viewings', 'watchlist', 'kv', 'series'], 'readwrite', async ({ movies, viewings, watchlist, kv, series }) => {
			if (!(await request(movies.get(viewing.movieId)))) throw new Error('Titolo sconosciuto: aggiungilo prima dalla ricerca.');
			await request(viewings.put(viewing));
			if (viewing.scope === 'episodes') return void await startWatching({ series, watchlist, kv }, viewing.movieId);
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

	// Diario importato da Letterboxd o IMDb (history-import.js): [{ movie, viewings: [{ date, rating, notes, scope?, round? }] }].
	// I titoli entrano nel catalogo (non nella watchlist); una visione con lo stesso titolo, la stessa data e lo stesso
	// tipo di una già nel diario si salta, così importare due volte lo stesso file non crea doppioni.
	async function importViewings(list) {
		const prepared = list.map(({ movie, viewings }) => ({ movie: normalizeMovie(movie), viewings: viewings.map(viewing => ({ ...viewing })) }));
		return transaction(['movies', 'viewings'], 'readwrite', async ({ movies, viewings: store }) => {
			let added = 0;
			let skipped = 0;
			for (const { movie, viewings } of prepared) {
				const known = await request(movies.get(movie.id));
				await request(movies.put(known ? { ...known, ...movie, details: known.details || movie.details, detailsFetchedAt: known.detailsFetchedAt || movie.detailsFetchedAt, seasons: known.seasons || movie.seasons } : movie));
				const existing = await request(store.index('movieId').getAll(movie.id));
				for (const input of viewings) {
					if (existing.some(viewing => viewing.date === input.date && (viewing.scope || null) === (input.scope || null))) {
						skipped += 1;
						continue;
					}
					const viewing = normalizeViewing({ ...input, movieId: movie.id });
					await request(store.put(viewing));
					existing.push(viewing);
					added += 1;
				}
			}
			return { added, skipped };
		});
	}

	// Importazione della watchlist in corso (watchlist-import.js): si salva per poterla riprendere.
	async function getImportJob() {
		return transaction('kv', 'readonly', ({ kv }) => getKv(kv, 'import'));
	}
	async function saveImportJob(job) {
		await transaction('kv', 'readwrite', ({ kv }) => putKv(kv, 'import', job));
	}
	async function clearImportJob() {
		await transaction('kv', 'readwrite', ({ kv }) => request(kv.delete('import')));
	}

	// Tutto quello che va nel backup (backup.js), locandine e dati locali (meta, importazione) esclusi.
	async function exportData() {
		return transaction(['movies', 'watchlist', 'viewings', 'series', 'kv'], 'readonly', async ({ movies, watchlist, viewings, series, kv }) => {
			const [movieList, watchlistEntries, viewingList, seriesList, planned, profile, settings, onboarding] = await Promise.all([
				request(movies.getAll()), request(watchlist.getAll()), request(viewings.getAll()), request(series.getAll()),
				getKv(kv, 'planned'), getKv(kv, 'profile'), getKv(kv, 'settings'), getKv(kv, 'onboarding')
			]);
			return { movies: movieList, watchlist: watchlistEntries, viewings: viewingList, series: seriesList, planned, profile, settings, onboarding };
		});
	}

	// Ripristino di un backup già controllato da backup.js (parseBackup), tutto in una transazione.
	// - 'replace': i dati attuali si cancellano e restano quelli del backup (le locandine salvate restano).
	// - 'merge': per ogni voce vince quella modificata più di recente; le voci che ci sono da una parte sola restano.
	async function restoreData(data, { mode = 'merge' } = {}) {
		if (!['merge', 'replace'].includes(mode)) throw new Error('Modo di ripristino sconosciuto.');
		const hasValidKey = settings => Boolean(settings?.omdbKey) && settings.omdbKeyStatus === 'valid';
		return transaction(['movies', 'watchlist', 'viewings', 'series', 'kv'], 'readwrite', async ({ movies, watchlist, viewings, series, kv }) => {
			const keyBefore = await getKv(kv, 'settings');
			if (mode === 'replace') {
				for (const objectStore of [movies, watchlist, viewings, series]) await request(objectStore.clear());
				for (const key of ['planned', 'profile', 'settings', 'onboarding']) await request(kv.delete(key));
			}
			const putNewer = async (objectStore, key, record, stampOf) => {
				const local = mode === 'merge' ? await request(objectStore.get(key)) : null;
				if (!local || stampOf(record) > stampOf(local)) await request(objectStore.put(record));
			};
			for (const movie of data.movies) {
				const local = mode === 'merge' ? await request(movies.get(movie.id)) : null;
				await request(movies.put(local ? mergeMovie(local, movie) : movie));
			}
			for (const entry of data.watchlist) await putNewer(watchlist, entry.movieId, entry, item => String(item.updatedAt || item.addedAt || ''));
			for (const viewing of data.viewings) await putNewer(viewings, viewing.id, viewing, item => String(item.updatedAt || item.createdAt || ''));
			for (const record of data.series) await putNewer(series, record.movieId, record, item => String(item.updatedAt || ''));
			for (const key of ['planned', 'profile', 'settings', 'onboarding']) {
				// Senza impostazioni nel backup si passa da un record vuoto: serve a non perdere la chiave (sotto).
				const incoming = data[key] || (key === 'settings' ? {} : null);
				if (!incoming) continue;
				const local = mode === 'merge' ? await getKv(kv, key) : null;
				let next = !local || String(incoming.updatedAt || '') > String(local.updatedAt || '') ? incoming : local;
				// L'onboarding fatto su uno dei due telefoni vale per entrambi.
				if (key === 'onboarding' && (local?.done || incoming.done)) next = { ...next, done: true };
				// Una chiave OMDb valida già su questo telefono non si perde per un backup che non ne ha una (per esempio
				// fatto con le schede light): resta, con le schede complete. Vale anche per "Sostituisci tutto".
				if (key === 'settings') {
					const phone = mode === 'replace' ? keyBefore : local;
					if (hasValidKey(phone) && !hasValidKey(next)) next = { ...next, detailMode: 'full', omdbKey: phone.omdbKey, omdbKeyStatus: 'valid', omdbPausedUntil: null };
				}
				await putKv(kv, key, next);
			}
			return { mode };
		});
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
		open, close, loadAll, updateKv, saveMovie, saveDetails, saveSeasons, markEpisodes, unmarkEpisodes, splitEpisode, setSeriesStatus, restartSeries, addToWatchlist, removeFromWatchlist, setHype, savePlanned, clearPlanned, completePlanned,
		addViewing, updateViewing, deleteViewing, getPoster, savePoster, posterIds, requestPersistence, importViewings, getImportJob, saveImportJob, clearImportJob, exportData, restoreData, STORES
	};
}

export const store = createStore();
