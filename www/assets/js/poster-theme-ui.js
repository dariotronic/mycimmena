// Colori dal film del cuore (Impostazioni → Aspetto): la locandina salvata sul telefono dà accento, secondario e il resto
// della palette (poster-theme.js), per il tema chiaro e per quello scuro. Si calcola una volta per film e si tiene in
// localStorage, così boot.js la applica prima del primo disegno (niente lampo rosso all'apertura).
import { posterColors, posterPalette } from './poster-theme.js';

export const POSTER_THEME_KEY = 'mycimmena-poster-theme';
// Si alza quando cambia il calcolo dei colori: le palette salvate con un numero diverso si rifanno.
export const POSTER_THEME_VERSION = 1;
const SAMPLE_WIDTH = 48;
const SAMPLE_HEIGHT = 72;

const readSaved = () => {
	try {
		return JSON.parse(localStorage.getItem(POSTER_THEME_KEY) || 'null');
	} catch {
		return null;
	}
};
const writeSaved = value => {
	try {
		if (value) localStorage.setItem(POSTER_THEME_KEY, JSON.stringify(value));
		else localStorage.removeItem(POSTER_THEME_KEY);
	} catch (error) {
		console.warn('Impossibile salvare i colori del film del cuore.', error);
	}
};

// I pixel della locandina rimpicciolita: [r, g, b, …].
async function samplePixels(blob) {
	const bitmap = await createImageBitmap(blob);
	const canvas = document.createElement('canvas');
	canvas.width = SAMPLE_WIDTH;
	canvas.height = SAMPLE_HEIGHT;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	context.drawImage(bitmap, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
	bitmap.close?.();
	const data = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;
	const pixels = [];
	for (let index = 0; index < data.length; index += 4) pixels.push(data[index], data[index + 1], data[index + 2]);
	return pixels;
}

// Calcolo della palette per un film: { v, movieId, day, night } oppure { v, movieId, none: true } (bianco e nero).
export function themeForPixels(movieId, pixels) {
	const colors = posterColors(pixels);
	if (!colors.accent) return { v: POSTER_THEME_VERSION, movieId, none: true };
	return { v: POSTER_THEME_VERSION, movieId, day: posterPalette(colors, 'day'), night: posterPalette(colors, 'night') };
}

export function createPosterTheme({ store, getData }) {
	const root = document.documentElement;
	const themeColorMeta = document.querySelector('meta[name="theme-color"]');
	let applied = [];
	let working = null;

	function clear() {
		applied.forEach(name => root.style.removeProperty(name));
		applied = [];
		delete root.dataset.posterThemeMovie;
	}

	// Le variabili della modalità in uso (giorno o notte) sopra quelle di style.css.
	function apply(theme) {
		clear();
		if (!theme || theme.none) return;
		const vars = theme[root.dataset.theme === 'night' ? 'night' : 'day'];
		for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
		applied = Object.keys(vars);
		root.dataset.posterThemeMovie = theme.movieId;
		if (themeColorMeta) themeColorMeta.content = vars['--paper'];
	}

	// Dopo ogni lettura dei dati e quando arriva una locandina: se serve, ricalcola; altrimenti riapplica quello salvato.
	async function sync() {
		const data = getData();
		const favorite = data.favorite;
		if (data.settings?.posterTheme === false || !favorite) {
			writeSaved(null);
			clear();
			return;
		}
		const saved = readSaved();
		if (saved?.v === POSTER_THEME_VERSION && saved.movieId === favorite.id) {
			apply(saved);
			return;
		}
		if (working === favorite.id) return;
		working = favorite.id;
		try {
			const blob = await store.getPoster(favorite.id);
			// Locandina non ancora scaricata: si riprova quando arriva (posters.js → sync).
			if (!blob) return void clear();
			const theme = themeForPixels(favorite.id, await samplePixels(blob));
			if (getData().favorite?.id !== favorite.id) return;
			writeSaved(theme);
			apply(theme);
		} catch (error) {
			console.warn('Colori del film del cuore non disponibili.', error);
			clear();
		} finally {
			working = null;
		}
	}

	// Cambio giorno/notte (theme.js): stessa palette, l'altra metà.
	document.addEventListener('colormodechange', () => apply(readSaved()?.movieId === getData().favorite?.id ? readSaved() : null));

	return { sync };
}
