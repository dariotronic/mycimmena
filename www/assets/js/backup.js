// Backup (PIANO.md, §8): un file JSON con tutto quello che l'utente ha salvato, per non perdere i dati
// e per cambiare telefono. Le locandine non ci sono: si riscaricano.
//
// Qui il formato del file (buildBackup), il controllo di un file da importare (parseBackup) e il salvataggio
// del file sul telefono (saveBackupFile). Il ripristino nel database lo fa store.restoreData.
import { normalizeMovie, normalizeViewing, SCHEMA_VERSION } from './store.js';
import { SERIES_STATUSES } from './series.js';
import { today } from './domain.js';

export const BACKUP_FORMAT = 1;
const IMDB_ID = /^tt[0-9]{1,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

// La data nel nome è quella italiana (domain.today), non quella UTC.
export const backupFileName = (date = new Date()) => `mycimmena-backup-${today(date)}.json`;

export function buildBackup(data, { appVersion, now = new Date() }) {
	return {
		app: 'myCimmena',
		kind: 'backup',
		format: BACKUP_FORMAT,
		schemaVersion: SCHEMA_VERSION,
		appVersion,
		exportedAt: now.toISOString(),
		data
	};
}

const stamp = value => (ISO.test(String(value || '')) ? String(value) : null);
const text = (value, max) => (value === null || value === undefined ? null : String(value).slice(0, max));
// Valori semplici di un record (testi corti, numeri, sì/no): bastano per profilo, impostazioni e onboarding.
const plainValues = (record, max = 300) => Object.fromEntries(Object.entries(record && typeof record === 'object' ? record : {})
	.filter(([key, value]) => /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(key) && (typeof value === 'boolean' || Number.isFinite(value) || typeof value === 'string'))
	.map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, max) : value]));

function cleanSeasons(seasons) {
	if (!seasons || typeof seasons !== 'object' || !Array.isArray(seasons.list)) return null;
	const list = seasons.list.slice(0, 200).map(season => ({
		n: Number(season?.n),
		episodes: Number(season?.episodes),
		titles: Array.isArray(season?.titles) ? season.titles.slice(0, 1000).map(title => String(title ?? '').slice(0, 300)) : null,
		source: season?.source === 'omdb' ? 'omdb' : 'custom'
	})).filter(season => Number.isInteger(season.n) && season.n >= 1 && Number.isInteger(season.episodes) && season.episodes >= 0 && season.episodes <= 1000);
	return {
		source: ['omdb', 'custom', 'mixed'].includes(seasons.source) ? seasons.source : 'custom',
		list,
		omdbTotal: Number.isInteger(seasons.omdbTotal) ? seasons.omdbTotal : null,
		updatedAt: stamp(seasons.updatedAt),
		checkedAt: stamp(seasons.checkedAt)
	};
}

function cleanMovie(movie) {
	const clean = normalizeMovie(movie);
	return { ...clean, details: plainDetails(movie.details), detailsFetchedAt: stamp(movie.detailsFetchedAt), seasons: clean.type === 'series' ? cleanSeasons(movie.seasons) : null };
}
// I dettagli di OMDb sono testi (normalizeOmdbDetails): si tengono solo quelli.
const plainDetails = details => (details && typeof details === 'object' ? plainValues(details, 10000) : null);

