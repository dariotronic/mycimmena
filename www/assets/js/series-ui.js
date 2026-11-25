// Serie TV nella scheda del titolo e in "Stai guardando" (PIANO.md, §7). Dalla 1.1 la scheda ha quattro blocchi:
// stato e avanzamento (con una data sola per tutto quello che si segna), stagioni (righe che si aprono sulla griglia
// degli episodi, con il voto alla stagione), il tuo giudizio (voto alla serie e nota) e il diario della serie (un
// giorno per riga). Gli episodi non hanno voto né note: un tocco li segna o toglie il segno. La logica pura sta in
// series.js, i dati in store.js.
import { escapeHtml, formatDate, formatSpipe, movieName, today } from './domain.js';
import { sanitizeNotes } from './sanitize.js';
import {
	applyReviewFormat, handleRatingKeydown, handleRatingPointerDown, handleReviewInput, reviewTextLength, updateReviewCounter
} from './review-editor.js';
import { hydrateIcons, icon } from './icons.js';
import { showErrorToast, showToast } from './toasts.js';
import { catCells } from './views.js';
import {
	completedBy, customStructure, episodeKey, episodesSummary, episodesUpTo, episodeTitle, formatEpisode, formatEpisodes, lostEpisodes,
	MAX_EPISODES, MAX_SEASONS, parseEpisodeKey, seasonProgress, SERIES_STATUSES, structureFromOmdb
} from './series.js';

const LONG_PRESS_MS = 550;
const DAYS_SHOWN = 5;

// Stagioni aperte nella scheda, per serie: la sezione si ridisegna a ogni salvataggio o quando arrivano gli episodi da
// OMDb, e senza questo si chiuderebbe la stagione appena aperta. Senza nessuna scelta si apre quella in corso.
const openSeasons = new Map();
// La data in cui si segnano gli episodi (in cima alla sezione), per serie, finché la scheda resta aperta.
const markDates = new Map();
// Serie con il diario della serie aperto per intero.
const allDays = new Set();

const episodeLabel = (seasons, episode) => {
	const title = episodeTitle(seasons, episode);
	return title ? `${formatEpisode(episode)} «${title}»` : formatEpisode(episode);
};
const remainingText = count => (count === 1 ? '1 episodio rimasto' : `${count} episodi rimasti`);
const markDate = movieId => markDates.get(movieId) || today();
// "oggi", "ieri" o "3 novembre 2026".
function dateChip(date) {
	if (date === today()) return 'oggi';
	const yesterday = new Date(`${today()}T12:00:00`);
	yesterday.setDate(yesterday.getDate() - 1);
	return date === today(yesterday) ? 'ieri' : formatDate(date);
}
// Voto corto per le righe delle stagioni: "8½", "7".
const shortVote = value => String(Math.floor(value)) + (value % 1 ? '½' : '');
const bar = (value, total) => `<span class="series-bar" aria-hidden="true"><span style="width: ${total ? Math.round((value / total) * 100) : 0}%"></span></span>`;

// Voto a una stagione o a tutta la serie: lo slider dei gatti delle recensioni, che salva da solo a fine gesto.
function voteForm(movieId, { scope, season = null, rating = null, label }) {
	const id = `series-vote-${scope}-${season || 0}`;
	return `
		<form class="review-form series-vote-form" data-review-form="${escapeHtml(movieId)}" data-series-vote="${scope}"${season ? ` data-season="${Number(season)}"` : ''} data-saved="${rating || ''}">
			<fieldset class="review-rating">
				<legend id="${id}">${escapeHtml(label)}</legend>
				<input type="hidden" name="rating" value="${rating || ''}">
				<div class="rating-slider cat-rating" data-rating-slider role="slider" tabindex="0" aria-labelledby="${id}" aria-valuemin="0.5" aria-valuemax="10"
					${rating ? `aria-valuenow="${rating}" aria-valuetext="${escapeHtml(formatSpipe(rating))}"` : 'aria-valuetext="Nessun voto"'}>${catCells(rating || 0)}</div>
				<div class="rating-row">
					<output class="review-rating-output">${rating ? escapeHtml(formatSpipe(rating)) : 'Tocca i gatti per votare'}</output>
					${rating ? '<button class="text-button" type="button" data-series-vote-clear>Togli il voto</button>' : ''}
				</div>
			</fieldset>
		</form>
	`;
}

