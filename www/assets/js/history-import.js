// Importazione di diario e voti da Letterboxd e IMDb (PIANO.md, Fase 5). Usa lo stesso abbinamento dei titoli
// della watchlist (watchlist-import.js): qui si leggono i file e si trasformano le righe in visioni.
//
// Letterboxd (lo zip di "Export your data", o uno dei suoi CSV):
// - diary.csv    una riga per visione: Date, Name, Year, Letterboxd URI, Rating (0,5–5 stelle), Rewatch, Tags, Watched Date
// - reviews.csv  come diary.csv più Review: il testo diventa la nota della visione dello stesso giorno
// - ratings.csv  il voto per film (Date = quando l'hai dato): finisce sulla visione più recente senza voto,
//                o diventa una visione se il film non è nel diario
// - watched.csv  i film segnati come visti senza diario: una visione con la data in cui li hai segnati
// Le stelle diventano spipe raddoppiandole (3,5 stelle → 7 spipe).
//
// IMDb: il CSV dei voti ("Your Ratings" → ⋯ → Export): Const, Your Rating (1–10), Date Rated, Title, Title Type, Year…
// Ogni voto diventa una visione con la data del voto; per le serie è il voto alla serie.
import { normalizeTitle, parseCsv } from './watchlist-import.js';
import { isZip, readZipEntry, zipEntries } from './zip.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLES = 5000;

function records(text) {
	const [header = [], ...rows] = parseCsv(text);
	const columns = header.map(name => name.trim());
	return { columns, rows: rows.map(cells => Object.fromEntries(columns.map((name, index) => [name, String(cells[index] ?? '').trim()]))) };
}

const stars = value => {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? Math.min(10, Math.max(0.5, Math.round(number * 4) / 2)) : null;
};
const tenScale = value => {
	const number = Number(value);
	return Number.isFinite(number) && number >= 1 && number <= 10 ? Math.round(number * 2) / 2 : null;
};

