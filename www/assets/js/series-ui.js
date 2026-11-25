// Serie TV nella scheda del titolo e in "Stai guardando" (PIANO.md, §7): episodi visti, prossimo episodio, stato,
// stagioni da OMDb o scritte a mano, voti di stagione e serie. La logica pura sta in series.js, i dati in store.js.
import { escapeHtml, formatDate, formatSpipe, movieName, today } from './domain.js';
import { sanitizeNotes } from './sanitize.js';
import { applyReviewFormat, handleReviewInput, reviewTextLength, updateReviewCounter } from './review-editor.js';
import { hydrateIcons, icon } from './icons.js';
import { showErrorToast, showToast } from './toasts.js';
import {
	completedBy, customStructure, episodeKey, episodesUpTo, episodeTitle, formatEpisode, formatEpisodes, lostEpisodes,
	MAX_EPISODES, MAX_SEASONS, parseEpisodeKey, seasonProgress, SERIES_STATUSES, structureFromOmdb
} from './series.js';

const LONG_PRESS_MS = 550;

// Stagioni aperte nella scheda, per serie: la sezione si ridisegna a ogni salvataggio o quando arrivano gli episodi da
// OMDb, e senza questo si chiuderebbe la stagione appena aperta. Senza nessuna scelta si apre quella in corso.
const openSeasons = new Map();

const episodeLabel = (seasons, episode) => {
	const title = episodeTitle(seasons, episode);
	return title ? `${formatEpisode(episode)} «${title}»` : formatEpisode(episode);
};
const remainingText = count => (count === 1 ? '1 episodio rimasto' : `${count} episodi rimasti`);

// Nota generale sulla serie: per intero se c'è, con la matita; altrimenti il pulsante per scriverla.
function seriesNote(info) {
	const html = sanitizeNotes(info.notes || '').html;
	return html
		? `<div class="series-note"><div class="series-note-head"><span class="field-label">La tua nota</span><button class="icon-button small" type="button" data-series-note aria-label="Modifica la nota sulla serie" title="Modifica">${icon('edit')}</button></div><div class="review-content series-note-text">${html}</div></div>`
		: '<button class="text-button series-note-add" type="button" data-series-note>Scrivi una nota sulla serie</button>';
}

