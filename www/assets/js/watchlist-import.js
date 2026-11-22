// Importazione della watchlist da Letterboxd e IMDb (PIANO.md, §9): lettura del file, riconoscimento del formato
// dalle colonne, abbinamento dei titoli con la ricerca di IMDb. Qui solo la logica; la finestra sta in import-ui.js.
//
// Un'importazione in corso è un "lavoro" salvato nel negozio dati (store.getImportJob), così si può interrompere
// e riprendere: { source, fileName, startedAt, items: [{ key, title, year, type, imdbId, addedAt, status, movie, candidates }] }
// status: 'pending' (da abbinare) | 'matched' | 'doubt' (da controllare) | 'duplicate' (già nella watchlist) | 'skipped'
import { isZip, readZipEntry, zipEntries } from './zip.js';

export const IMPORT_SOURCES = { letterboxd: 'Letterboxd', imdb: 'IMDb' };
const DATE = /^\d{4}-\d{2}-\d{2}/;
const MAX_ITEMS = 5000;

// CSV come lo scrivono Letterboxd e IMDb (RFC 4180): virgole, virgolette doppie, a capo dentro i campi tra virgolette.
export function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = '';
	let quoted = false;
	const source = String(text).replace(/^﻿/, '');
	for (let i = 0; i < source.length; i += 1) {
		const char = source[i];
		if (quoted) {
			if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
			else if (char === '"') quoted = false;
			else field += char;
		} else if (char === '"') quoted = true;
		else if (char === ',') { row.push(field); field = ''; }
		else if (char === '\n' || char === '\r') {
			if (char === '\r' && source[i + 1] === '\n') i += 1;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else field += char;
	}
	if (field || row.length) { row.push(field); rows.push(row); }
	return rows.filter(cells => cells.some(cell => cell.trim()));
}

const imdbType = value => {
	const type = String(value || '').toLowerCase();
	if (type.includes('episode')) return 'episode';
	if (type.includes('series')) return 'series';
	return 'movie';
};
const addedAt = value => (DATE.test(String(value || '')) ? `${String(value).slice(0, 10)}T12:00:00.000Z` : null);

// Dal testo del CSV alle voci da abbinare. Il formato si riconosce dalle colonne, non dal nome del file.
export function entriesFromCsv(text) {
	const [header = [], ...rows] = parseCsv(text);
	const columns = header.map(name => name.trim());
	const at = name => columns.indexOf(name);
	const read = (cells, name) => (at(name) >= 0 ? String(cells[at(name)] ?? '').trim() : '');
	let source;
	let entries;
	if (at('Const') >= 0 && at('Title') >= 0) {
		// L'esportazione dei voti di IMDb ha le stesse colonne ma non "Position": non è una watchlist.
		if (at('Position') < 0 && at('Your Rating') >= 0) throw new Error('Questo è il file dei voti di IMDb: per la watchlist scegli quello esportato dalla pagina della Watchlist.');
		source = 'imdb';
		entries = rows.map(cells => ({
			imdbId: /^tt\d{1,20}$/.test(read(cells, 'Const')) ? read(cells, 'Const') : '',
			title: read(cells, 'Title'),
			year: read(cells, 'Year').slice(0, 4),
			type: imdbType(read(cells, 'Title Type')),
			addedAt: addedAt(read(cells, 'Created'))
		})).filter(entry => entry.imdbId && entry.title);
	} else if (at('Name') >= 0 && at('Letterboxd URI') >= 0) {
		if (at('Rating') >= 0 || at('Watched Date') >= 0 || at('Review') >= 0) throw new Error('Questo file di Letterboxd contiene voti o diario: per la watchlist scegli watchlist.csv, o lo zip intero.');
		source = 'letterboxd';
		entries = rows.map(cells => ({
			imdbId: '',
			title: read(cells, 'Name'),
			year: read(cells, 'Year').slice(0, 4),
			type: 'movie',
			addedAt: addedAt(read(cells, 'Date'))
		})).filter(entry => entry.title);
	} else {
		throw new Error('Il file non sembra una watchlist di Letterboxd o di IMDb: controlla di aver scelto il file giusto.');
	}
	if (!entries.length) throw new Error('La watchlist nel file è vuota.');
	if (entries.length > MAX_ITEMS) throw new Error(`La watchlist ha più di ${MAX_ITEMS} titoli: è troppo grande da importare in una volta.`);
	return { source, entries };
}

// Legge il file scelto (CSV o zip di Letterboxd) e restituisce { source, entries }.
export async function readWatchlistFile(file) {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let text;
	if (isZip(bytes)) {
		const entries = zipEntries(bytes);
		const watchlist = entries.find(entry => entry.name === 'watchlist.csv') || entries.find(entry => /(^|\/)watchlist\.csv$/i.test(entry.name));
		if (!watchlist) throw new Error('Nello zip non c’è watchlist.csv: è l’esportazione di Letterboxd?');
		text = new TextDecoder().decode(await readZipEntry(bytes, watchlist));
	} else {
		text = new TextDecoder().decode(bytes);
		if (text.includes('\u0000')) throw new Error('Il file non è un CSV o uno zip: controlla di aver scelto il file giusto.');
	}
	return entriesFromCsv(text);
}