// Testo di una recensione di Letterboxd in HTML per l'editor delle note (che lo filtra comunque con sanitize.js).
export function reviewToHtml(text) {
	const value = String(text || '').trim();
	if (!value) return '';
	if (/<(p|br|i|em|b|strong|blockquote)\b/i.test(value)) return value;
	const escape = part => part.replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
	return value.split(/\n{2,}/).map(paragraph => `<p>${escape(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
}

// Che file di Letterboxd è, dalle colonne.
function letterboxdKind(columns, fileName = '') {
	if (!columns.includes('Name') || !columns.includes('Letterboxd URI')) return null;
	if (columns.includes('Review')) return 'reviews';
	if (columns.includes('Watched Date')) return 'diary';
	if (columns.includes('Rating')) return 'ratings';
	if (/watchlist/i.test(fileName)) return 'watchlist';
	return 'watched';
}

// Dai file di Letterboxd (per nome: diary, reviews, ratings, watched) alle voci da abbinare, una per film,
// ciascuna con le sue visioni.
export function letterboxdHistory(files) {
	const films = new Map();
	const film = row => {
		const key = `${normalizeTitle(row.Name)}|${row.Year}`;
		if (!films.has(key)) films.set(key, { imdbId: '', title: row.Name, year: String(row.Year || '').slice(0, 4), type: 'movie', addedAt: null, viewings: [] });
		return films.get(key);
	};
	const dateOf = row => (DATE.test(row['Watched Date'] || '') ? row['Watched Date'] : DATE.test(row.Date || '') ? row.Date : null);
	for (const row of files.diary || []) {
		const date = dateOf(row);
		if (row.Name && date) film(row).viewings.push({ date, rating: stars(row.Rating), notes: '' });
	}
	for (const row of files.reviews || []) {
		const date = dateOf(row);
		if (!row.Name || !date) continue;
		const entry = film(row);
		const notes = reviewToHtml(row.Review);
		const same = entry.viewings.find(viewing => viewing.date === date && !viewing.notes);
		if (same) same.notes = notes;
		else entry.viewings.push({ date, rating: stars(row.Rating), notes });
	}
	for (const row of files.ratings || []) {
		const rating = stars(row.Rating);
		if (!row.Name || rating === null) continue;
		const entry = film(row);
		const unrated = [...entry.viewings].sort((a, b) => b.date.localeCompare(a.date)).find(viewing => viewing.rating === null);
		if (unrated) unrated.rating = rating;
		else if (!entry.viewings.length && DATE.test(row.Date || '')) entry.viewings.push({ date: row.Date, rating, notes: '' });
	}
	for (const row of files.watched || []) {
		if (!row.Name || !DATE.test(row.Date || '')) continue;
		const entry = film(row);
		if (!entry.viewings.length) entry.viewings.push({ date: row.Date, rating: null, notes: '' });
	}
	return [...films.values()].filter(entry => entry.viewings.length);
}

export function imdbHistory(rows) {
	const typeOf = value => (/episode/i.test(value) ? 'episode' : /series/i.test(value) ? 'series' : 'movie');
	return rows
		.map(row => ({
			imdbId: /^tt\d{1,20}$/.test(row.Const || '') ? row.Const : '',
			title: row.Title,
			year: String(row.Year || '').slice(0, 4),
			type: typeOf(row['Title Type']),
			addedAt: null,
			viewings: DATE.test(row['Date Rated'] || '') && tenScale(row['Your Rating']) !== null ? [{ date: row['Date Rated'], rating: tenScale(row['Your Rating']), notes: '' }] : []
		}))
		.filter(entry => entry.imdbId && entry.title && entry.type !== 'episode' && entry.viewings.length);
}

const finish = (source, entries) => {
	if (!entries.length) throw new Error('Nel file non ci sono visioni o voti da importare.');
	if (entries.length > MAX_TITLES) throw new Error(`Ci sono più di ${MAX_TITLES} titoli: è troppo da importare in una volta.`);
	return { source, entries };
};

// Da un file di testo (un CSV qualsiasi dei due servizi).
export function historyFromCsv(text, fileName = '') {
	const { columns, rows } = records(text);
	if (columns.includes('Const') && columns.includes('Your Rating')) {
		if (columns.includes('Position')) throw new Error('Questa è la watchlist di IMDb: per il diario scegli il file dei voti (pagina "Your Ratings" → ⋯ → Export).');
		return finish('imdb', imdbHistory(rows));
	}
	if (columns.includes('Const')) throw new Error('Questa è la watchlist di IMDb: per il diario scegli il file dei voti (pagina "Your Ratings" → ⋯ → Export).');
	const kind = letterboxdKind(columns, fileName);
	if (kind === 'watchlist') throw new Error('Questa è la watchlist di Letterboxd: per il diario scegli lo zip intero, oppure diary.csv.');
	if (!kind) throw new Error('Il file non sembra un diario o dei voti di Letterboxd o di IMDb: controlla di aver scelto il file giusto.');
	return finish('letterboxd', letterboxdHistory({ [kind]: rows }));
}

export async function readHistoryFile(file) {
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (!isZip(bytes)) return historyFromCsv(new TextDecoder().decode(bytes), file.name);
	const entries = zipEntries(bytes);
	const files = {};
	for (const kind of ['diary', 'reviews', 'ratings', 'watched']) {
		const entry = entries.find(item => item.name === `${kind}.csv`);
		if (entry) files[kind] = records(new TextDecoder().decode(await readZipEntry(bytes, entry))).rows;
	}
	if (!Object.keys(files).length) throw new Error('Nello zip non ci sono diary.csv, ratings.csv o watched.csv: è l’esportazione di Letterboxd?');
	return finish('letterboxd', letterboxdHistory(files));
}

// Visioni da salvare: per ogni titolo abbinato, le sue visioni. Le serie di IMDb hanno il voto alla serie.
export const viewingsToImport = job => job.items
	.filter(item => item.status === 'matched')
	.map(item => ({
		movie: item.movie,
		viewings: item.viewings.map(viewing => ({ ...viewing, ...((item.movie.type || item.type) === 'series' ? { scope: 'series', round: 1 } : {}) }))
	}));

export const viewingCount = job => job.items.filter(item => item.status === 'matched').reduce((sum, item) => sum + (item.viewings?.length || 0), 0);