// Sezione "Episodi" della scheda di una serie.
export function renderSeriesSection(movie, info, { mode }) {
	const { seasons, watched, next, status, remaining, total } = info;
	// Stato della serie: si sceglie sempre, anche "Completata" (che arriva anche da sola con l'ultimo episodio).
	const statusChips = `
		<div class="series-status" role="group" aria-label="Stato della serie">
			${['watching', 'paused', 'finished', 'dropped'].map(value => `<button class="user-filter-chip${status === value ? ' active' : ''}" type="button" data-series-status="${value}" aria-pressed="${status === value}">${SERIES_STATUSES[value]}</button>`).join('')}
		</div>
		${seriesNote(info)}
	`;
	if (!seasons || !seasons.list.length) {
		const loading = mode === 'full' && !movie.has_details;
		return `
			<h3 class="movie-vote-title">Episodi</h3>
			${statusChips}
			${loading ? '<p class="help-text" role="status">Caricamento delle stagioni da OMDb…</p>' : ''}
			<div class="series-quick-structure">
				<p class="help-text">${mode === 'full' && !loading ? 'OMDb non conosce le stagioni di questa serie.' : 'Per tenere il segno degli episodi, indica le stagioni della serie.'} Per ogni stagione scegli quanti episodi ha.</p>
				<button class="button secondary" type="button" data-series-structure>Indica stagioni ed episodi</button>
			</div>
		`;
	}
	const current = next?.s || seasons.list[seasons.list.length - 1].n;
	const summary = next
		? `Prossimo: <strong>${escapeHtml(episodeLabel(seasons, next))}</strong> · ${escapeHtml(remainingText(remaining))}`
		: total ? 'Hai visto tutti gli episodi.' : '';
	const main = next
		? `<button class="button series-next" type="button" data-series-next data-movie-id="${escapeHtml(movie.id)}">${icon('task_alt')}<span>Visto ${escapeHtml(formatEpisode(next))}</span></button>`
		: status === 'finished' || (total && !remaining)
			? '<button class="button secondary" type="button" data-series-restart>Ricomincia da capo</button>'
			: '';
	const seasonBlocks = seasons.list.map(season => {
		const { seen } = seasonProgress(seasons, watched, season.n);
		const custom = season.source === 'custom' ? '<span class="series-custom-badge">inserita da te</span>' : '';
		const episodes = season.episodes
			? `<div class="episode-grid" role="group" aria-label="Episodi della stagione ${season.n}">${Array.from({ length: season.episodes }, (_, index) => {
				const episode = { s: season.n, e: index + 1 };
				const seenIt = watched.has(episodeKey(episode));
				const title = episodeTitle(seasons, episode);
				const detail = info.episodes?.get(episodeKey(episode));
				const label = `${formatEpisode(episode)}${title ? ` ${title}` : ''}${seenIt ? `, visto${detail?.date ? ` il ${formatDate(detail.date)}` : ''}` : ''}${detail?.hasNote ? ', con una nota' : ''}`;
				return `<button class="episode${seenIt ? ' seen' : ''}${detail?.hasNote ? ' has-note' : ''}" type="button" data-episode="${episodeKey(episode)}" aria-pressed="${seenIt}" aria-label="${escapeHtml(label)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${index + 1}</button>`;
			}).join('')}</div>
			<div class="series-season-actions">
				<label class="visually-hidden" for="season-date-${season.n}">Data della visione della stagione ${season.n}</label>
				<input id="season-date-${season.n}" type="date" value="${escapeHtml(today())}" max="${escapeHtml(today())}" data-season-date="${season.n}">
				<button class="text-button" type="button" data-season-all="${season.n}"${seen === season.episodes ? ' disabled' : ''}>Segna la stagione come vista</button>
				<button class="text-button" type="button" data-season-vote="${season.n}">${info.seasonVotes?.get(season.n)?.rating ? `Voto alla stagione: ${escapeHtml(formatSpipe(Number(info.seasonVotes.get(season.n).rating)))}` : 'Vota la stagione'}</button>
			</div>`
			: '<p class="help-text" role="status">Caricamento degli episodi…</p>';
		return `
			<details class="series-season" data-season="${season.n}"${(openSeasons.get(movie.id)?.has(season.n) ?? season.n === current) ? ' open' : ''}>
				<summary><span>Stagione ${season.n}</span>${custom}<span class="series-season-count">${seen}/${season.episodes || '?'}</span></summary>
				${episodes}
			</details>
		`;
	}).join('');
	return `
		<h3 class="movie-vote-title">Episodi</h3>
		${statusChips}
		${summary ? `<p class="series-summary">${summary}</p>` : ''}
		${main}
		<div class="series-seasons">${seasonBlocks}</div>
		<p class="series-hint help-text">Tocca un episodio per segnarlo o aprirlo nel diario (data, voto, note); tienilo premuto per segnare come visti anche tutti quelli prima, nella data della sua stagione.</p>
		<div class="series-structure-links">
			<button class="text-button" type="button" data-series-add-season>Aggiungi una stagione</button>
			<button class="text-button" type="button" data-series-structure>La struttura non è giusta?</button>
		</div>
	`;
}

// Riga di "Stai guardando" (Home e Watchlist).
export function renderWatchingRow(item, { poster }) {
	const { movie, next, remaining, status, seasons } = item;
	// Il prossimo episodio in evidenza (etichetta e titolo), sotto quanti ne mancano.
	const upNext = next && status !== 'paused';
	const meta = status === 'paused'
		? `In pausa${next ? ` · prossimo ${formatEpisode(next)}` : ''}`
		: next ? remainingText(remaining) : seasons ? 'Tutti gli episodi visti' : 'Struttura da indicare';
	const nextTitle = upNext ? episodeTitle(seasons, next) : '';
	return `
		<article class="watching-row">
			<button class="movie-poster-trigger" data-movie-id="${escapeHtml(movie.id)}" type="button" aria-label="Apri i dettagli di ${escapeHtml(movie.title)}">${poster(movie, 'archive-film-poster')}</button>
			<div class="watching-copy">
				<h3 class="archive-film-title">${escapeHtml(movieName(movie))}</h3>
				${upNext ? `<p class="watching-next"><span class="watching-next-label">Prossimo</span><strong>${escapeHtml(formatEpisode(next))}</strong>${nextTitle ? `<span class="watching-next-title">«${escapeHtml(nextTitle)}»</span>` : ''}</p>` : ''}
				<p class="movie-year">${escapeHtml(meta)}</p>
			</div>
			${next && status !== 'paused'
				? `<button class="icon-button series-next-quick" type="button" data-series-next data-movie-id="${escapeHtml(movie.id)}" aria-label="Segna ${escapeHtml(formatEpisode(next))} di ${escapeHtml(movie.title)} come visto" title="Visto ${escapeHtml(formatEpisode(next))}">${icon('task_alt')}</button>`
				: ''}
		</article>
	`;
}

// renderEditor: l'editor delle note del diario (views.js, richEditor), per la nota della serie.
export function createSeriesUi({ app, store, details, getData, getState, refresh, ask, askConfirmation, openViewing, refreshMovieInfo, renderEditor = () => '' }) {
	// Nota sulla serie: finestra con l'editor delle note del diario.
	const noteDialog = document.getElementById('series-note-dialog');
	const noteBody = document.getElementById('series-note-body');
	let noteMovieId = null;
	function openNoteEditor(movieId) {
		noteMovieId = movieId;
		const info = getData().seriesOf(movieId);
		noteBody.innerHTML = `
			<form class="series-note-form" data-series-note-form>
				<p class="viewing-form-title">${escapeHtml(movieName(getData().movieById(movieId)))}</p>
				${renderEditor({ label: 'Nota sulla serie', toolbarLabel: 'Formattazione della nota', textLabel: 'Nota sulla serie', content: sanitizeNotes(info.notes || '').html })}
				<div class="button-row review-form-actions">
					<button class="button icon-button-wide" type="submit" aria-label="Salva" title="Salva">${icon('save')}</button>
					<button class="button secondary icon-button-wide" type="button" data-series-note-cancel aria-label="Annulla" title="Annulla">${icon('close')}</button>
				</div>
			</form>
		`;
		hydrateIcons(noteBody);
		updateReviewCounter(noteBody.querySelector('form'));
		noteDialog.showModal();
		document.activeElement?.blur?.();
	}
	noteDialog.addEventListener('submit', async event => {
		event.preventDefault();
		const editor = noteBody.querySelector('[data-review-editor]');
		if (reviewTextLength(editor) > 20000) return void showErrorToast('La nota supera il limite di 20.000 caratteri.');
		try {
			await store.setSeriesNote(noteMovieId, editor.innerHTML);
			noteDialog.close();
			await refresh();
			showToast('seriesNoteSaved');
		} catch (error) {
			showErrorToast(error);
		}
	});
	noteDialog.addEventListener('click', event => {
		if (event.target.closest('[data-series-note-cancel]')) return void noteDialog.close();
		const format = event.target.closest('[data-review-format]');
		if (format) applyReviewFormat(format);
	});
	noteDialog.addEventListener('mousedown', event => {
		if (event.target.closest('[data-review-format]')) event.preventDefault();
	});
	noteDialog.addEventListener('input', handleReviewInput);
	noteDialog.addEventListener('close', () => {
		noteBody.innerHTML = '';
		noteMovieId = null;
	});

	const structureDialog = document.getElementById('series-structure-dialog');
	const structureBody = document.getElementById('series-structure-body');
	let structureMovieId = null;

	async function mark(movieId, episodes, date = today()) {
		const before = getData().seriesOf(movieId);
		try {
			await store.markEpisodes(movieId, episodes, { date });
			await refresh();
			showToast('episodesMarked', { label: formatEpisodes(episodes, before.seasons) });
		} catch (error) {
			showErrorToast(error);
			return;
		}
		await proposeVotes(movieId, before, episodes);
	}

	// Un episodio è una visione a sé nel diario: toccarlo apre la sua (data, dove, voto, note), o una nuova se non
	// è ancora segnato. Il salvataggio di una visione nuova passa da diary.js, che poi chiama proposeVotes.
	async function openEpisode(movieId, episode) {
		const info = getData().seriesOf(movieId);
		if (!info.watched.has(episodeKey(episode))) {
			openViewing({ movieId, scope: 'episodes', episode });
			return;
		}
		try {
			const viewingId = await store.splitEpisode(movieId, episode);
			await refresh();
			if (viewingId) openViewing({ viewingId });
		} catch (error) {
			showErrorToast(error);
		}
	}

	// Fine di una stagione o della serie con gli episodi appena segnati: si propone il voto (si può sempre saltare).
	async function proposeVotes(movieId, before, episodes) {
		if (!before.seasons) return;
		// Fine di una stagione o della serie: si propone il voto (si può sempre saltare).
		const done = completedBy(before.seasons, before.watched, episodes);
		const movie = getData().movieById(movieId);
		if (done.series) {
			await store.setSeriesStatus(movieId, 'finished');
			await refresh();
			if (await ask({ title: `Hai finito ${movie.title}!`, message: 'Vuoi darle un voto complessivo?', submitText: 'Dai un voto', cancelText: 'Più tardi' })) {
				openViewing({ movieId, scope: 'series' });
			}
			return;
		}
		for (const n of done.seasons) {
			if (await ask({ title: `Hai finito la stagione ${n}!`, message: `Vuoi dare un voto alla stagione ${n} di ${movie.title}?`, submitText: 'Dai un voto', cancelText: 'Più tardi' })) {
				openViewing({ movieId, scope: 'season', season: n });
				return;
			}
		}
	}

	// Tocco e pressione lunga sugli episodi: il tocco segna o toglie il segno, la pressione lunga segna fino a lì.
	let pressTimer = null;
	let longPressed = false;
	function seriesTarget(event) {
		const section = event.target.closest('[data-series-section]');
		return section ? { section, movieId: section.dataset.movieId } : null;
	}

	async function handleClick(event) {
		const next = event.target.closest('[data-series-next]');
		if (next) {
			const info = getData().seriesOf(next.dataset.movieId);
			if (info.next) await mark(next.dataset.movieId, [info.next]);
			return;
		}
		const target = seriesTarget(event);
		if (!target) return;
		const { movieId } = target;
		const episodeButton = event.target.closest('[data-episode]');
		if (episodeButton) {
			if (longPressed) {
				longPressed = false;
				return;
			}
			openEpisode(movieId, parseEpisodeKey(episodeButton.dataset.episode));
			return;
		}
		const all = event.target.closest('[data-season-all]');
		if (all) {
			const n = Number(all.dataset.seasonAll);
			const info = getData().seriesOf(movieId);
			const date = target.section.querySelector(`[data-season-date="${n}"]`)?.value || today();
			const season = info.seasons.list.find(item => item.n === n);
			const episodes = Array.from({ length: season.episodes }, (_, index) => ({ s: n, e: index + 1 })).filter(episode => !info.watched.has(episodeKey(episode)));
			if (episodes.length) await mark(movieId, episodes, date);
			return;
		}
		const vote = event.target.closest('[data-season-vote]');
		if (vote) {
			const n = Number(vote.dataset.seasonVote);
			const existing = getData().seriesOf(movieId).seasonVotes?.get(n);
			openViewing(existing ? { viewingId: existing.id } : { movieId, scope: 'season', season: n });
			return;
		}
		if (event.target.closest('[data-series-note]')) return void openNoteEditor(movieId);
		const status = event.target.closest('[data-series-status]');
		if (status) {
			try {
				await store.setSeriesStatus(movieId, status.dataset.seriesStatus);
				await refresh();
			} catch (error) {
				showErrorToast(error);
			}
			return;
		}
		if (event.target.closest('[data-series-restart]')) {
			if (!(await askConfirmation('Ricominciare la serie da capo? Le visioni di adesso restano nel diario.'))) return;
			await store.restartSeries(movieId);
			await refresh();
			return;
		}
		if (event.target.closest('[data-series-structure]')) openStructureEditor(movieId);
		// OMDb può essere indietro con le stagioni nuove: se ne aggiunge una a mano, nell'editor.
		if (event.target.closest('[data-series-add-season]')) openStructureEditor(movieId, { addSeason: true });
	}

	function handlePointerDown(event) {
		const episodeButton = event.target.closest('[data-episode]');
		const target = episodeButton && seriesTarget(event);
		if (!target) return;
		longPressed = false;
		window.clearTimeout(pressTimer);
		pressTimer = window.setTimeout(async () => {
			longPressed = true;
			const info = getData().seriesOf(target.movieId);
			const pressed = parseEpisodeKey(episodeButton.dataset.episode);
			const episodes = episodesUpTo(info.seasons, info.watched, pressed);
			// Nella data scelta nel campo della stagione dell'episodio (oggi, se non l'hai cambiata).
			const date = target.section.querySelector(`[data-season-date="${pressed.s}"]`)?.value || today();
			if (window.matchMedia('(pointer: coarse)').matches && typeof navigator.vibrate === 'function') navigator.vibrate(15);
			if (episodes.length) await mark(target.movieId, episodes, date);
		}, LONG_PRESS_MS);
	}
	const cancelPress = () => window.clearTimeout(pressTimer);

	// Aprire una stagione di OMDb non ancora scaricata la chiede a OMDb.
	function handleToggle(event) {
		const season = event.target.closest?.('details[data-season]');
		const target = season && seriesTarget(event);
		if (!target) return;
		if (!openSeasons.has(target.movieId)) openSeasons.set(target.movieId, new Set());
		openSeasons.get(target.movieId)[season.open ? 'add' : 'delete'](Number(season.dataset.season));
		if (!season.open) return;
		const info = getData().seriesOf(target.movieId);
		const n = Number(season.dataset.season);
		if (info.seasons?.list.find(item => item.n === n && item.source === 'omdb' && !item.titles)) details.ensureSeasons(target.movieId, [n]);
	}

	// Editor della struttura: numero di stagioni, episodi uguali per tutte o stagione per stagione.
	function renderStructureForm(movieId) {
		const movie = getData().movieById(movieId);
		const seasons = getData().seriesOf(movieId).seasons;
		const list = seasons?.list?.length ? seasons.list : [{ n: 1, episodes: 10, source: 'custom' }];
		const rows = list.map(season => `
			<div class="structure-row" data-structure-row>
				<label for="structure-season-${season.n}">Stagione ${season.n}</label>
				<input id="structure-season-${season.n}" type="number" min="0" max="${MAX_EPISODES}" inputmode="numeric" value="${season.episodes}" data-structure-episodes>
				<span class="series-custom-badge">${season.source === 'omdb' ? 'da OMDb' : 'inserita da te'}</span>
			</div>
		`).join('');
		const first = list.find(season => season.episodes)?.episodes || 10;
		return `
			<form class="structure-form" data-structure-form>
				<p class="viewing-form-title">${escapeHtml(movieName(movie))}</p>
				<div class="form-grid">
					<div class="field"><label for="structure-count">Numero di stagioni</label><input id="structure-count" type="number" min="1" max="${MAX_SEASONS}" inputmode="numeric" value="${list.length}" data-structure-count></div>
					<div class="field"><label for="structure-per-season">Episodi per stagione</label>
						<div class="structure-same"><input id="structure-per-season" type="number" min="1" max="${MAX_EPISODES}" inputmode="numeric" value="${first}" data-structure-same><button class="button secondary" type="button" data-structure-apply>A tutte</button></div>
					</div>
				</div>
				<div class="structure-rows">${rows}</div>
				<div class="button-row review-form-actions">
					<button class="button" type="submit">Salva</button>
					${seasons?.omdbTotal ? '<button class="button secondary" type="button" data-structure-reset>Ripristina da OMDb</button>' : ''}
					<button class="button secondary" type="button" data-structure-cancel>Annulla</button>
				</div>
			</form>
		`;
	}

	// `addSeason`: si apre con una stagione in più in fondo, già pronta da compilare.
	function openStructureEditor(movieId, { addSeason = false } = {}) {
		structureMovieId = movieId;
		structureBody.innerHTML = renderStructureForm(movieId);
		hydrateIcons(structureBody);
		structureDialog.showModal();
		if (!addSeason) return;
		const form = structureBody.querySelector('[data-structure-form]');
		const count = form.querySelector('[data-structure-count]');
		const hasSeasons = Boolean(getData().seriesOf(movieId).seasons?.list?.length);
		if (hasSeasons) count.value = String(Math.min(MAX_SEASONS, Number(count.value) + 1));
		syncStructureRows(form);
		const rows = form.querySelectorAll('[data-structure-row]');
		rows[rows.length - 1]?.scrollIntoView({ block: 'center', behavior: 'instant' });
	}

	function syncStructureRows(form) {
		const count = Math.min(MAX_SEASONS, Math.max(1, Number(form.querySelector('[data-structure-count]').value) || 1));
		const container = form.querySelector('.structure-rows');
		const rows = [...container.querySelectorAll('[data-structure-row]')];
		const same = Number(form.querySelector('[data-structure-same]').value) || 1;
		for (let n = rows.length + 1; n <= count; n += 1) {
			container.insertAdjacentHTML('beforeend', `
				<div class="structure-row" data-structure-row>
					<label for="structure-season-${n}">Stagione ${n}</label>
					<input id="structure-season-${n}" type="number" min="0" max="${MAX_EPISODES}" inputmode="numeric" value="${same}" data-structure-episodes>
					<span class="series-custom-badge">inserita da te</span>
				</div>`);
		}
		rows.slice(count).forEach(row => row.remove());
	}

	structureDialog.addEventListener('input', event => {
		if (event.target.matches('[data-structure-count]')) syncStructureRows(event.target.form);
	});
	structureDialog.addEventListener('click', async event => {
		const form = structureDialog.querySelector('[data-structure-form]');
		if (event.target.closest('[data-structure-cancel]')) structureDialog.close();
		else if (event.target.closest('[data-structure-apply]')) {
			const same = form.querySelector('[data-structure-same]').value;
			form.querySelectorAll('[data-structure-episodes]').forEach(input => { input.value = same; });
		} else if (event.target.closest('[data-structure-reset]')) {
			const info = getData().seriesOf(structureMovieId);
			if (!(await askConfirmation('Tornare alla struttura di OMDb? Le stagioni inserite a mano spariscono.'))) return;
			const seasons = structureFromOmdb(info.seasons.omdbTotal);
			const lost = lostEpisodes(info.watched, { list: seasons.list.map(season => ({ ...season, episodes: MAX_EPISODES })) });
			if (lost.length) await store.unmarkEpisodes(structureMovieId, lost);
			await store.saveSeasons(structureMovieId, seasons);
			structureDialog.close();
			await refresh();
			details.ensureSeasons(structureMovieId, [1, info.next?.s || 1]);
		}
	});
	structureDialog.addEventListener('submit', async event => {
		event.preventDefault();
		const form = event.target;
		const counts = [...form.querySelectorAll('[data-structure-episodes]')].map(input => Number(input.value) || 0);
		const info = getData().seriesOf(structureMovieId);
		const seasons = customStructure(info.seasons, counts);
		const lost = lostEpisodes(info.watched, seasons);
		if (lost.length && !(await askConfirmation(`${lost.length === 1 ? '1 episodio visto non esisterebbe più' : `${lost.length} episodi visti non esisterebbero più`} (${formatEpisodes(lost)}): li togliamo dal diario?`))) return;
		try {
			if (lost.length) await store.unmarkEpisodes(structureMovieId, lost);
			await store.saveSeasons(structureMovieId, seasons);
			structureDialog.close();
			await refresh();
			showToast('seriesStructureSaved');
		} catch (error) {
			showErrorToast(error);
		}
	});
	structureDialog.addEventListener('close', () => {
		structureBody.innerHTML = '';
		refreshMovieInfo();
	});

	// Gli ascoltatori stanno su app (Stai guardando) e sulla scheda del titolo (sezione Episodi).
	const movieInfoDialog = document.getElementById('movie-info-dialog');
	[app, movieInfoDialog].forEach(root => {
		root.addEventListener('click', handleClick);
		root.addEventListener('pointerdown', handlePointerDown);
		['pointerup', 'pointercancel', 'pointerleave'].forEach(type => root.addEventListener(type, cancelPress));
		root.addEventListener('toggle', handleToggle, true);
	});
	// Il menu contestuale del tocco lungo sui pulsanti degli episodi non serve.
	movieInfoDialog.addEventListener('contextmenu', event => {
		if (event.target.closest('[data-episode]')) event.preventDefault();
	});

	return { renderSection: renderSeriesSection, openStructureEditor, proposeVotes };
}