// Nota generale sulla serie: per intero se c'è, con la matita; altrimenti il pulsante per scriverla.
function seriesNote(info) {
	const html = sanitizeNotes(info.notes || '').html;
	return html
		? `<div class="series-note"><div class="series-note-head"><span class="field-label">La tua nota</span><button class="icon-button small" type="button" data-series-note aria-label="Modifica la nota sulla serie" title="Modifica">${icon('edit')}</button></div><div class="review-content series-note-text">${html}</div></div>`
		: '<button class="text-button series-note-add" type="button" data-series-note>Scrivi una nota sulla serie</button>';
}

// Stato: un menù solo (nello stile dell'app, custom-select.js). "Completata" arriva anche da sola con l'ultimo episodio.
function statusSelect(movie, status) {
	const options = Object.entries(SERIES_STATUSES).map(([value, label]) => `<option value="${value}"${status === value ? ' selected' : ''}>${label}</option>`).join('');
	return `<select class="series-status-select" data-series-status aria-label="Stato della serie">${status ? '' : '<option value="" selected>Nessuno stato</option>'}${options}</select>`;
}

function seasonBlock(movie, info, season, current) {
	const { seasons, watched } = info;
	const { seen } = seasonProgress(seasons, watched, season.n);
	const vote = info.seasonVotes?.get(season.n) || null;
	const done = season.episodes > 0 && seen === season.episodes;
	const body = season.episodes
		? `<div class="episode-grid" role="group" aria-label="Episodi della stagione ${season.n}">${Array.from({ length: season.episodes }, (_, index) => {
			const episode = { s: season.n, e: index + 1 };
			const seenIt = watched.has(episodeKey(episode));
			const title = episodeTitle(seasons, episode);
			const detail = info.episodes?.get(episodeKey(episode));
			const label = `${formatEpisode(episode)}${title ? ` ${title}` : ''}${seenIt ? `, visto${detail?.date ? ` il ${formatDate(detail.date)}` : ''}` : ''}`;
			return `<button class="episode${seenIt ? ' seen' : ''}" type="button" data-episode="${episodeKey(episode)}" aria-pressed="${seenIt}" aria-label="${escapeHtml(label)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${index + 1}</button>`;
		}).join('')}</div>
		<p class="series-hint">Tocca: visto o non visto · tieni premuto: fino a qui</p>
		${done ? '' : `<button class="button secondary series-season-all" type="button" data-season-all="${season.n}">Segna tutta la stagione</button>`}
		${voteForm(movie.id, { scope: 'season', season: season.n, rating: vote, label: `Voto alla stagione ${season.n}` })}`
		: '<p class="help-text" role="status">Caricamento degli episodi…</p>';
	return `
		<details class="series-season" data-season="${season.n}"${(openSeasons.get(movie.id)?.has(season.n) ?? season.n === current) ? ' open' : ''}>
			<summary>
				<span class="series-season-name">Stagione ${season.n}</span>
				<span class="series-season-count">${seen}/${season.episodes || '?'}${vote ? ` · <strong aria-label="${escapeHtml(formatSpipe(vote))}">${shortVote(vote)}</strong>` : ''}</span>
				${bar(seen, season.episodes)}
				${done && !vote ? '<span class="series-season-invite">Finita! Vota la stagione</span>' : ''}
			</summary>
			<div class="series-season-body">${body}</div>
		</details>
	`;
}

// Diario della serie: un giorno per riga (i più recenti), che si apre sul giorno (diary.js) per data, dove e con chi.
function seriesDays(movie, info) {
	const days = info.days || [];
	if (!days.length) return '';
	const shown = allDays.has(movie.id) ? days : days.slice(0, DAYS_SHOWN);
	return `
		<div class="series-block">
			<p class="series-label">Diario della serie</p>
			<ul class="series-days">${shown.map(day => `
				<li><button class="series-day" type="button" data-series-day="${escapeHtml(day.date)}" aria-label="${escapeHtml(`${formatDate(day.date)}: ${formatEpisodes(day.episodes, info.seasons)}`)}">
					<span><strong>${escapeHtml(formatDate(day.date))}</strong> · ${escapeHtml(episodesSummary(day.episodes))}</span>
					<span class="series-day-count">${day.episodes.length === 1 ? '1 ep' : `${day.episodes.length} ep`} ${icon('chevron_right')}</span>
				</button></li>`).join('')}
			</ul>
			${days.length > shown.length ? `<button class="text-button" type="button" data-series-days-all>Tutti i giorni (${days.length})</button>` : ''}
		</div>
	`;
}

// Sezione "Episodi" della scheda di una serie.
export function renderSeriesSection(movie, info, { mode }) {
	const { seasons, next, status, remaining, total, seen } = info;
	const verdict = `
		<div class="series-block">
			<p class="series-label">Il tuo giudizio</p>
			<div class="series-verdict">
				${voteForm(movie.id, { scope: 'series', rating: info.seriesVote, label: 'Voto alla serie' })}
				${seriesNote(info)}
			</div>
		</div>
	`;
	if (!seasons || !seasons.list.length) {
		const loading = mode === 'full' && !movie.has_details;
		return `
			<h3 class="movie-vote-title">Episodi</h3>
			<div class="series-head">${statusSelect(movie, status)}</div>
			${loading ? '<p class="help-text" role="status">Caricamento delle stagioni da OMDb…</p>' : ''}
			<div class="series-quick-structure">
				<p class="help-text">${mode === 'full' && !loading ? 'OMDb non conosce le stagioni di questa serie.' : 'Per tenere il segno degli episodi, indica le stagioni della serie.'}</p>
				<button class="button secondary" type="button" data-series-structure>Indica stagioni ed episodi</button>
			</div>
			${verdict}
			${seriesDays(movie, info)}
		`;
	}
	const current = next?.s || seasons.list[seasons.list.length - 1].n;
	const date = markDate(movie.id);
	const main = next
		? `<button class="button series-next" type="button" data-series-next data-movie-id="${escapeHtml(movie.id)}">${icon('task_alt')}<span>Visto ${escapeHtml(formatEpisode(next))}</span></button>`
		: `<p class="series-all-seen">${total ? 'Hai visto tutti gli episodi.' : ''}</p>`;
	return `
		<h3 class="movie-vote-title">Episodi</h3>
		<div class="series-head">
			<div class="series-head-top">
				${statusSelect(movie, status)}
				<span class="series-count">${total ? `${seen} di ${total} episodi` : ''}</span>
			</div>
			${bar(seen, total)}
			<div class="series-mark-row">
				${main}
				<label class="series-date-chip" title="La data degli episodi che segni">
					<span class="visually-hidden">Data degli episodi che segni</span>
					<span class="series-date-text" aria-hidden="true">${escapeHtml(dateChip(date))}</span>${icon('expand_more')}
					<input type="date" value="${escapeHtml(date)}" max="${escapeHtml(today())}" data-series-date>
				</label>
			</div>
			${next ? `<p class="series-summary">Prossimo: <strong>${escapeHtml(episodeLabel(seasons, next))}</strong> · ${escapeHtml(remainingText(remaining))}</p>` : ''}
		</div>
		<div class="series-block">
			<p class="series-label">Stagioni</p>
			<div class="series-seasons">${seasons.list.map(season => seasonBlock(movie, info, season, current)).join('')}</div>
			<button class="text-button series-structure-link" type="button" data-series-structure>Modifica stagioni</button>
		</div>
		${verdict}
		${seriesDays(movie, info)}
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
// openDay({ movieId, date }): il giorno del diario della serie (diary.js).
export function createSeriesUi({ app, store, details, getData, refresh, askConfirmation, refreshMovieInfo, renderEditor = () => '', openDay = () => {} }) {
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
				<p class="help-text">Qui va tutto quello che vuoi ricordare: anche i commenti ai singoli episodi.</p>
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

	async function mark(movieId, episodes) {
		const before = getData().seriesOf(movieId);
		try {
			await store.markEpisodes(movieId, episodes, { date: markDate(movieId) });
			await finishIfDone(movieId, before, episodes);
			await refresh();
			showToast('episodesMarked', { label: formatEpisodes(episodes, before.seasons) });
		} catch (error) {
			showErrorToast(error);
		}
	}

	// Con l'ultimo episodio la serie è "Completata" (niente finestre: le stagioni finite invitano a votarle).
	async function finishIfDone(movieId, before, episodes) {
		if (before.seasons && completedBy(before.seasons, before.watched, episodes).series) await store.setSeriesStatus(movieId, 'finished');
	}

	async function unmark(movieId, episode) {
		try {
			await store.unmarkEpisodes(movieId, [episode]);
			await refresh();
			showToast('episodesUnmarked', { label: formatEpisode(episode) });
		} catch (error) {
			showErrorToast(error);
		}
	}

	// Voto a stagione o serie: si salva alla fine del gesto sui gatti (o dei tasti freccia), se è cambiato.
	async function saveVote(form, rating = form.querySelector('input[name="rating"]').value) {
		if (String(rating || '') === String(form.dataset.saved || '')) return;
		form.dataset.saved = String(rating || '');
		try {
			await store.setSeriesVote(form.dataset.reviewForm, {
				scope: form.dataset.seriesVote,
				season: form.dataset.season ? Number(form.dataset.season) : null,
				rating: rating ? Number(rating) : null
			});
			await refresh();
			if (rating) showToast('seriesRated');
			else showToast('seriesVoteRemoved');
		} catch (error) {
			showErrorToast(error);
		}
	}
	const voteFormOf = event => event.target.closest?.('.series-vote-form');

	function seriesTarget(event) {
		const section = event.target.closest('[data-series-section]');
		return section ? { section, movieId: section.dataset.movieId } : null;
	}

	// Tocco e pressione lunga sugli episodi: il tocco segna o toglie il segno, la pressione lunga segna fino a lì.
	let pressTimer = null;
	let longPressed = false;

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
			const episode = parseEpisodeKey(episodeButton.dataset.episode);
			if (getData().seriesOf(movieId).watched.has(episodeKey(episode))) await unmark(movieId, episode);
			else await mark(movieId, [episode]);
			return;
		}
		const all = event.target.closest('[data-season-all]');
		if (all) {
			const n = Number(all.dataset.seasonAll);
			const info = getData().seriesOf(movieId);
			const season = info.seasons.list.find(item => item.n === n);
			const episodes = Array.from({ length: season.episodes }, (_, index) => ({ s: n, e: index + 1 })).filter(episode => !info.watched.has(episodeKey(episode)));
			if (episodes.length) await mark(movieId, episodes);
			return;
		}
		const clear = event.target.closest('[data-series-vote-clear]');
		if (clear) return void await saveVote(voteFormOf(event), '');
		const day = event.target.closest('[data-series-day]');
		if (day) return void openDay({ movieId, date: day.dataset.seriesDay });
		if (event.target.closest('[data-series-days-all]')) {
			allDays.add(movieId);
			return void refreshMovieInfo();
		}
		if (event.target.closest('[data-series-note]')) return void openNoteEditor(movieId);
		if (event.target.closest('[data-series-structure]')) openStructureEditor(movieId);
	}

	async function handleChange(event) {
		const target = seriesTarget(event);
		if (!target) return;
		if (event.target.matches('[data-series-date]')) {
			const value = event.target.value && event.target.value <= today() ? event.target.value : today();
			markDates.set(target.movieId, value);
			const text = event.target.closest('.series-date-chip')?.querySelector('.series-date-text');
			if (text) text.textContent = dateChip(value);
			return;
		}
		if (event.target.matches('[data-series-status]') && event.target.value) {
			try {
				await store.setSeriesStatus(target.movieId, event.target.value);
				await refresh();
			} catch (error) {
				showErrorToast(error);
			}
		}
	}

	function handlePointerDown(event) {
		if (voteFormOf(event)) return void handleRatingPointerDown(event);
		const episodeButton = event.target.closest('[data-episode]');
		const target = episodeButton && seriesTarget(event);
		if (!target) return;
		longPressed = false;
		window.clearTimeout(pressTimer);
		pressTimer = window.setTimeout(async () => {
			longPressed = true;
			const info = getData().seriesOf(target.movieId);
			const episodes = episodesUpTo(info.seasons, info.watched, parseEpisodeKey(episodeButton.dataset.episode));
			if (window.matchMedia('(pointer: coarse)').matches && typeof navigator.vibrate === 'function') navigator.vibrate(15);
			if (episodes.length) await mark(target.movieId, episodes);
		}, LONG_PRESS_MS);
	}
	const cancelPress = () => window.clearTimeout(pressTimer);
	// Fine del gesto sui gatti: lo slider (review-editor.js) ha già aggiornato il valore.
	function handlePointerEnd(event) {
		cancelPress();
		const form = voteFormOf(event);
		if (form && event.type === 'pointerup') window.setTimeout(() => saveVote(form), 0);
	}

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

	// Editor delle stagioni: una riga per stagione con − e + (niente tastiera), "Aggiungi una stagione" in fondo.
	const structureRow = (n, episodes, source) => `
		<div class="structure-row" data-structure-row>
			<div class="structure-row-copy"><span class="structure-row-name">Stagione ${n}</span><span class="series-custom-badge">${source === 'omdb' ? 'da OMDb' : 'inserita da te'}</span></div>
			<div class="structure-stepper">
				<button class="icon-button small" type="button" data-structure-step="-1" aria-label="Un episodio in meno alla stagione ${n}">${icon('remove')}</button>
				<output class="structure-value" data-structure-episodes aria-label="Episodi della stagione ${n}">${episodes}</output>
				<button class="icon-button small" type="button" data-structure-step="1" aria-label="Un episodio in più alla stagione ${n}">${icon('add')}</button>
			</div>
		</div>`;

	function renderStructureForm(movieId) {
		const movie = getData().movieById(movieId);
		const seasons = getData().seriesOf(movieId).seasons;
		const list = seasons?.list?.length ? seasons.list : [{ n: 1, episodes: 10, source: 'custom' }];
		return `
			<form class="structure-form" data-structure-form>
				<p class="viewing-form-title">${escapeHtml(movieName(movie))}</p>
				<p class="help-text">Quanti episodi ha ogni stagione. Tieni premuto − o + per andare più veloce.</p>
				<div class="structure-rows">${list.map(season => structureRow(season.n, season.episodes, season.source)).join('')}</div>
				<div class="structure-add-row">
					<button class="button secondary" type="button" data-structure-add>${icon('add')}<span>Aggiungi una stagione</span></button>
					<button class="text-button" type="button" data-structure-remove${list.length > 1 ? '' : ' hidden'}>Togli l'ultima</button>
				</div>
				<div class="button-row review-form-actions">
					<button class="button" type="submit">Salva</button>
					<button class="button secondary" type="button" data-structure-cancel>Annulla</button>
				</div>
				${seasons?.omdbTotal ? '<button class="text-button structure-reset" type="button" data-structure-reset>Ripristina da OMDb</button>' : ''}
			</form>
		`;
	}

	function openStructureEditor(movieId) {
		structureMovieId = movieId;
		structureBody.innerHTML = renderStructureForm(movieId);
		hydrateIcons(structureBody);
		structureDialog.showModal();
		document.activeElement?.blur?.();
	}

	function stepRow(row, delta) {
		const output = row.querySelector('[data-structure-episodes]');
		output.textContent = String(Math.min(MAX_EPISODES, Math.max(0, Number(output.textContent) + delta)));
	}
	function syncRemove(form) {
		form.querySelector('[data-structure-remove]').hidden = form.querySelectorAll('[data-structure-row]').length <= 1;
	}

	// − e + tenuti premuti: dopo mezzo secondo ripetono, sempre più veloci.
	let stepTimer = null;
	const stopStep = () => window.clearTimeout(stepTimer);
	structureDialog.addEventListener('pointerdown', event => {
		const step = event.target.closest('[data-structure-step]');
		if (!step) return;
		const row = step.closest('[data-structure-row]');
		const delta = Number(step.dataset.structureStep);
		let delay = 450;
		const repeat = () => {
			stepRow(row, delta);
			step.dataset.repeated = 'true';
			delay = Math.max(60, delay * 0.8);
			stepTimer = window.setTimeout(repeat, delay);
		};
		stopStep();
		stepTimer = window.setTimeout(repeat, delay);
	});
	['pointerup', 'pointercancel', 'pointerleave'].forEach(type => structureDialog.addEventListener(type, stopStep));
	structureDialog.addEventListener('contextmenu', event => {
		if (event.target.closest('[data-structure-step]')) event.preventDefault();
	});
	structureDialog.addEventListener('click', async event => {
		const form = structureDialog.querySelector('[data-structure-form]');
		const step = event.target.closest('[data-structure-step]');
		if (step) {
			// Il tocco dopo una ripetizione non aggiunge un passo in più.
			if (step.dataset.repeated) delete step.dataset.repeated;
			else stepRow(step.closest('[data-structure-row]'), Number(step.dataset.structureStep));
			return;
		}
		if (event.target.closest('[data-structure-cancel]')) return void structureDialog.close();
		if (event.target.closest('[data-structure-add]')) {
			const rows = form.querySelector('.structure-rows');
			const count = rows.querySelectorAll('[data-structure-row]').length;
			if (count >= MAX_SEASONS) return;
			const last = rows.querySelector('[data-structure-row]:last-child [data-structure-episodes]');
			rows.insertAdjacentHTML('beforeend', structureRow(count + 1, Number(last?.textContent) || 10, 'custom'));
			hydrateIcons(rows);
			syncRemove(form);
			rows.lastElementChild.scrollIntoView({ block: 'center', behavior: 'instant' });
			return;
		}
		if (event.target.closest('[data-structure-remove]')) {
			const rows = form.querySelectorAll('[data-structure-row]');
			if (rows.length > 1) rows[rows.length - 1].remove();
			syncRemove(form);
			return;
		}
		if (event.target.closest('[data-structure-reset]')) {
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
		const counts = [...form.querySelectorAll('[data-structure-episodes]')].map(output => Number(output.textContent) || 0);
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
		stopStep();
		structureBody.innerHTML = '';
		refreshMovieInfo();
	});

	// Gli ascoltatori stanno su app (Stai guardando) e sulla scheda del titolo (sezione Episodi).
	const movieInfoDialog = document.getElementById('movie-info-dialog');
	[app, movieInfoDialog].forEach(root => {
		root.addEventListener('click', handleClick);
		root.addEventListener('pointerdown', handlePointerDown);
		['pointerup', 'pointercancel', 'pointerleave'].forEach(type => root.addEventListener(type, handlePointerEnd));
		root.addEventListener('toggle', handleToggle, true);
	});
	movieInfoDialog.addEventListener('change', handleChange);
	// Voti con la tastiera: frecce sui gatti, salvataggio al rilascio del tasto.
	movieInfoDialog.addEventListener('keydown', event => {
		if (voteFormOf(event)) handleRatingKeydown(event);
	});
	movieInfoDialog.addEventListener('keyup', event => {
		const form = voteFormOf(event);
		if (form && event.target.closest('[data-rating-slider]')) saveVote(form);
	});
	// La data scelta vale finché la scheda resta aperta.
	movieInfoDialog.addEventListener('close', () => {
		markDates.clear();
		allDays.clear();
	});
	// Il menu contestuale del tocco lungo sui pulsanti degli episodi non serve.
	movieInfoDialog.addEventListener('contextmenu', event => {
		if (event.target.closest('[data-episode]')) event.preventDefault();
	});

	return { renderSection: renderSeriesSection, openStructureEditor };
}