// Legge e controlla un file di backup. Il file viene da fuori: ogni voce si ricostruisce con le stesse regole
// del salvataggio normale, e quelle non valide si scartano (e si contano).
export function parseBackup(raw) {
	let file;
	try {
		file = JSON.parse(String(raw).replace(/^﻿/, ''));
	} catch {
		throw new Error('Il file non è un backup di myCimmena (non è un JSON valido).');
	}
	if (file?.app !== 'myCimmena' || file?.kind !== 'backup' || !file.data || typeof file.data !== 'object') throw new Error('Il file non è un backup di myCimmena.');
	if (!(Number(file.format) <= BACKUP_FORMAT)) throw new Error('Questo backup viene da una versione più nuova di myCimmena: aggiorna l’app e riprova.');
	const source = file.data;
	let skipped = 0;
	const each = (list, clean) => (Array.isArray(list) ? list : []).flatMap(item => {
		try {
			const result = clean(item);
			if (result) return [result];
		} catch { /* voce non valida */ }
		skipped += 1;
		return [];
	});

	const movies = each(source.movies, cleanMovie);
	const movieIds = new Set(movies.map(movie => movie.id));
	const known = id => IMDB_ID.test(String(id || '')) && movieIds.has(id);
	const watchlist = each(source.watchlist, entry => known(entry.movieId) && {
		movieId: entry.movieId,
		addedAt: stamp(entry.addedAt) || new Date(0).toISOString(),
		hype: Number.isInteger(entry.hype) && entry.hype >= 0 && entry.hype <= 5 ? entry.hype : null,
		note: text(entry.note, 2000),
		source: ['app', 'letterboxd', 'imdb'].includes(entry.source) ? entry.source : 'app',
		updatedAt: stamp(entry.updatedAt)
	});
	const viewings = each(source.viewings, viewing => known(viewing.movieId) && {
		...normalizeViewing(viewing),
		createdAt: stamp(viewing.createdAt) || stamp(viewing.updatedAt) || new Date(0).toISOString(),
		updatedAt: stamp(viewing.updatedAt) || stamp(viewing.createdAt) || new Date(0).toISOString()
	});
	const series = each(source.series, record => known(record.movieId) && record.status in SERIES_STATUSES && {
		movieId: record.movieId,
		status: record.status,
		round: Number.isInteger(record.round) && record.round >= 1 ? record.round : 1,
		startedAt: stamp(record.startedAt),
		updatedAt: stamp(record.updatedAt)
	});
	const watchlistIds = new Set(watchlist.map(entry => entry.movieId));
	const planned = source.planned && typeof source.planned === 'object' ? {
		date: DATE.test(String(source.planned.date || '')) ? source.planned.date : null,
		place: text(source.planned.place, 120),
		movieIds: (Array.isArray(source.planned.movieIds) ? source.planned.movieIds : []).filter(id => watchlistIds.has(id)),
		updatedAt: stamp(source.planned.updatedAt)
	} : null;
	const settings = source.settings ? plainValues(source.settings) : null;
	// La chiave OMDb è fatta solo di lettere e cifre: qualsiasi altra cosa si scarta.
	if (settings && !/^[A-Za-z0-9]{1,64}$/.test(String(settings.omdbKey || ''))) delete settings.omdbKey;

	const data = {
		movies, watchlist, viewings, series, planned,
		profile: source.profile ? plainValues(source.profile) : null,
		settings,
		onboarding: source.onboarding ? plainValues(source.onboarding) : null
	};
	return {
		data,
		skipped,
		summary: {
			exportedAt: stamp(file.exportedAt),
			appVersion: text(file.appVersion, 20) || '',
			name: data.profile?.name || '',
			titles: movies.length,
			watchlist: watchlist.length,
			viewings: viewings.length,
			series: series.length,
			hasKey: Boolean(settings?.omdbKey)
		}
	};
}

// Riepilogo in parole: "120 titoli, 45 visioni, salvato il 14 marzo 2026".
export function describeBackup(summary, formatDate = value => value) {
	const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
	const parts = [
		plural(summary.watchlist, 'titolo nella watchlist', 'titoli nella watchlist'),
		plural(summary.viewings, 'visione nel diario', 'visioni nel diario')
	];
	if (summary.series) parts.push(plural(summary.series, 'serie seguita', 'serie seguite'));
	return `${parts.join(', ')}${summary.exportedAt ? `, salvato il ${formatDate(today(new Date(summary.exportedAt)))}` : ''}.`;
}

// Salva il testo del backup. Su Android: 'documents' lo scrive nella cartella Documenti, 'share' apre il menu
// Condividi (Drive, mail, Telegram…). Nel browser si scarica e basta. Restituisce dove è finito.
export async function saveBackupFile({ text: content, fileName, how = 'documents' }) {
	const plugins = globalThis.Capacitor?.isNativePlatform?.() ? globalThis.Capacitor.Plugins : null;
	if (!plugins?.Filesystem) {
		const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
		const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
		document.body.append(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
		return { where: 'download' };
	}
	const { Filesystem, Share } = plugins;
	if (how === 'share') {
		const { uri } = await Filesystem.writeFile({ path: fileName, data: content, directory: 'CACHE', encoding: 'utf8' });
		try {
			await Share.share({ title: 'Backup di myCimmena', files: [uri], dialogTitle: 'Dove vuoi salvare il backup?' });
		} catch (error) {
			// Chiudere il menu senza scegliere non è un errore.
			if (/cancel/i.test(String(error?.message || error))) return { where: 'cancelled' };
			throw error;
		}
		return { where: 'shared' };
	}
	// Fino ad Android 10 scrivere in Documenti richiede il permesso della memoria.
	try {
		const permission = await Filesystem.checkPermissions();
		if (permission.publicStorage !== 'granted' && (await Filesystem.requestPermissions()).publicStorage !== 'granted') {
			throw new Error('Senza il permesso della memoria non posso salvare in Documenti: usa «Condividi».');
		}
	} catch (error) {
		if (/permesso/.test(error.message)) throw error;
	}
	try {
		await Filesystem.writeFile({ path: `myCimmena/${fileName}`, data: content, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
	} catch {
		throw new Error('Non riesco a scrivere nella cartella Documenti: usa «Condividi» e scegli dove salvarlo.');
	}
	return { where: 'documents', path: `Documenti/myCimmena/${fileName}` };
}