// Nuovo lavoro di importazione. I titoli già nella watchlist (per id, quando c'è) e quelli ripetuti nel file
// si segnano subito, senza cercarli.
export function createJob({ source, entries }, { fileName = '', watchlistIds = new Set(), now = new Date() } = {}) {
	const seen = new Set();
	const items = entries.map((entry, index) => {
		const key = entry.imdbId || `${normalizeTitle(entry.title)}|${entry.year}`;
		let status = 'pending';
		if (seen.has(key)) status = 'skipped';
		else if (entry.imdbId && watchlistIds.has(entry.imdbId)) status = 'duplicate';
		seen.add(key);
		return { key: `${index}`, ...entry, status, movie: null, candidates: [] };
	});
	return { source, fileName, startedAt: now.toISOString(), items };
}

// Titolo confrontabile: senza accenti, punteggiatura, maiuscole e articolo iniziale inglese.
export function normalizeTitle(title) {
	return String(title || '')
		.normalize('NFD').replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.replace(/^(the|a|an) /, '');
}

const MAX_CANDIDATES = 5;

// Abbinamento di una voce con i risultati della ricerca IMDb (già nel formato di parseImdbResults).
// Restituisce { status: 'matched', movie } oppure { status: 'doubt', candidates } (anche vuoto: nessun risultato).
export function matchEntry(entry, results) {
	const usable = results.filter(result => result.type !== 'episode');
	if (entry.imdbId) {
		const found = results.find(result => result.id === entry.imdbId);
		// Con IMDb l'id è sicuro: se la ricerca non lo trova si usano titolo, anno e tipo del CSV (senza locandina).
		return { status: 'matched', movie: found ? { ...found, type: found.type || entry.type } : { id: entry.imdbId, title: entry.title, year: entry.year, type: entry.type, poster: '', stars: '' } };
	}
	const wanted = normalizeTitle(entry.title);
	const year = Number(entry.year) || 0;
	const sameTitle = usable.filter(result => normalizeTitle(result.title) === wanted);
	const exact = sameTitle.filter(result => year && Number(result.year) === year);
	if (exact.length === 1) return { status: 'matched', movie: exact[0] };
	const close = sameTitle.filter(result => year && Math.abs(Number(result.year) - year) <= 1);
	if (!exact.length && close.length === 1) return { status: 'matched', movie: close[0] };
	if (!year && sameTitle.length === 1) return { status: 'matched', movie: sameTitle[0] };
	const candidates = (exact.length ? exact : close.length ? close : sameTitle.length ? sameTitle : usable).slice(0, MAX_CANDIDATES);
	return { status: 'doubt', candidates };
}

// Ricerche da fare per una voce, nell'ordine: con IMDb l'id; con Letterboxd titolo e anno, poi solo il titolo.
export const queriesFor = entry => (entry.imdbId ? [entry.imdbId] : [entry.year ? `${entry.title} ${entry.year}` : '', entry.title].filter(Boolean));

// Abbina le voci ancora da fare, una ricerca alla volta con una pausa tra l'una e l'altra.
// Si ferma quando shouldStop() risponde true o se la rete non va: il lavoro resta salvato e si riprende dopo.
export async function runMatching(job, { search, wait, delayMs = 500, watchlistIds = new Set(), shouldStop = () => false, onProgress = () => {}, save = async () => {} }) {
	const total = job.items.length;
	const finished = () => job.items.filter(item => item.status !== 'pending').length;
	let sinceSave = 0;
	try {
		for (const item of job.items) {
			if (item.status !== 'pending') continue;
			if (shouldStop()) break;
			let outcome = null;
			for (const query of queriesFor(item)) {
				const attempt = matchEntry(item, await search(query));
				// Tra due ricerche senza un risultato certo si tengono i candidati della prima che ne ha.
				if (attempt.status === 'matched' || !outcome?.candidates?.length) outcome = attempt;
				if (outcome.status === 'matched') break;
				await wait(delayMs);
			}
			Object.assign(item, outcome);
			if (item.status === 'matched') markDuplicate(job, item, watchlistIds);
			onProgress({ done: finished(), total });
			sinceSave += 1;
			if (sinceSave >= 10) {
				sinceSave = 0;
				await save(job);
			}
			await wait(delayMs);
		}
	} finally {
		// Anche quando la rete si interrompe: quello già abbinato resta.
		await save(job);
	}
	return job;
}

// Un titolo abbinato che è già nella watchlist, o già abbinato a un'altra riga del file, non si importa due volte.
function markDuplicate(job, item, watchlistIds) {
	if (watchlistIds.has(item.movie.id)) item.status = 'duplicate';
	else if (job.items.some(other => other !== item && other.status === 'matched' && other.movie?.id === item.movie.id)) item.status = 'skipped';
}

// Scelta fatta dall'utente per un titolo dubbio: un candidato (per id) oppure null per saltarlo.
export function resolveDoubt(job, key, candidateId, { watchlistIds = new Set() } = {}) {
	const item = job.items.find(entry => entry.key === key);
	if (!item) return job;
	const chosen = item.candidates.find(candidate => candidate.id === candidateId);
	if (chosen) {
		item.status = 'matched';
		item.movie = chosen;
		markDuplicate(job, item, watchlistIds);
	} else item.status = 'skipped';
	return job;
}

export function jobSummary(job) {
	const count = status => job.items.filter(item => item.status === status).length;
	return { total: job.items.length, pending: count('pending'), matched: count('matched'), doubts: count('doubt'), duplicates: count('duplicate'), skipped: count('skipped') };
}

// Titoli da salvare nella watchlist, con la data di aggiunta originale e la provenienza.
export const moviesToImport = job => job.items
	.filter(item => item.status === 'matched')
	.map(item => ({ ...item.movie, addedAt: item.addedAt, source: job.source }));
