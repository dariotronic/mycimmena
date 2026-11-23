// Quando e come si chiede a OMDb (PIANO.md, §5): modalità light, completa o in attesa, dettagli all'aggiunta e
// all'apertura della scheda, completamento in sottofondo dei titoli già salvati e stagioni delle serie.
// OMDb si chiama solo quando serve: ogni titolo costa una richiesta, poi i dettagli restano sul telefono.
import { fetchOmdbDetails, fetchOmdbSeason, OmdbError, verifyOmdbKey } from './omdb.js';
import { missingOmdbSeasons, structureFromOmdb, withOmdbSeason } from './series.js';

export const COMPLETION_INTERVAL_MS = 1000;
export const COMPLETION_MAX_PER_SESSION = 100;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// 'light' per scelta, 'full' con una chiave valida, 'waiting' se si è scelta la completa ma la chiave manca o non va.
export function detailModeOf(settings) {
	if (settings?.detailMode !== 'full') return 'light';
	return settings.omdbKey && settings.omdbKeyStatus === 'valid' ? 'full' : 'waiting';
}

const tomorrow = (now = new Date()) => {
	const next = new Date(now);
	next.setHours(24, 0, 0, 0);
	return next.toISOString();
};

export function createDetails({ store, getState, onChange = () => {}, onProgress = () => {}, notify = () => {}, fetchImpl, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
	const settings = () => getState()?.settings || {};
	const mode = () => detailModeOf(settings());
	const paused = () => Boolean(settings().omdbPausedUntil && settings().omdbPausedUntil > new Date().toISOString());
	const options = () => ({ key: settings().omdbKey, fetchImpl });
	const inFlight = new Map();
	const queue = [];
	let running = false;
	let completedThisSession = 0;

	// Cosa fare quando OMDb dice di no. Restituisce true se conviene fermarsi.
	async function handleError(error) {
		if (!(error instanceof OmdbError)) throw error;
		if (error.kind === 'invalid') {
			await store.updateKv('settings', { omdbKeyStatus: 'invalid' });
			await onChange();
			notify(error.message);
			return true;
		}
		if (error.kind === 'limit') {
			if (!paused()) notify(error.message);
			await store.updateKv('settings', { omdbPausedUntil: tomorrow() });
			await onChange();
			return true;
		}
		// Rete assente: si riprova la prossima volta, senza avvisi. Titolo sconosciuto: si segna per non richiederlo.
		return error.kind === 'network';
	}

	async function fetchAndSave(movieId) {
		const details = await fetchOmdbDetails(movieId, options());
		await store.saveDetails(movieId, details);
		return details;
	}

	// Dettagli di un titolo, se servono e si possono chiedere. Due chiamate per lo stesso titolo condividono la richiesta.
	function ensure(movieId) {
		const movie = getState()?.movies?.get(movieId);
		if (!movie || movie.details || mode() !== 'full' || paused()) return Promise.resolve(false);
		if (!inFlight.has(movieId)) {
			inFlight.set(movieId, (async () => {
				try {
					await fetchAndSave(movieId);
					await onChange();
					return true;
				} catch (error) {
					if (error instanceof OmdbError && error.kind === 'not-found') await store.saveDetails(movieId, { notFound: true });
					else await handleError(error);
					return false;
				} finally {
					inFlight.delete(movieId);
				}
			})());
		}
		return inFlight.get(movieId);
	}

	// Completamento in sottofondo: uno al secondo, al massimo COMPLETION_MAX_PER_SESSION per sessione,
	// con l'indicatore "Completamento schede: 12/40" (onProgress; null quando finisce).
	function complete(movieIds = null) {
		if (mode() !== 'full' || paused()) return;
		const ids = movieIds || [...(getState()?.movies?.values() || [])].filter(movie => !movie.details).map(movie => movie.id);
		for (const id of ids) if (!queue.includes(id)) queue.push(id);
		if (running || !queue.length) return;
		running = true;
		(async () => {
			let done = 0;
			let total = queue.length;
			let stopped = false;
			try {
				while (queue.length && completedThisSession < COMPLETION_MAX_PER_SESSION && mode() === 'full' && !paused()) {
					total = Math.max(total, done + queue.length);
					onProgress({ done, total });
					const id = queue.shift();
					if (!getState()?.movies?.get(id)?.details) {
						try {
							await fetchAndSave(id);
							completedThisSession += 1;
						} catch (error) {
							if (error instanceof OmdbError && error.kind === 'not-found') await store.saveDetails(id, { notFound: true });
							else if (await handleError(error)) {
								stopped = true;
								break;
							}
						}
						done += 1;
						if (queue.length) await wait(COMPLETION_INTERVAL_MS);
					}
				}
			} finally {
				onProgress(null);
				// "In corso" finisce solo dopo aver riletto i dati: prima chi aspettava la fine trovava ancora i dati vecchi
				// (e il test sul completamento falliva una volta ogni tanto). I titoli arrivati nel frattempo ripartono, a meno
				// che il giro non si sia fermato per un errore (rete, chiave, limite): quelli aspettano il prossimo avvio.
				try {
					if (done) await onChange();
				} finally {
					running = false;
					if (!stopped && queue.length && completedThisSession < COMPLETION_MAX_PER_SESSION) complete([]);
				}
			}
		})();
	}

	// Stagioni di una serie: con OMDb si costruisce la struttura da totalSeasons e si scaricano le stagioni richieste
	// (di solito la prima e quella in corso; le altre quando si aprono). Una volta alla settimana, per le serie non
	// finite, si ricontrolla se OMDb conosce stagioni nuove.
	async function ensureSeasons(movieId, wanted = [1]) {
		if (mode() !== 'full' || paused()) return false;
		const state = getState();
		let movie = state?.movies?.get(movieId);
		if (!movie) return false;
		try {
			const finished = state.series?.get(movieId)?.status === 'finished';
			const stale = movie.seasons?.checkedAt && Date.now() - Date.parse(movie.seasons.checkedAt) > WEEK_MS && !finished;
			if (!movie.details || stale) movie = { ...movie, details: await fetchAndSave(movieId) };
			const total = movie.details?.totalSeasons;
			let seasons = movie.seasons;
			if (!seasons && total) seasons = structureFromOmdb(total);
			else if (seasons && total && stale) {
				const known = new Set(seasons.list.map(season => season.n));
				const added = Array.from({ length: total }, (_, index) => index + 1).filter(n => !known.has(n))
					.map(n => ({ n, episodes: 0, titles: null, source: 'omdb' }));
				seasons = { ...seasons, list: [...seasons.list, ...added], omdbTotal: total, checkedAt: new Date().toISOString() };
			}
			if (!seasons) return false;
			const missing = missingOmdbSeasons(seasons).filter(n => wanted.includes(n));
			for (const n of missing) {
				const { titles } = await fetchOmdbSeason(movieId, n, options());
				seasons = withOmdbSeason(seasons, n, titles);
			}
			if (seasons !== movie.seasons) {
				await store.saveSeasons(movieId, seasons);
				await onChange();
				return true;
			}
			return false;
		} catch (error) {
			if (!(error instanceof OmdbError && error.kind === 'not-found')) await handleError(error);
			return false;
		}
	}

	// Chiave nuova: si prova subito. Se va, la modalità diventa completa e parte il completamento dei titoli salvati.
	async function useKey(key) {
		const clean = String(key || '').trim();
		await verifyOmdbKey(clean, { fetchImpl });
		await store.updateKv('settings', { detailMode: 'full', omdbKey: clean, omdbKeyStatus: 'valid', omdbPausedUntil: null });
		await onChange();
		complete();
		return true;
	}

	return { mode, ensure, complete, ensureSeasons, useKey, isRunning: () => running };
}
