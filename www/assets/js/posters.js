// Locandine salvate sul telefono, per vederle anche offline (PIANO.md, §2): la miniatura da 400 px di IMDb si scarica
// una volta, si tiene in IndexedDB come Blob (store.js, store "posters") e si mostra con un URL blob:.
// Il server delle immagini di IMDb risponde con CORS aperto, quindi basta un fetch.
import { sizedPosterUrl, POSTER_CARD_WIDTH } from './movie-info.js';

const objectUrls = new Map();

// URL locale (blob:) della locandina salvata, o stringa vuota. Lo usa il modello dati delle viste come poster_local.
export const localPosterUrl = movieId => objectUrls.get(movieId) || '';

export function createPosters({ store, fetchImpl = globalThis.fetch, onSaved = () => {} }) {
	const queue = [];
	let running = false;

	// Carica in memoria gli URL delle locandine già salvate. Va chiamata prima di disegnare le viste.
	async function loadSaved() {
		const ids = await store.posterIds();
		await Promise.all(ids.filter(id => !objectUrls.has(id)).map(async id => {
			const blob = await store.getPoster(id);
			if (blob) objectUrls.set(id, URL.createObjectURL(blob));
		}));
	}

	async function download(movie) {
		const url = sizedPosterUrl(movie.posterUrl, POSTER_CARD_WIDTH);
		if (!url) return false;
		const response = await fetchImpl(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const blob = await response.blob();
		if (!blob.type.startsWith('image/')) throw new Error('Non è un’immagine');
		await store.savePoster(movie.id, blob);
		objectUrls.set(movie.id, URL.createObjectURL(blob));
		return true;
	}

	// Mette in coda i titoli senza locandina salvata e li scarica uno alla volta, in sottofondo. Gli errori sono
	// silenziosi: resta la locandina remota, e si riprova al prossimo avvio.
	function ensure(movies) {
		for (const movie of movies) {
			if (movie.posterUrl && !objectUrls.has(movie.id) && !queue.some(item => item.id === movie.id)) queue.push(movie);
		}
		if (running || !queue.length) return;
		running = true;
		(async () => {
			let saved = 0;
			while (queue.length) {
				if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
				const movie = queue.shift();
				try {
					if (await download(movie)) saved += 1;
				} catch (error) {
					console.warn(`Locandina di ${movie.id} non salvata: ${error.message}`);
				}
			}
			running = false;
			if (saved) onSaved(saved);
		})();
	}

	return { loadSaved, ensure };
}
