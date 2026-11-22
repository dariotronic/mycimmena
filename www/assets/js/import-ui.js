// Finestra "Importa watchlist" (PIANO.md, §9): come scaricare il file da Letterboxd o IMDb, scelta del file,
// abbinamento con l'indicatore "Abbinamento 34/120", riepilogo con i titoli da controllare, salvataggio.
// Si può chiudere a metà: il lavoro resta salvato e alla riapertura si riprende.
import { escapeHtml, movieName } from './domain.js';
import { searchImdb } from './imdb.js';
import { hydrateIcons } from './icons.js';
import { showErrorToast, showToast } from './toasts.js';
import { createJob, IMPORT_SOURCES, jobSummary, moviesToImport, readWatchlistFile, resolveDoubt, runMatching } from './watchlist-import.js';

// Passaggi per scaricare il file, uguali nell'onboarding e qui.
export const importHowTo = () => `
	<div class="onboarding-import">
		<section>
			<h2>Letterboxd</h2>
			<ol>
				<li>Apri letterboxd.com dal browser (nell'app di Letterboxd l'esportazione non c'è).</li>
				<li>Impostazioni → scheda <strong>Data</strong> → <strong>Export your data</strong>.</li>
				<li>Si scarica un file <code>.zip</code>: myCimmena lo legge così com'è.</li>
			</ol>
		</section>
		<section>
			<h2>IMDb</h2>
			<ol>
				<li>Apri imdb.com e la tua <strong>Watchlist</strong>.</li>
				<li>Menu <strong>⋯</strong> → <strong>Export</strong>.</li>
				<li>Dalla pagina <strong>Your exports</strong> scarica il file <code>.csv</code> quando è pronto.</li>
			</ol>
		</section>
	</div>
`;

const FILE_ACCEPT = '.csv,.zip,text/csv,text/comma-separated-values,application/zip,application/x-zip-compressed,application/octet-stream';

const candidateButton = (item, candidate) => `
	<button class="import-candidate" type="button" data-import-pick="${escapeHtml(item.key)}" data-movie-id="${escapeHtml(candidate.id)}">
		${candidate.poster ? `<img src="${escapeHtml(candidate.poster.replace(/\._V1_.*\.jpg$/, '._V1_SX120.jpg'))}" alt="" loading="lazy">` : '<span class="import-candidate-empty" aria-hidden="true"></span>'}
		<span><strong>${escapeHtml(movieName(candidate))}</strong>${candidate.stars ? `<small>${escapeHtml(candidate.stars)}</small>` : ''}</span>
	</button>
`;

export function renderImportBody({ job, phase, progress = null, error = '' }) {
	if (!job) {
		return `
			<p>Porta in myCimmena i film da vedere salvati su Letterboxd o IMDb. Prima scarica il file dal sito:</p>
			${importHowTo()}
			<label class="button file-button">Scegli il file (.zip o .csv)<input type="file" accept="${FILE_ACCEPT}" data-import-file></label>
			${error ? `<p class="status-message error" role="alert">${escapeHtml(error)}</p>` : ''}
		`;
	}
	const summary = jobSummary(job);
	const source = IMPORT_SOURCES[job.source] || job.source;
	if (phase === 'matching' || summary.pending) {
		const done = progress?.done ?? summary.total - summary.pending;
		return `
			<p>Watchlist di ${escapeHtml(source)}${job.fileName ? ` (${escapeHtml(job.fileName)})` : ''}: cerco ogni titolo su IMDb.</p>
			<div class="import-progress">
				<progress max="${summary.total}" value="${done}"></progress>
				<p role="status">Abbinamento ${done}/${summary.total}</p>
			</div>
			${error ? `<p class="status-message error" role="alert">${escapeHtml(error)}</p>` : ''}
			<div class="button-row">
				${phase === 'matching'
					? '<button class="button secondary" type="button" data-import-stop>Interrompi</button><p class="help-text">Puoi chiudere: quello già abbinato resta, e riprendi quando vuoi.</p>'
					: '<button class="button" type="button" data-import-resume>Riprendi l’abbinamento</button><button class="text-button" type="button" data-import-discard>Annulla l’importazione</button>'}
			</div>
		`;
	}
	const doubts = job.items.filter(item => item.status === 'doubt');
	const matched = job.items.filter(item => item.status === 'matched');
	const parts = [`${summary.matched} ${summary.matched === 1 ? 'trovato' : 'trovati'}`];
	if (summary.doubts) parts.push(`${summary.doubts} da controllare`);
	if (summary.duplicates) parts.push(`${summary.duplicates} già nella tua watchlist`);
	if (summary.skipped) parts.push(`${summary.skipped} ${summary.skipped === 1 ? 'saltato' : 'saltati'}`);
	return `
		<p class="import-summary"><strong>${escapeHtml(parts.join(', '))}.</strong></p>
		${doubts.length ? `
			<section class="import-doubts" aria-labelledby="import-doubts-title">
				<h3 id="import-doubts-title">Da controllare</h3>
				<p class="help-text">Scegli il titolo giusto, oppure salta.</p>
				<ul>
					${doubts.map(item => `
						<li class="import-doubt">
							<p><strong>${escapeHtml(item.title)}</strong>${item.year ? ` (${escapeHtml(item.year)})` : ''}</p>
							${item.candidates.length ? `<div class="import-candidates">${item.candidates.map(candidate => candidateButton(item, candidate)).join('')}</div>` : '<p class="help-text">Nessun risultato su IMDb: potrai cercarlo a mano.</p>'}
							<button class="text-button" type="button" data-import-pick="${escapeHtml(item.key)}" data-movie-id="">Salta</button>
						</li>
					`).join('')}
				</ul>
			</section>
		` : ''}
		${matched.length ? `
			<details class="import-found">
				<summary>Titoli trovati (${matched.length})</summary>
				<ul>${matched.map(item => `<li>${escapeHtml(movieName(item.movie))}</li>`).join('')}</ul>
			</details>
		` : ''}
		<div class="button-row">
			${matched.length ? `<button class="button" type="button" data-import-commit>Importa ${matched.length} ${matched.length === 1 ? 'titolo' : 'titoli'}</button>` : ''}
			<button class="text-button" type="button" data-import-discard>Annulla l’importazione</button>
		</div>
		${doubts.length && matched.length ? '<p class="help-text">I titoli da controllare che non scegli restano fuori.</p>' : ''}
	`;
}

