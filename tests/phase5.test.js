// Fase 5: statistiche, importazione di diario e voti, aggiornamento dentro l'app, release automatica.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { computeStats, roundHalf, statsYears } from '../www/assets/js/stats.js';
import { renderStats } from '../www/assets/js/stats-ui.js';
import { historyFromCsv, imdbHistory, readHistoryFile, reviewToHtml, viewingCount, viewingsToImport } from '../www/assets/js/history-import.js';
import { createJob, resolveDoubt, runMatching } from '../www/assets/js/watchlist-import.js';
import { renderImportBody } from '../www/assets/js/import-ui.js';
import { createStore } from '../www/assets/js/store.js';

const movie = (id, title, extra = {}) => ({ id, title, year: '1982', type: 'movie', has_details: true, ...extra });
const thing = movie('tt0084787', 'The Thing', { director: 'John Carpenter', genre: 'Horror, Sci-Fi', runtime: '109 min' });
const alien = movie('tt0078748', 'Alien', { year: '1979', director: 'Ridley Scott', genre: 'Horror, Sci-Fi', runtime: '117 min' });
const dark = movie('tt5753856', 'Dark', { type: 'series', director: null, genre: 'Drama, Mystery', runtime: '60 min' });
const data = {
	profile: { director: 'John Carpenter' },
	viewings: [
		{ movieId: thing.id, movie: thing, date: '2026-11-02', rating: 9 },
		{ movieId: thing.id, movie: thing, date: '2025-10-31', rating: 8 },
		{ movieId: alien.id, movie: alien, date: '2026-03-01', rating: 7.5 },
		{ movieId: dark.id, movie: dark, date: '2026-11-10', scope: 'episodes', episodes: [{ s: 1, e: 1 }, { s: 1, e: 2 }], rating: null },
		{ movieId: dark.id, movie: dark, date: '2026-11-12', scope: 'series', rating: 10, label: 'Voto alla serie' }
	]
};

test('counts viewings, films, episodes, hours and ratings', () => {
	const all = computeStats(data, { today: '2026-11-23' });
	assert.equal(all.watches, 4, 'il voto alla serie non è una visione');
	assert.equal(all.films, 2);
	assert.equal(all.rewatches, 1);
	assert.deepEqual([all.series, all.episodes], [1, 2]);
	assert.equal(all.hours, Math.round((109 * 2 + 117 + 60 * 2) / 60));
	assert.equal(all.rated, 4);
	assert.equal(all.average, roundHalf((9 + 8 + 7.5 + 10) / 4));
	assert.equal(all.perMonth.length, 12);
	assert.deepEqual(all.perMonth.at(-1), { key: '2026-11', label: 'nov', year: '2026', count: 2 });
	assert.equal(all.perMonth[0].key, '2025-12');
	assert.deepEqual(all.perYear.map(item => [item.key, item.count]), [['2025', 1], ['2026', 3]]);
	assert.deepEqual(all.ratingBuckets.map(item => item.count), [0, 0, 0, 0, 0, 0, 0, 2, 1, 1], '7½ va con l’8');
	assert.deepEqual(all.genres.slice(0, 2).map(item => [item.name, item.count]), [['Fantascienza', 3], ['Horror', 3]], 'a pari merito, in ordine alfabetico');
	assert.deepEqual(all.directors[0], { name: 'John Carpenter', count: 2, average: 8.5 });
	assert.deepEqual(all.favourite, { name: 'John Carpenter', count: 2, films: 1, average: 8.5, rank: 1 });
	assert.equal(all.best[0].rating, 10);
	const year = computeStats(data, { year: '2025', today: '2026-11-23' });
	assert.equal(year.watches, 1);
	assert.equal(year.perMonth[9].count, 1);
	assert.deepEqual(statsYears(data.viewings), ['2026', '2025']);
});

