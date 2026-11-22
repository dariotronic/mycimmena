// Serie TV nella scheda del titolo e in "Stai guardando" (PIANO.md, §7): episodi visti, prossimo episodio, stato,
// stagioni da OMDb o scritte a mano, voti di stagione e serie. La logica pura sta in series.js, i dati in store.js.
import { escapeHtml, movieName, today } from './domain.js';
import { hydrateIcons, icon } from './icons.js';
import { showErrorToast, showToast } from './toasts.js';
import {
	completedBy, customStructure, episodeKey, episodesUpTo, episodeTitle, formatEpisode, formatEpisodes, lostEpisodes,
	MAX_EPISODES, MAX_SEASONS, parseEpisodeKey, seasonProgress, SERIES_STATUSES, structureFromOmdb
} from './series.js';

const LONG_PRESS_MS = 550;

const episodeLabel = (seasons, episode) => {
	const title = episodeTitle(seasons, episode);
	return title ? `${formatEpisode(episode)} «${title}»` : formatEpisode(episode);
};
const remainingText = count => (count === 1 ? '1 episodio rimasto' : `${count} episodi rimasti`);

// Sezione "Episodi" della scheda di una serie.
export function renderSeriesSection(movie, info, { mode }) {
	const { seasons, watched, next, status, remaining, total } = info;
	const statusChips = status ? `
		<div class="series-status" role="group" aria-label="Stato della serie">
			${['watching', 'paused', 'dropped'].map(value => `<button class="user-filter-chip${status === value ? ' active' : ''}" type="button" data-series-status="${value}" aria-pressed="${status === value}">${SERIES_STATUSES[value]}</button>`).join('')}
			${status === 'finished' ? `<span class="user-filter-chip active" aria-current="true">${SERIES_STATUSES.finished}</span>` : ''}
		</div>
	` : '';
	if (!seasons || !seasons.list.length) {
		const loading = mode === 'full' && !movie.has_details;
		return `
			<h3 class="movie-vote-title">Episodi</h3>
			${statusChips}
			${loading ? '<p class="help-text" role="status">Caricamento delle stagioni da OMDb…</p>' : ''}
			<form class="series-quick-structure" data-series-quick>
				<p class="help-text">${mode === 'full' ? 'OMDb non conosce le stagioni di questa serie.' : 'Per tenere il segno degli episodi, indica quante stagioni ha la serie.'} Potrai correggere ogni stagione dopo.</p>
				<div class="form-grid">
					<div class="field"><label for="series-quick-seasons">Stagioni</label><input id="series-quick-seasons" name="seasons" type="number" min="1" max="${MAX_SEASONS}" inputmode="numeric" required></div>
					<div class="field"><label for="series-quick-episodes">Episodi per stagione</label><input id="series-quick-episodes" name="episodes" type="number" min="1" max="${MAX_EPISODES}" inputmode="numeric" required></div>
				</div>
				<button class="button secondary" type="submit">Salva la struttura</button>
			</form>
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
				return `<button class="episode${seenIt ? ' seen' : ''}" type="button" data-episode="${episodeKey(episode)}" aria-pressed="${seenIt}" aria-label="${escapeHtml(`${formatEpisode(episode)}${title ? ` ${title}` : ''}${seenIt ? ', visto' : ''}`)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${index + 1}</button>`;
			}).join('')}</div>
			<div class="series-season-actions">
				<label class="visually-hidden" for="season-date-${season.n}">Data della visione della stagione ${season.n}</label>
				<input id="season-date-${season.n}" type="date" value="${escapeHtml(today())}" max="${escapeHtml(today())}" data-season-date="${season.n}">
				<button class="text-button" type="button" data-season-all="${season.n}"${seen === season.episodes ? ' disabled' : ''}>Segna la stagione come vista</button>
			</div>`
			: '<p class="help-text" role="status">Caricamento degli episodi…</p>';
		return `
			<details class="series-season" data-season="${season.n}"${season.n === current ? ' open' : ''}>
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
		<p class="series-hint help-text">Tocca un episodio per segnarlo o togliere il segno; tienilo premuto per segnare anche tutti quelli prima.</p>
		<button class="text-button" type="button" data-series-structure>La struttura non è giusta?</button>
	`;
}

// Riga di "Stai guardando" (Home e Watchlist).
export function renderWatchingRow(item, { poster }) {
	const { movie, next, remaining, status, seasons } = item;
	const meta = status === 'paused'
		? 'In pausa'
		: next ? `${episodeLabel(seasons, next)} · ${remainingText(remaining)}` : seasons ? 'Tutti gli episodi visti' : 'Struttura da indicare';
	return `
		<article class="watching-row">
			<button class="movie-poster-trigger" data-movie-id="${escapeHtml(movie.id)}" type="button" aria-label="Apri i dettagli di ${escapeHtml(movie.title)}">${poster(movie, 'archive-film-poster')}</button>
			<div class="watching-copy">
				<h3 class="archive-film-title">${escapeHtml(movieName(movie))}</h3>
				<p class="movie-year">${escapeHtml(meta)}</p>
			</div>
			${next && status !== 'paused'
				? `<button class="icon-button series-next-quick" type="button" data-series-next data-movie-id="${escapeHtml(movie.id)}" aria-label="Segna ${escapeHtml(formatEpisode(next))} di ${escapeHtml(movie.title)} come visto" title="Visto ${escapeHtml(formatEpisode(next))}">${icon('task_alt')}</button>`
				: ''}
		</article>
	`;
}

export function createSeriesUi({ app, store, details, getData, getState, refresh, ask, askConfirmation, openViewing, refreshMovieInfo }) {
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

	async function unmark(movieId, episodes) {
		try {
			await store.unmarkEpisodes(movieId, episodes);
			await refresh();
		} catch (error) {
			showErrorToast(error);
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
			const episode = parseEpisodeKey(episodeButton.dataset.episode);
			if (getData().seriesOf(movieId).watched.has(episodeButton.dataset.episode)) await unmark(movieId, [episode]);
			else await mark(movieId, [episode]);
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
			const episodes = episodesUpTo(info.seasons, info.watched, parseEpisodeKey(episodeButton.dataset.episode));
			if (window.matchMedia('(pointer: coarse)').matches && typeof navigator.vibrate === 'function') navigator.vibrate(15);
			if (episodes.length) await mark(target.movieId, episodes);
		}, LONG_PRESS_MS);
	}
	const cancelPress = () => window.clearTimeout(pressTimer);

	async function handleSubmit(event) {
		const form = event.target.closest('[data-series-quick]');
		if (!form) return;
		event.preventDefault();
		const target = seriesTarget(event);
		const seasons = Number(form.elements.seasons.value);
		const episodes = Number(form.elements.episodes.value);
		if (!(seasons >= 1 && episodes >= 1)) return;
		await store.saveSeasons(target.movieId, customStructure(null, Array(Math.min(seasons, MAX_SEASONS)).fill(episodes)));
		await refresh();
		showToast('seriesStructureSaved');
	}

	// Aprire una stagione di OMDb non ancora scaricata la chiede a OMDb.
	function handleToggle(event) {
		const season = event.target.closest?.('details[data-season]');
		const target = season && seriesTarget(event);
		if (!target || !season.open) return;
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

	function openStructureEditor(movieId) {
		structureMovieId = movieId;
		structureBody.innerHTML = renderStructureForm(movieId);
		hydrateIcons(structureBody);
		structureDialog.showModal();
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
		root.addEventListener('submit', handleSubmit);
		root.addEventListener('pointerdown', handlePointerDown);
		['pointerup', 'pointercancel', 'pointerleave'].forEach(type => root.addEventListener(type, cancelPress));
		root.addEventListener('toggle', handleToggle, true);
	});
	// Il menu contestuale del tocco lungo sui pulsanti degli episodi non serve.
	movieInfoDialog.addEventListener('contextmenu', event => {
		if (event.target.closest('[data-episode]')) event.preventDefault();
	});

	return { renderSection: renderSeriesSection, openStructureEditor };
}