export function createImportUi({ store, getData, refresh, askConfirmation, onImported = () => {}, search = query => searchImdb(query), wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
	const dialog = document.getElementById('import-dialog');
	const body = document.getElementById('import-body');
	let job = null;
	let phase = 'idle';
	let progress = null;
	let error = '';
	let stopRequested = false;
	let onDone = () => {};

	const watchlistIds = () => new Set((getData().movies || []).map(movie => movie.id));

	function draw() {
		body.innerHTML = renderImportBody({ job, phase, progress, error });
		hydrateIcons(body);
	}

	// afterImport: per l'onboarding, che passa al passaggio successivo quando l'importazione è finita.
	async function open({ afterImport = () => {} } = {}) {
		onDone = afterImport;
		error = '';
		if (phase !== 'matching') job = await store.getImportJob();
		draw();
		if (!dialog.open) dialog.showModal();
	}

	async function match() {
		phase = 'matching';
		stopRequested = false;
		error = '';
		draw();
		try {
			await runMatching(job, {
				search,
				wait,
				watchlistIds: watchlistIds(),
				shouldStop: () => stopRequested,
				onProgress: value => {
					progress = value;
					if (dialog.open) {
						const bar = body.querySelector('.import-progress progress');
						if (bar) bar.value = value.done;
						const label = body.querySelector('.import-progress p');
						if (label) label.textContent = `Abbinamento ${value.done}/${value.total}`;
					}
				},
				save: value => store.saveImportJob(value)
			});
		} catch (problem) {
			error = `${problem.message} Quello già abbinato resta: riprendi quando vuoi.`;
		} finally {
			phase = 'idle';
			progress = null;
		}
		await refresh();
		if (dialog.open) draw();
		else if (!jobSummary(job).pending) showToast('importMatched');
	}

	async function chooseFile(file) {
		error = '';
		try {
			const parsed = await readWatchlistFile(file);
			job = createJob(parsed, { fileName: file.name, watchlistIds: watchlistIds() });
			await store.saveImportJob(job);
		} catch (problem) {
			job = null;
			error = problem.message;
			draw();
			return;
		}
		await match();
	}

	async function commit() {
		const movies = moviesToImport(job);
		const added = await store.addToWatchlist(movies);
		await store.clearImportJob();
		job = null;
		await refresh();
		dialog.close();
		showToast('watchlistImported', { count: added.length });
		onImported(added);
		onDone();
	}

	async function discard() {
		if (!(await askConfirmation('L’importazione verrà annullata e i titoli abbinati finora andranno persi. Continuare?'))) return;
		await store.clearImportJob();
		job = null;
		await refresh();
		draw();
	}

	body.addEventListener('click', async event => {
		try {
			if (event.target.closest('[data-import-stop]')) {
				stopRequested = true;
				return;
			}
			if (phase === 'matching') return;
			if (event.target.closest('[data-import-resume]')) return void await match();
			if (event.target.closest('[data-import-discard]')) return void await discard();
			if (event.target.closest('[data-import-commit]')) return void await commit();
			const pick = event.target.closest('[data-import-pick]');
			if (pick) {
				resolveDoubt(job, pick.dataset.importPick, pick.dataset.movieId || null, { watchlistIds: watchlistIds() });
				await store.saveImportJob(job);
				draw();
			}
		} catch (problem) {
			showErrorToast(problem);
		}
	});
	body.addEventListener('change', event => {
		const input = event.target.closest('[data-import-file]');
		if (input?.files?.[0]) chooseFile(input.files[0]);
	});
	document.getElementById('import-close').addEventListener('click', () => dialog.close());

	return { open, chooseFile };
}