test('draws the statistics with one accent colour, tooltips and a table for every chart', () => {
	const html = renderStats(data, { today: '2026-11-23' });
	assert.match(html, /<select id="stats-year" data-stats-year>[\s\S]*<option value="2025">2025<\/option>/);
	assert.match(html, /<span class="stat-value">4<\/span><span class="stat-label">visioni in tutto<\/span>/);
	assert.match(html, /data-tip="nov 2026: 2 visioni"/);
	assert.match(html, /Visioni per anno/);
	assert.match(html, /Di <strong>John Carpenter<\/strong> hai visto 1 film \(2 visioni\) in tutto/);
	assert.equal((html.match(/Vedi come tabella/g) || []).length, 5);
	assert.match(renderStats({ viewings: [] }, { today: '2026-11-23' }), /Il diario è vuoto/);
	assert.match(renderStats(data, { year: '2024', today: '2026-11-23' }), /Nel 2024 non ci sono visioni/);
});

function makeZip(files) {
	const locals = [];
	const centrals = [];
	let offset = 0;
	for (const [name, content] of Object.entries(files)) {
		const nameBytes = Buffer.from(name);
		const raw = Buffer.from(content);
		const data = deflateRawSync(raw);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
		locals.push(local, nameBytes, data);
		centrals.push(central, nameBytes);
		offset += local.length + nameBytes.length + data.length;
	}
	const size = centrals.reduce((sum, part) => sum + part.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
	const bytes = new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
	return { name: 'letterboxd.zip', arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

test('turns the Letterboxd export into viewings: diary, reviews, ratings and watched films', async () => {
	const file = makeZip({
		'diary.csv': 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-11-01,The Thing,1982,https://boxd.it/1,4.5,,,2024-10-31\n2025-11-01,The Thing,1982,https://boxd.it/2,,Yes,,2025-10-31\n2024-02-02,Alien,1979,https://boxd.it/3,3.5,,,2024-02-01\n',
		'reviews.csv': 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n2024-02-02,Alien,1979,https://boxd.it/3,3.5,,"Nello spazio\n\nnessuno <ti> sente",,2024-02-01\n',
		'ratings.csv': 'Date,Name,Year,Letterboxd URI,Rating\n2025-11-02,The Thing,1982,https://boxd.it/a,5\n2023-05-05,Solaris,1972,https://boxd.it/b,4\n',
		'watched.csv': 'Date,Name,Year,Letterboxd URI\n2023-01-01,Persona,1966,https://boxd.it/c\n2023-05-05,Solaris,1972,https://boxd.it/b\n',
		'watchlist.csv': 'Date,Name,Year,Letterboxd URI\n2023-01-01,Stalker,1979,https://boxd.it/d\n'
	});
	const { source, entries } = await readHistoryFile(file);
	assert.equal(source, 'letterboxd');
	const byTitle = Object.fromEntries(entries.map(entry => [entry.title, entry.viewings]));
	assert.deepEqual(Object.keys(byTitle).sort(), ['Alien', 'Persona', 'Solaris', 'The Thing'], 'la watchlist resta fuori');
	assert.deepEqual(byTitle['The Thing'], [{ date: '2024-10-31', rating: 9, notes: '' }, { date: '2025-10-31', rating: 10, notes: '' }], 'il voto di ratings.csv va sulla visione più recente senza voto');
	assert.deepEqual(byTitle.Alien, [{ date: '2024-02-01', rating: 7, notes: '<p>Nello spazio</p><p>nessuno &lt;ti&gt; sente</p>' }]);
	assert.deepEqual(byTitle.Solaris, [{ date: '2023-05-05', rating: 8, notes: '' }]);
	assert.deepEqual(byTitle.Persona, [{ date: '2023-01-01', rating: null, notes: '' }]);
	assert.equal(reviewToHtml('<i>già</i> HTML'), '<i>già</i> HTML');
	assert.throws(() => historyFromCsv('Date,Name,Year,Letterboxd URI\n2023-01-01,X,2000,u\n', 'watchlist.csv'), /watchlist di Letterboxd/);
	assert.throws(() => historyFromCsv('Position,Const,Created,Title,Your Rating\n1,tt1,2024-01-01,X,\n'), /watchlist di IMDb/);
	assert.throws(() => historyFromCsv('a,b\n1,2\n'), /non sembra un diario/);
});

test('turns IMDb ratings into viewings, series as the vote to the whole series, and saves them once', async () => {
	const imdb = historyFromCsv('Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors\ntt0084787,9,2024-10-31,The Thing,,u,Movie,8.2,109,1982,Horror,1,1982-06-25,John Carpenter\ntt5753856,10,2025-01-10,Dark,,u,TV Series,8.7,60,2017,Drama,1,2017-12-01,\ntt1,7,2025-01-11,Episodio,,u,TV Episode,8,50,2017,Drama,1,2017-12-01,\n');
	assert.equal(imdb.source, 'imdb');
	assert.deepEqual(imdb.entries.map(entry => [entry.imdbId, entry.type, entry.viewings[0].rating]), [['tt0084787', 'movie', 9], ['tt5753856', 'series', 10]], 'gli episodi restano fuori');
	assert.equal(imdbHistory([{ Const: 'tt2', Title: 'X', 'Your Rating': '11', 'Date Rated': '2024-01-01' }]).length, 0);

	const job = { ...createJob(imdb), kind: 'diary' };
	await runMatching(job, { search: async query => [{ id: query, title: query === 'tt5753856' ? 'Dark' : 'The Thing', year: '1982', type: query === 'tt5753856' ? 'series' : 'movie', poster: '', stars: '' }], wait: async () => {} });
	assert.equal(viewingCount(job), 2);
	const html = renderImportBody({ job, phase: 'idle' });
	assert.match(html, /Importa 2 visioni/);
	assert.match(renderImportBody({ job: null, kind: 'diary' }), /Your Ratings[\s\S]*3½ stelle = 7 spipe/);
	const list = viewingsToImport(job);
	assert.deepEqual(list[1].viewings, [{ date: '2025-01-10', rating: 10, notes: '', scope: 'series', round: 1 }]);

	const store = createStore({ indexedDB: new IDBFactory(), name: 'test' });
	assert.deepEqual(await store.importViewings(list), { added: 2, skipped: 0 });
	assert.deepEqual(await store.importViewings(list), { added: 0, skipped: 2 }, 'importare due volte non crea doppioni');
	const state = await store.loadAll();
	assert.equal(state.viewings.length, 2);
	assert.equal(state.watchlist.length, 0, 'il diario non tocca la watchlist');
	assert.equal(state.viewings.find(viewing => viewing.movieId === 'tt5753856').scope, 'series');
	resolveDoubt(job, '0', null);
	assert.equal(viewingCount(job), 1);
});

test('ships the in-app updater plugin and the release workflow without any secret in the repo', () => {
	const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
	const plugin = read('../android/app/src/main/java/it/mycimmena/app/UpdaterPlugin.java');
	assert.match(plugin, /@CapacitorPlugin\(name = "Updater"\)/);
	assert.match(plugin, /URL_PREFIX = "https:\/\/github\.com\/dariotronic\/mycimmena\/releases\/download\/"/);
	assert.match(plugin, /PACKAGE = "it\.mycimmena\.app"/);
	assert.match(plugin, /signatures\(installed\), signatures\(info\)/);
	assert.match(read('../android/app/src/main/java/it/mycimmena/app/MainActivity.java'), /registerPlugin\(UpdaterPlugin\.class\)/);
	assert.match(read('../android/app/src/main/AndroidManifest.xml'), /REQUEST_INSTALL_PACKAGES/);
	const workflow = read('../.github/workflows/release.yml');
	assert.match(workflow, /secrets\.MYCIMMENA_KEYSTORE_BASE64/);
	assert.match(workflow, /release-notes\/\$VERSION\.md/);
	assert.doesNotMatch(workflow, /storePassword=[A-Za-z0-9]/);
	const mode = execFileSync('git', ['ls-files', '-s', 'android/gradlew'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
	assert.match(mode, /^100755/, 'gradlew eseguibile per il runner Linux');
});

test('uses the recoloured Club logo (proposal A, "Velluto") as the app icon', async () => {
	const read = path => readFileSync(new URL(path, import.meta.url));
	const { recolorLogo, PAPER, STOPS } = await import('../tools/icons.js');
	assert.equal(PAPER, '#f8f2ef');
	const original = read('../www/assets/logo.svg').toString();
	assert.equal(read('../www/assets/logo-my.svg').toString(), recolorLogo(original), 'logo-my.svg è aggiornato: node tools/icons.js');
	const fills = [...recolorLogo(original).matchAll(/fill:(#[0-9a-f]{6})/g)].map(match => match[1]);
	assert.ok(fills.includes(STOPS[0]) && fills.includes(STOPS.at(-1)), 'il più scuro e il più chiaro vanno agli estremi della rampa');
	assert.match(read('../android/app/src/main/res/values/ic_launcher_background.xml').toString(), /#F8F2EF/);
	const foreground = read('../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png');
	assert.deepEqual([foreground.readUInt32BE(16), foreground.readUInt32BE(20), foreground[25]], [432, 432, 6], 'primo piano 432×432 con trasparenza');
	assert.match(read('../android/app/src/main/res/values/styles.xml').toString(), /windowSplashScreenBackground">@color\/ic_launcher_background/);
});

test('opens the phone calendar and the Android share menu instead of downloading in the app', async () => {
	const { addMeetingToCalendar } = await import('../www/assets/js/calendar-file.js');
	const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
	let event = null;
	globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { Calendar: { addEvent: async options => { event = options; } } } };
	try {
		const meeting = { date: '2026-11-26', place: 'Casa', movies: [{ title: 'Bad Taste', year: '1987' }] };
		assert.equal(await addMeetingToCalendar(meeting, movie => `${movie.title} (${movie.year})`), 'opened');
		assert.deepEqual(event, { date: '2026-11-26', title: 'Serata film · myCimmena', location: 'Casa', description: 'In programma:\nBad Taste (1987)' });
		assert.equal(await addMeetingToCalendar({ place: 'Casa' }, String), false, 'senza data niente calendario');
	} finally {
		delete globalThis.Capacitor;
	}
	const java = read('../android/app/src/main/java/it/mycimmena/app/CalendarPlugin.java');
	assert.match(java, /@CapacitorPlugin\(name = "Calendar"\)/);
	assert.match(java, /new Intent\(Intent\.ACTION_INSERT\)\s*\.setData\(CalendarContract\.Events\.CONTENT_URI\)/);
	assert.match(read('../android/app/src/main/java/it/mycimmena/app/MainActivity.java'), /registerPlugin\(CalendarPlugin\.class\)/);
	const share = read('../www/assets/js/share.js');
	assert.match(share, /plugins\.Filesystem\.writeFile\(\{ path: fileName, data: await blobToBase64\(blob\), directory: 'CACHE' \}\)/);
	assert.match(share, /plugins\.Share\.share\(\{ title: 'La prossima serata', files: \[uri\]/);
});

test('signs the shared evening image as myCimmena, not as the Club', () => {
	const share = readFileSync(new URL('../www/assets/js/share.js', import.meta.url), 'utf8');
	assert.match(share, /context\.fillText\('MYCIMMENA', margin, footerY \+ 30\)/);
	assert.doesNotMatch(share, /CLUB DEL CIMMENA/);
});

test('does not redraw the page in the background while the randomizer reels are spinning', () => {
	const script = readFileSync(new URL('../www/script.js', import.meta.url), 'utf8');
	assert.match(script, /\|\| randomizer\.isSpinning\(\);/);
	assert.match(readFileSync(new URL('../www/assets/js/randomizer.js', import.meta.url), 'utf8'), /isSpinning: \(\) => Boolean\(rouletteTimer\)/);
});
