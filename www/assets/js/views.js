import { pageHeader } from './components.js';
import { icon } from './icons.js';
import { catState, formatSpipe } from './domain.js';
import { formatHype, HYPE_LEVELS, HYPE_POINTS_EMOJI, HYPE_TITLE, hypeLevel, watchlistVotes } from './hype.js';
import { sanitizeNotes } from './sanitize.js';
import { viewingsOf } from './app-data.js';
import { DEFAULT_DRAW_FILTERS, drawChances, formatChance } from './draw.js';
import { soundEnabled } from './slot-sounds.js';
import { APP_VERSION, CREDIT_HANDLE, CREDIT_URL } from './app-info.js';

// Gatto SVG (simboli #cat-full e #cat-empty in index.html): la sagoma vuota sotto, quella calico sopra,
// ritagliata da CSS in base allo stato della cella (full, half, empty).
export const catCell = state => `<span class="cat-cell ${state}"><svg class="cat cat-empty-icon" aria-hidden="true" focusable="false"><use href="#cat-empty"/></svg><svg class="cat cat-fill" aria-hidden="true" focusable="false"><use href="#cat-full"/></svg></span>`;
export const catCells = rating => Array.from({ length: 10 }, (_, index) => catCell(catState(rating, index))).join('');

// Ordinamenti della watchlist: le icone delle linguette (sprite in index.html, disegnate per il Club) si cambiano qui;
// `label` è il nome letto dagli screen reader e mostrato passando il mouse. Per l'Hypometro il secchiello di popcorn.
export const SORT_FIELDS = Object.freeze([
	{ field: 'added', icon: 'sort_added', label: 'Aggiunto' },
	{ field: 'title', icon: 'sort_title', label: 'Titolo' },
	{ field: 'year', icon: 'sort_year', label: 'Anno' },
	{ field: 'votes', icon: 'sort_votes', label: 'Hype' }
]);

export function createViews(context) {
	const {
		getData,
		getDiaryQuery = () => '',
		getColorMode = () => 'day',
		getMovieSearchMode,
		getMovieSort,
		getOmdbQuery,
		getRandomizerState,
		getSelectedMovieId,
		getWatchlistCardsPerRow = () => 3,
		getWatchlistMobileCardsPerRow = () => 3,
		getWatchlistQuery,
		getWatchlistType,
		getWatchlistMinVotes = () => 0,
		getWatchlistView = () => 'list',
		contentType,
		emptyState,
		escapeHtml,
		formatDate,
		infoButton,
		meetingMovies,
		movieDetails,
		movieName,
		poster,
		selectableMovies,
		titleWithInfo,
		today
	} = context;
	function moviePosterButton(movie, className, extraClass = '') {
		const buttonClass = ['movie-poster-trigger', extraClass].filter(Boolean).join(' ');
		return `<button class="${buttonClass}" data-movie-id="${escapeHtml(movie.id)}" type="button" aria-label="Apri i dettagli di ${escapeHtml(movie.title)}">${poster(movie, className)}</button>`;
	}

	function renderHome() {
		const data = getData();
		const meeting = data.upcoming && (!data.upcoming.date || data.upcoming.date >= today()) ? data.upcoming : null;
		if (data.upcoming && !meeting) return renderPastMeeting(data.upcoming);
		if (!meeting) {
			return `
				<section class="home-view">
					${pageHeader('Home', 'La prossima serata.')}
					${emptyState('Non c’è ancora una serata in programma.', 'Organizza la prossima serata', '#calendario')}
					${renderHomeSummary(data)}
				</section>
			`;
		}
		const movies = meetingMovies(meeting);
		const movieRows = movies.length
			? movies.map((movie, index) => `
				<article class="home-film-row">
					${moviePosterButton(movie, 'home-movie-poster')}
					<div class="home-film-copy">
						${titleWithInfo(movie, `
							<h2${index === 0 ? ' id="home-title"' : ''} class="display-title">
								${escapeHtml(movieName(movie))}
							</h2>
						`)}
						${movieDetails(movie)}
					</div>
				</article>
			`).join('')
			: `
				<article class="home-film-row">
					<button class="movie-poster-trigger" type="button" disabled aria-hidden="true"><div class="home-movie-poster placeholder">C</div></button>
					<h2 id="home-title" class="display-title">Film da definire</h2>
				</article>
			`;

		return `
			<section class="home-view" aria-labelledby="home-title">
				${pageHeader('Home', 'La prossima serata.')}
				<div class="home-eyebrow-row">
					<p class="eyebrow">La prossima serata</p>
					<button id="share-home" class="icon-button" type="button" aria-label="Condividi la prossima serata" title="Condividi">
						${icon('share')}
					</button>
					${meeting.date ? `
						<button id="calendar-home" class="icon-button" type="button" aria-label="Aggiungi la prossima serata al calendario" title="Aggiungi al calendario">
							${icon('event_available')}
						</button>
					` : ''}
				</div>
				<div class="home-details">
					<div>
						<span class="detail-label">
							${icon('event', 'detail-icon')}
							<span class="visually-hidden">Quando</span>
						</span>
						<span class="detail-value">${escapeHtml(formatDate(meeting.date) || 'Data da definire')}</span>
					</div>
					<div>
						<span class="detail-label">
							${icon('place', 'detail-icon')}
							<span class="visually-hidden">Dove</span>
						</span>
						<span class="detail-value">${escapeHtml(meeting.place || 'Luogo da definire')}</span>
					</div>
				</div>
				<div class="home-film-list">${movieRows}</div>
			</section>
		`;
	}

	// Serata con la data già passata: si chiede com'è andata. "Segna come vista" mette i titoli nel diario
	// (meeting.js), "Non l'abbiamo fatta" cancella la serata e lascia i titoli in watchlist.
	function renderPastMeeting(meeting) {
		const movies = meetingMovies(meeting);
		return `
			<section class="home-view" aria-labelledby="past-meeting-title">
				${pageHeader('Home', 'La prossima serata.')}
				<div class="past-meeting">
					<p class="eyebrow">Serata del ${escapeHtml(formatDate(meeting.date))}</p>
					<h2 id="past-meeting-title" class="display-title">Com’è andata?</h2>
					<p class="help-text">${movies.length
						? `Con «Segna come vista» ${movies.length === 1 ? 'il titolo va' : `i ${movies.length} titoli vanno`} nel diario, dove puoi dare ${movies.length === 1 ? 'il voto' : 'i voti'}.`
						: 'Non c’erano titoli in programma.'}</p>
					${movies.length ? `<ul class="past-meeting-titles">${movies.map(movie => `<li>${escapeHtml(movieName(movie))}</li>`).join('')}</ul>` : ''}
					<div class="button-row">
						${movies.length ? '<button id="complete-meeting" class="button" type="button">Segna come vista</button>' : ''}
						<button id="clear-meeting" class="button secondary" type="button">Non l’abbiamo fatta</button>
					</div>
				</div>
			</section>
		`;
	}

	// Senza serata in programma: ultimi titoli visti e il prossimo candidato dalla watchlist (il più hypato, a parità
	// il più recente).
	function renderHomeSummary(data) {
		const recent = (data.viewings || []).slice(0, 3);
		const next = [...data.movies].sort((first, second) => watchlistVotes(second).total - watchlistVotes(first).total
			|| (second.added_at || '').localeCompare(first.added_at || ''))[0];
		if (!recent.length && !next) return '';
		return `
			<div class="home-summary">
				${next ? `
					<section class="home-summary-block" aria-labelledby="home-next-title">
						<h2 id="home-next-title" class="section-title">Da vedere</h2>
						${summaryRow(next, next.hype !== null ? `<span class="vote-marker" title="${escapeHtml(formatHype(next.hype))}">${escapeHtml(hypeLevel(next.hype).emoji)}</span>` : '')}
					</section>
				` : ''}
				${recent.length ? `
					<section class="home-summary-block" aria-labelledby="home-recent-title">
						<h2 id="home-recent-title" class="section-title">Visti di recente</h2>
						${recent.map(viewing => summaryRow(viewing.movie, `${escapeHtml(formatDate(viewing.date))}${viewing.rating ? ` · ${escapeHtml(formatSpipe(viewing.rating))}` : ''}`)).join('')}
					</section>
				` : ''}
			</div>
		`;
	}

	function summaryRow(movie, meta) {
		return `
			<article class="archive-film-row home-summary-row">
				${moviePosterButton(movie, 'archive-film-poster')}
				<div class="archive-film-copy">
					<h3 class="archive-film-title">${escapeHtml(movieName(movie))}</h3>
					<p class="movie-year">${meta}</p>
				</div>
				<div class="archive-film-actions">${infoButton(movie)}</div>
			</article>
		`;
	}

	function renderCalendar() {
		const data = getData();
		const meeting = data.upcoming || {};
		const scheduledMovies = meetingMovies(meeting);
		const scheduledRows = scheduledMovies.map(movie => `
			<article class="calendar-film-row">
				<input type="hidden" name="movieIds" value="${escapeHtml(movie.id)}">
				${moviePosterButton(movie, 'calendar-film-poster')}
				<div class="calendar-film-copy">
					<h3>${escapeHtml(movie.title)}</h3>
					${movieDetails(movie)}
					<p>${escapeHtml(movie.year || 'Anno non indicato')}</p>
				</div>
				<div class="calendar-film-actions">
					${infoButton(movie)}
					<button class="button secondary icon-only remove-scheduled-movie" data-movie-id="${escapeHtml(movie.id)}" type="button" aria-label="Rimuovi ${escapeHtml(movie.title)} dalla serata" title="Rimuovi">
						${icon('close')}
					</button>
				</div>
			</article>
		`).join('');
		const removeButton = data.upcoming
			? `
				<button id="clear-meeting" class="button secondary icon-only" type="button" aria-label="Rimuovi la serata" title="Rimuovi la serata">
					${icon('event_busy')}
				</button>
			`
			: '';
		const archiveButton = data.upcoming
			? `
				<button id="archive-meeting" class="button secondary icon-only" type="button" aria-label="Segna la serata come vista" title="Segna la serata come vista">
					${icon('task_alt')}
				</button>
			`
			: '';
		return `
			<section class="calendar-page">
				${pageHeader('Serata', 'Quando, dove e cosa si guarda.')}
				<form id="calendar-form" class="form-grid calendar-form">
					<div class="field">
						<label for="meeting-date">Data</label>
						<input id="meeting-date" name="date" type="date" value="${escapeHtml(meeting.date || '')}">
					</div>
					<div class="field">
						<label for="meeting-place">Luogo</label>
						<input id="meeting-place" name="place" type="text" maxlength="120" value="${escapeHtml(meeting.place || '')}" placeholder="Dove si guarda?">
					</div>
					<section class="field full movie-picks" aria-labelledby="scheduled-films-title">
						<h2 id="scheduled-films-title">
							Film in programma
							<span class="selected-movie-count">${scheduledMovies.length}</span>
						</h2>
						<div class="calendar-film-list">
							${scheduledRows || '<p class="help-text">Nessun film in programma. Aggiungili dalla watchlist.</p>'}
						</div>
					</section>
					<div class="field full calendar-actions">
						<div class="button-row">
							<button class="button icon-only" type="submit" aria-label="Salva la serata" title="Salva la serata">
								${icon('save')}
							</button>
							<a class="button secondary icon-only" href="#lista" aria-label="Aggiungi un film" title="Aggiungi un film">
								${icon('add')}
							</a>
							${archiveButton}
							${removeButton}
						</div>
					</div>
				</form>
			</section>
		`;
	}

	// Diario: le visioni dalla più recente, raggruppate per giorno, con ricerca per titolo (PIANO.md, §6).
	function renderDiary() {
		const header = pageHeader('Diario', 'Quello che hai visto.');
		if (!(getData().viewings || []).length) {
			return `${header}${emptyState('Il diario è vuoto. Segna come visto un titolo dalla watchlist o dalla sua scheda.', 'Vai alla Watchlist', '#lista')}`;
		}
		return `
			${header}
			<section class="archive-search-area">
				<form id="diary-search-form" class="search-bar" role="search" autocomplete="off">
					<div class="search-input-wrap">
						<label class="visually-hidden" for="diary-query">Cerca un titolo nel diario</label>
						<input id="diary-query" type="search" placeholder="Cerca un titolo nel diario" aria-label="Cerca un titolo nel diario" value="${escapeHtml(getDiaryQuery())}">
					</div>
				</form>
			</section>
			<div id="diary-rows" class="list-stack">${renderDiaryRows()}</div>
			${backToTopButton()}
		`;
	}

	function renderDiaryRows() {
		const query = getDiaryQuery().trim().toLocaleLowerCase('it');
		const viewings = (getData().viewings || []).filter(viewing => !query || String(viewing.movie.title || '').toLocaleLowerCase('it').includes(query));
		if (!viewings.length) return emptyState('Nessuna visione con questo titolo.');
		const days = [];
		viewings.forEach(viewing => {
			const last = days[days.length - 1];
			if (last && last.date === viewing.date) last.items.push(viewing);
			else days.push({ date: viewing.date, items: [viewing] });
		});
		return days.map(day => `
			<article class="archive-entry">
				<h2 class="archive-date"><time datetime="${escapeHtml(day.date)}">${escapeHtml(formatDate(day.date))}</time></h2>
				<div class="archive-films">${day.items.map(diaryRow).join('')}</div>
			</article>
		`).join('');
	}

	const viewingMeta = viewing => [viewing.place, viewing.withWhom ? `con ${viewing.withWhom}` : ''].filter(Boolean).join(' · ');

	function diaryRow(viewing) {
		const movie = viewing.movie;
		const meta = viewingMeta(viewing);
		const notes = sanitizeNotes(viewing.notes).html;
		return `
			<article class="archive-film-row diary-row">
				${moviePosterButton(movie, 'archive-film-poster')}
				<div class="archive-film-copy">
					<h3 class="archive-film-title">${escapeHtml(movieName(movie))}</h3>
					${meta ? `<p class="diary-meta">${escapeHtml(meta)}</p>` : ''}
					<div class="review-summary">${ratingSummary(viewing.rating)}</div>
					${notes ? `<div class="review-content diary-notes">${notes}</div>` : ''}
				</div>
				<div class="archive-film-actions">
					${infoButton(movie)}
					<button class="icon-button small viewing-edit" data-viewing-id="${escapeHtml(viewing.id)}" type="button" aria-label="Modifica la visione di ${escapeHtml(movie.title)} del ${escapeHtml(formatDate(viewing.date))}" title="Modifica">${icon('edit')}</button>
				</div>
			</article>
		`;
	}

	// Dieci gatti (uno solo quando la card è stretta) e il voto in parole; senza voto, gatti vuoti.
	function ratingSummary(rating) {
		if (!rating) {
			return `<span class="review-stars cat-rating" aria-hidden="true">${catCells(0)}</span><span class="review-stars-compact" aria-hidden="true">${catCell('empty')}</span><span class="review-rating-label">Senza voto</span>`;
		}
		return `<span class="review-stars cat-rating" role="img" aria-label="${escapeHtml(formatSpipe(rating))}">${catCells(rating)}</span><span class="review-stars-compact" aria-hidden="true">${catCell('full')}</span><span class="review-rating-label">${escapeHtml(formatSpipe(rating))}</span>`;
	}

	// "I miei voti" nella scheda del titolo: tutte le visioni, dalla più recente, con la media se sono più di una.
	function renderMyViewings(movie) {
		const { list, average, ratedCount } = viewingsOf(getData(), movie.id);
		const inWatchlist = getData().movies.some(item => item.id === movie.id);
		const markLabel = list.length ? 'Segna come visto di nuovo' : 'Segna come visto';
		const markButton = `<button class="button secondary mark-seen" data-movie-id="${escapeHtml(movie.id)}" type="button">${icon('task_alt')}<span>${markLabel}</span></button>`;
		if (!list.length) return inWatchlist ? `<div class="movie-info-mark">${markButton}</div>` : '';
		const rounded = average === null ? null : Math.round(average * 2) / 2;
		const summary = ratedCount > 1
			? `<p class="my-viewings-average">Media ${escapeHtml(formatSpipe(rounded))} · ${list.length} visioni</p>`
			: list.length > 1 ? `<p class="my-viewings-average">${list.length} visioni</p>` : '';
		return `
			<h3 id="movie-info-viewings-title" class="movie-vote-title">I miei voti</h3>
			${summary}
			<ul class="my-viewings">
				${list.map(viewing => {
					const meta = viewingMeta(viewing);
					const notes = sanitizeNotes(viewing.notes).text;
					return `
						<li>
							<button class="my-viewing" type="button" data-viewing-id="${escapeHtml(viewing.id)}" aria-label="Modifica la visione del ${escapeHtml(formatDate(viewing.date))}">
								<span class="my-viewing-date">${escapeHtml(formatDate(viewing.date))}</span>
								<span class="review-summary">${ratingSummary(viewing.rating)}</span>
								${meta ? `<span class="diary-meta">${escapeHtml(meta)}</span>` : ''}
								${notes ? `<span class="my-viewing-notes">${escapeHtml(notes.length > 140 ? `${notes.slice(0, 140).trim()}…` : notes)}</span>` : ''}
							</button>
						</li>
					`;
				}).join('')}
			</ul>
			<div class="movie-info-mark">${markButton}</div>
		`;
	}

	// Modulo della visione (nuova o da modificare) nel dialog del diario. Lo slider dei gatti e l'editor delle note sono
	// quelli delle recensioni del sito (review-editor.js), con il voto facoltativo.
	function renderViewingForm({ movie, viewing = null, inWatchlist = false }) {
		const rating = viewing?.rating ? Number(viewing.rating) : 0;
		const id = viewing ? escapeHtml(viewing.id) : 'new';
		return `
			<form class="review-form viewing-form" data-review-form="${escapeHtml(movie.id)}" data-viewing-form${viewing ? ` data-viewing-id="${id}"` : ''} novalidate>
				<p class="viewing-form-title">${escapeHtml(movieName(movie))}</p>
				<div class="form-grid">
					<div class="field">
						<label for="viewing-date-${id}">Data</label>
						<input id="viewing-date-${id}" name="date" type="date" required value="${escapeHtml(viewing?.date || today())}" max="${escapeHtml(today())}">
					</div>
					<div class="field">
						<label for="viewing-place-${id}">Dove <span>(facoltativo)</span></label>
						<input id="viewing-place-${id}" name="place" type="text" maxlength="120" value="${escapeHtml(viewing?.place || '')}" placeholder="Divano, cinema…">
					</div>
					<div class="field full">
						<label for="viewing-with-${id}">Con chi <span>(facoltativo)</span></label>
						<input id="viewing-with-${id}" name="withWhom" type="text" maxlength="120" value="${escapeHtml(viewing?.withWhom || '')}">
					</div>
				</div>
				<fieldset class="review-rating">
					<legend id="viewing-rating-label-${id}">Il tuo voto <span>(facoltativo)</span></legend>
					<input type="hidden" name="rating" value="${rating || ''}">
					<div class="rating-slider cat-rating" data-rating-slider role="slider" tabindex="0"
						aria-labelledby="viewing-rating-label-${id}" aria-valuemin="0.5" aria-valuemax="10"
						${rating ? `aria-valuenow="${rating}" aria-valuetext="${escapeHtml(formatSpipe(rating))}"` : 'aria-valuetext="Nessun voto"'}>${catCells(rating)}</div>
					<div class="rating-row">
						<output class="review-rating-output">${rating ? formatSpipe(rating) : 'Seleziona un punteggio da mezza spipa a dieci spipe'}</output>
						<button class="text-button viewing-clear-rating" type="button"${rating ? '' : ' hidden'}>Togli il voto</button>
					</div>
				</fieldset>
				${richEditor({ label: 'Note <span>(facoltative)</span>', toolbarLabel: 'Formattazione delle note', textLabel: 'Note sulla visione', content: viewing ? sanitizeNotes(viewing.notes).html : '' })}
				${!viewing && inWatchlist ? `
					<label class="viewing-remove-watchlist">
						<input class="switch" name="removeFromWatchlist" type="checkbox" role="switch" checked>
						<span>Togli dalla watchlist</span>
					</label>
				` : ''}
				<div class="button-row review-form-actions">
					<button class="button" type="submit">Salva</button>
					${viewing ? '<button class="button secondary viewing-delete" type="button">Elimina</button>' : ''}
					<button class="button secondary viewing-cancel" type="button">Annulla</button>
				</div>
			</form>
		`;
	}

	// Editor di testo formattato delle recensioni (dalla Fase 1 anche delle note del diario): barra degli strumenti, area di testo e
	// contatore (20.000 caratteri). `label` è HTML già sicuro; i comandi sono gestiti in script.js.
	function richEditor({ label, toolbarLabel, textLabel, content = '' }) {
		return `
			<div class="review-editor-wrap">
				<span class="review-editor-label">${label}</span>
				<div class="review-toolbar" role="toolbar" aria-label="${toolbarLabel}">
					<button type="button" data-review-format="bold" aria-label="Grassetto" title="Grassetto">${icon('format_bold')}</button>
					<button type="button" data-review-format="italic" aria-label="Corsivo" title="Corsivo">${icon('format_italic')}</button>
					<button type="button" data-review-format="strikeThrough" aria-label="Barrato" title="Barrato">${icon('strikethrough_s')}</button>
					<button type="button" data-review-format="formatBlock" data-review-value="blockquote" aria-label="Citazione" title="Citazione">${icon('format_quote')}</button>
					<button type="button" data-review-format="insertUnorderedList" aria-label="Elenco puntato" title="Elenco puntato">${icon('format_list_bulleted')}</button>
					<button type="button" data-review-format="insertOrderedList" aria-label="Elenco numerato" title="Elenco numerato">${icon('format_list_numbered')}</button>
					<button type="button" data-review-format="createLink" aria-label="Inserisci link esterno" title="Inserisci link esterno">${icon('link')}</button>
				</div>
				<div class="review-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${textLabel}" data-review-editor>${content}</div>
				<p class="review-character-count" aria-live="polite">0 / 20.000 caratteri</p>
			</div>
		`;
	}

	function backToTopButton() {
		return `
			<button id="back-to-top" class="icon-button back-to-top" type="button" aria-label="Torna su" title="Torna su" hidden>
				${icon('arrow_upward')}
			</button>
		`;
	}

	// Randomizer: lo stato (film in gioco, opzioni, esclusi) arriva da randomizer.js; senza, si estrae fra tutti.
	const randomizerState = () => getRandomizerState?.() || {
		pool: selectableMovies(), weighted: false, filters: DEFAULT_DRAW_FILTERS, excludedCount: 0, oddsOpen: false
	};
	const minVotesLabel = minVotes => (minVotes ? `Almeno ${HYPE_LEVELS[minVotes]?.emoji || minVotes}` : 'Tutti');
	// Il pulsante dei filtri (mobile) risulta premuto se qualche opzione è diversa da quella di partenza.
	const randomizerFiltered = ({ weighted, filters }) => Boolean(filters.type || filters.minVotes > 0 || !weighted);

	function randomizerChip(filter, value, content, active, label = '') {
		return `<button class="user-filter-chip${active ? ' active' : ''}" type="button" data-randomizer-filter="${filter}" data-value="${escapeHtml(value)}" data-randomizer-control aria-pressed="${active}"${label ? ` aria-label="${escapeHtml(label)}"` : ''}>${content}</button>`;
	}

	// Opzioni prima di girare: tipo, Hypometro minimo e peso dei voti.
	// Su desktop stanno sopra la slot; su mobile randomizer.js le sposta nel modale dei filtri quando si apre.
	function randomizerOptions(movies, { weighted, filters }) {
		const maxVotes = Math.max(0, ...movies.map(movie => watchlistVotes(movie).total));
		const minVotes = Math.min(filters.minVotes, maxVotes);
		const types = [['', 'Tutti'], ['movie', 'Film'], ['series', 'Serie TV']];
		return `
			<section id="randomizer-options" class="randomizer-options" aria-label="Opzioni dell’estrazione">
				<div class="randomizer-option">
					<p class="filter-label">Tipo</p>
					<div class="user-filter" role="group" aria-label="Tipo di contenuto">
						${types.map(([value, label]) => randomizerChip('type', value, label, filters.type === value)).join('')}
					</div>
				</div>
				${maxVotes ? `
					<div class="randomizer-option vote-filter">
						<label class="filter-label" for="randomizer-min-votes">${escapeHtml(HYPE_TITLE)} minimo</label>
						<div class="vote-filter-control">
							<input id="randomizer-min-votes" type="range" min="0" max="${maxVotes}" step="1" value="${minVotes}" data-randomizer-control
								aria-valuetext="${escapeHtml(minVotesLabel(minVotes))}" aria-describedby="randomizer-min-votes-value">
							<output id="randomizer-min-votes-value" for="randomizer-min-votes">${escapeHtml(minVotesLabel(minVotes))}</output>
						</div>
					</div>
				` : ''}
				<div class="randomizer-option">
					<p class="filter-label">Calibrazione</p>
					<label class="randomizer-weighted">
						<input id="randomizer-weighted" class="switch" type="checkbox" role="switch" data-randomizer-control${weighted ? ' checked' : ''}>
						<span>Pesa con l’${escapeHtml(HYPE_TITLE)}<small>Più voglia hai di vederlo, più spesso esce</small></span>
					</label>
				</div>
			</section>
		`;
	}

	// Sopra la slot: quanti titoli sono in gioco ed esclusi da ripristinare.
	function renderRandomizerCount() {
		const { pool, excludedCount } = randomizerState();
		const excludedText = excludedCount
			? ` · ${excludedCount} ${excludedCount === 1 ? 'escluso' : 'esclusi'} <button id="restore-excluded" class="text-button" type="button" data-randomizer-control>Ripristina</button>`
			: '';
		return pool.length
			? `<strong>${pool.length}</strong> ${pool.length === 1 ? 'titolo' : 'titoli'} in gioco${excludedText}`
			: `Nessun titolo in gioco con queste opzioni${excludedText}`;
	}

	// Sotto la slot: probabilità di ciascun film (barra proporzionale al più probabile).
	function renderRandomizerOdds() {
		const { pool, weighted, oddsOpen } = randomizerState();
		if (!pool.length) return '';
		const chances = drawChances(pool, weighted);
		const topChance = chances[0].chance || 1;
		const rows = chances.map(({ movie, chance }) => {
			const votes = watchlistVotes(movie);
			return `
				<li class="randomizer-odds-row" style="--bar: ${((chance / topChance) * 100).toFixed(1)}%">
					<span class="randomizer-odds-title">${escapeHtml(movieName(movie))}</span>
					<span class="randomizer-odds-votes" title="${escapeHtml(formatHype(votes.mine))}">${votes.mine === null ? '–' : escapeHtml(hypeLevel(votes.mine).emoji)}</span>
					<span class="randomizer-odds-chance">${formatChance(chance)}</span>
				</li>
			`;
		}).join('');
		return `
			<details class="randomizer-odds"${oddsOpen ? ' open' : ''}>
				<summary>Probabilità di uscita</summary>
				<ol class="randomizer-odds-list">${rows}</ol>
			</details>
		`;
	}

	function renderComingFilms() {
		const movies = selectableMovies();
		const state = randomizerState();
		const picked = movies.find(movie => movie.id === getSelectedMovieId());
		const header = pageHeader('Randomizer', 'Scegli random il prossimo film!');
		if (!movies.length) {
			return `${header}${emptyState('Tutti i film in watchlist sono già in programma o non ci sono titoli disponibili.', 'Vai alla Watchlist', '#lista')}`;
		}
		const soundLabel = soundEnabled() ? 'Spegni i suoni' : 'Accendi i suoni';
		// Una riga di sole icone con il dado grande al centro: a sinistra suoni ed escludi, a destra aggiungi e info.
		// I nomi restano in aria-label e tooltip.
		const spinLabel = picked ? 'Gira ancora' : 'Gira';
		const actions = `
			<div class="roulette-actions">
				<div class="roulette-actions-side start">
					<button id="roulette-sound" class="icon-button roulette-action" type="button" aria-pressed="${!soundEnabled()}" aria-label="${soundLabel}" title="${soundLabel}">
						${icon(soundEnabled() ? 'volume_up' : 'volume_off')}
					</button>
				${picked ? `
					<button id="exclude-picked" class="icon-button roulette-action" type="button" data-randomizer-control aria-label="Escludi e rigira" title="Escludi e rigira: il film resta in watchlist, è escluso solo fino al ricaricamento della pagina">
						${icon('close')}
					</button>
				` : ''}
				</div>
				<button id="choose-film" class="button icon-only roulette-spin" type="button" data-randomizer-control aria-label="${spinLabel}" title="${spinLabel}" ${state.pool.length ? '' : 'disabled'}>
					${icon('casino')}
				</button>
				<div class="roulette-actions-side end">
				${picked ? `
					<button id="add-picked" class="icon-button roulette-action" type="button" data-randomizer-control aria-label="Aggiungi alla serata" title="Aggiungi alla serata">
						${icon('add')}
					</button>
				` : ''}
				${picked ? infoButton(picked).replace('icon-button small movie-info-trigger', 'icon-button roulette-action movie-info-trigger') : ''}
				</div>
			</div>
		`;
		// Rullo: a riposo mostra il film estratto (o un punto di domanda); durante il giro randomizer.js lo riempie.
		const reelItem = picked
			? `<div class="reel-item">${moviePosterButton(picked, 'roulette-poster')}</div>`
			: '<div class="reel-item"><div class="roulette-poster placeholder" aria-hidden="true">?</div></div>';
		return `
			${header}
			<div id="randomizer-options-slot" class="randomizer-options-slot">${randomizerOptions(movies, state)}</div>
			<div class="randomizer-toolbar">
				<p id="randomizer-count" class="randomizer-count">${renderRandomizerCount()}</p>
				<div class="randomizer-toolbar-actions">
					<!-- Solo mobile: suoni e info stanno qui, fuori dalla slot e sempre visibili (su desktop sono nella riga dei pulsanti). -->
					<button id="roulette-sound-bar" class="icon-button randomizer-bar-button" type="button" aria-pressed="${!soundEnabled()}" aria-label="${soundLabel}" title="${soundLabel}">
						${icon(soundEnabled() ? 'volume_up' : 'volume_off')}
					</button>
					${picked
		? infoButton(picked).replace('class="icon-button small movie-info-trigger"', 'class="icon-button randomizer-bar-button movie-info-trigger" data-randomizer-control')
		: `<button class="icon-button randomizer-bar-button" type="button" disabled aria-label="Informazioni sul film estratto" title="Informazioni">${icon('info')}</button>`}
				<button id="randomizer-filter-open" class="icon-button watchlist-filter-open randomizer-filter-open" type="button" aria-label="Opzioni dell’estrazione" title="Opzioni" aria-haspopup="dialog" aria-controls="randomizer-filter-dialog" aria-pressed="${randomizerFiltered(state)}" data-randomizer-control>
					${icon('filter_list')}
				</button>
				</div>
			</div>
			<div id="roulette" class="roulette">
				${picked ? `<div class="roulette-backdrop" aria-hidden="true">${poster(picked, 'roulette-backdrop-image')}</div>` : ''}
				<div class="roulette-inner">
					<div class="roulette-stage">
						<div class="roulette-window">
							<div id="roulette-reel" class="roulette-reel">${reelItem}</div>
						</div>
					</div>
					<p class="roulette-title"><span id="roulette-current" class="roulette-current">${escapeHtml(picked ? movieName(picked) : 'Chi sarà?')}</span></p>
					${actions}
				</div>
			</div>
			<div id="randomizer-odds" class="randomizer-pool">${renderRandomizerOdds()}</div>
			<dialog id="randomizer-filter-dialog" class="action-dialog movie-info-dialog watchlist-filter-dialog" aria-labelledby="randomizer-filter-title">
				<button id="randomizer-filter-close" class="icon-button movie-info-close" type="button" aria-label="Chiudi" title="Chiudi">
					${icon('close')}
				</button>
				<div class="watchlist-filter-content">
					<h2 id="randomizer-filter-title" class="section-title">Opzioni</h2>
					<div id="randomizer-filter-body"></div>
				</div>
			</dialog>
		`;
	}

	function sortToolbar() {
		const [sortField, sortDirection] = getMovieSort().split('-');
		const tabs = SORT_FIELDS.map(({ field, icon: iconName, label }) => `
			<button class="sort-tab sort-tab-icon${sortField === field ? ' active' : ''}" data-field="${field}" type="button" aria-label="Ordina per ${escapeHtml(label.toLowerCase())}" title="${escapeHtml(label)}">
				${icon(iconName)}
			</button>
		`).join('');
		const directionIcon = sortDirection === 'desc' ? 'arrow_downward' : 'arrow_upward';
		const directionLabel = `Ordine ${sortDirection === 'desc' ? 'discendente' : 'ascendente'}`;
		return `
			<div class="list-toolbar">
				<div class="sort-switch" role="tablist" aria-label="Ordina la watchlist">
					<span class="sort-switch-indicator" aria-hidden="true"></span>
					${tabs}
				</div>
				<button id="sort-direction" class="icon-button sort-direction" type="button" aria-label="${directionLabel}" title="${directionLabel}">
					${icon(directionIcon)}
				</button>
			</div>
		`;
	}

	function renderMovieList() {
		const adding = getMovieSearchMode() === 'omdb';
		const toggleLabel = adding ? 'Torna alla ricerca nella watchlist' : 'Cerca un titolo da aggiungere';
		return `
			${pageHeader('Watchlist', 'Quello che vuoi vedere.')}
			<section class="list-search-area">
				<form id="movie-search-form" class="search-bar" role="search" autocomplete="off">
					<div id="watchlist-search-input" class="search-input-wrap" ${adding ? 'hidden' : ''}>
						<label class="visually-hidden" for="watchlist-query">Cerca nella watchlist</label>
						<input id="watchlist-query" type="search" placeholder="Cerca nella watchlist" aria-label="Cerca nella watchlist" value="${escapeHtml(getWatchlistQuery())}">
					</div>
						<div id="omdb-search-input" class="search-input-wrap" ${adding ? '' : 'hidden'}>
							<label class="visually-hidden" for="movie-query">Cerca un titolo da aggiungere</label>
							<input id="movie-query" type="search" placeholder="Cerca un film o una serie" aria-label="Cerca un film o una serie da aggiungere" value="${escapeHtml(getOmdbQuery())}">
						</div>
						<button id="search-mode-toggle" class="icon-button search-mode-toggle" type="button" aria-label="${toggleLabel}" title="${toggleLabel}" aria-controls="watchlist-search-input omdb-search-input" aria-expanded="${adding}">
							${icon(adding ? 'close' : 'add')}
						</button>
				</form>
				<button id="watchlist-filter-open" class="icon-button watchlist-filter-open" type="button" aria-label="Filtri" title="Filtri" aria-haspopup="dialog" aria-controls="watchlist-filter-dialog" aria-pressed="${Boolean(getWatchlistType()) || getWatchlistMinVotes() > 0 || getWatchlistView() === 'cards'}">
					${icon('filter_list')}
				</button>
				<p id="search-status" class="visually-hidden" role="status" aria-live="polite"></p>
					<div id="search-loader" class="search-loader" hidden aria-hidden="true">
						<div class="loader"></div>
						<p>Ricerca in corso…</p>
					</div>
				<div id="search-results" class="search-results" hidden></div>
			</section>
			<div id="pending-additions" hidden></div>
			<section id="watchlist-section" ${adding ? 'hidden' : ''}>
				${sortToolbar()}
				<div id="movie-list-rows" class="list-stack movie-list" data-view="${getWatchlistView()}" data-mobile-cards-per-row="${getWatchlistMobileCardsPerRow()}" style="--cards-per-row: ${getWatchlistCardsPerRow()}; --mobile-cards-per-row: ${getWatchlistMobileCardsPerRow()}">${renderMovieRows()}</div>
			</section>
			${backToTopButton()}
		`;
	}

	// Hypometro sulla riga della watchlist, solo nella vista a lista e se il titolo è votato: l'emoji del livello.
	// Nella vista a card si vede solo nella scheda.
	function voteMarker(movie) {
		const { mine } = watchlistVotes(movie);
		if (mine === null) return '';
		const label = formatHype(mine);
		return `<span class="vote-marker" title="${escapeHtml(label)}"><span aria-hidden="true">${escapeHtml(hypeLevel(mine).emoji)}</span><span class="visually-hidden">${escapeHtml(label)}</span></span>`;
	}

	function renderMovieRows() {
		const data = getData();
		const scheduled = new Set(meetingMovies(data.upcoming).map(movie => movie.id));
		const [sortField, sortDirection] = getMovieSort().split('-');
		const query = getWatchlistQuery().trim().toLocaleLowerCase('it');
		const type = getWatchlistType();
		const minVotes = getWatchlistMinVotes();
		const movies = data.movies.filter(movie => (!type || contentType(movie) === type) && watchlistVotes(movie).total >= minVotes && [movie.title, movie.director, movie.year].some(value => String(value || '').toLocaleLowerCase('it').includes(query))).sort((first, second) => {
			let comparison;
			if (sortField === 'year') {
				const firstYear = Number(first.year);
				const secondYear = Number(second.year);
				const firstHasYear = first.year !== null && first.year !== undefined && String(first.year).trim() !== '' && Number.isFinite(firstYear);
				const secondHasYear = second.year !== null && second.year !== undefined && String(second.year).trim() !== '' && Number.isFinite(secondYear);
				if (firstHasYear !== secondHasYear) return firstHasYear ? -1 : 1;
				comparison = firstHasYear ? firstYear - secondYear : 0;
			} else if (sortField === 'votes') {
				// Più hype prima (in ordine discendente); a parità, i titoli votati prima di quelli senza voto.
				const firstVotes = watchlistVotes(first);
				const secondVotes = watchlistVotes(second);
				comparison = firstVotes.total - secondVotes.total || firstVotes.count - secondVotes.count;
			} else if (sortField === 'added') {
				comparison = (first.added_at || '').localeCompare(second.added_at || '');
			} else {
				comparison = first.title.localeCompare(second.title, 'it', { sensitivity: 'base' });
			}
			if (sortDirection === 'desc') comparison *= -1;
			return comparison || first.title.localeCompare(second.title, 'it', { sensitivity: 'base' });
		}).map(movie => `
			<article class="movie-row">
				${getWatchlistView() === 'cards'
					? moviePosterButton(movie, 'movie-poster', 'movie-card-poster')
					: moviePosterButton(movie, 'movie-poster')}
				${getWatchlistView() === 'cards' ? '' : `
					<div>
						<h2 class="movie-title">${escapeHtml(movie.title)}</h2>
						${movieDetails(movie)}
						<p class="movie-year">
							${escapeHtml(movie.year || 'Anno non indicato')}
							${scheduled.has(movie.id) ? '<span class="scheduled-marker">In programma</span>' : ''}
							${voteMarker(movie)}
						</p>
					</div>
				`}
				<div class="movie-actions">
					${infoButton(movie)}
						<button class="button secondary icon-only mark-seen" data-movie-id="${escapeHtml(movie.id)}" type="button" aria-label="Segna ${escapeHtml(movie.title)} come visto" title="Segna come visto">
							${icon('task_alt')}
						</button>
						<button class="button secondary icon-only remove-movie" data-movie-id="${escapeHtml(movie.id)}" type="button" aria-label="Rimuovi ${escapeHtml(movie.title)} dalla watchlist" title="Rimuovi">
							${icon('delete')}
						</button>
						<button class="button icon-only schedule-movie" data-movie-id="${escapeHtml(movie.id)}" type="button" ${scheduled.has(movie.id) ? 'disabled' : ''} aria-label="Aggiungi ${escapeHtml(movie.title)} alla serata" title="Aggiungi alla serata">
							${icon('movie')}
						</button>
				</div>
			</article>
		`).join('');
		return movies || emptyState(data.movies.length && (query || type || minVotes)
			? 'Nessun titolo corrisponde alla ricerca o ai filtri.'
			: 'La watchlist è vuota. Cerca un titolo per aggiungere il primo film.');
	}

	function renderSettings() {
		const isNight = getColorMode() === 'night';
		return `
			${pageHeader('Impostazioni')}
			<section class="settings-panel">
				<div class="profile-setting-row">
					<div><p class="field-label">Aspetto</p><span data-theme-label>Modalità ${isNight ? 'notte' : 'giorno'}</span></div>
					<button class="theme-toggle" type="button" role="switch" aria-checked="${isNight}" aria-label="Modalità notte" title="Passa alla modalità ${isNight ? 'giorno' : 'notte'}" data-theme-toggle>
						<span class="theme-toggle-track" aria-hidden="true">
							${icon('light_mode')}${icon('dark_mode')}<span class="theme-toggle-thumb"></span>
						</span>
					</button>
				</div>
				<div class="profile-setting-row">
					<div><p class="field-label">Versione</p><span>myCimmena ${escapeHtml(APP_VERSION)}</span></div>
				</div>
			</section>
			<p class="app-credit">made with 🎬 by <a href="${escapeHtml(CREDIT_URL)}" target="_blank" rel="noopener noreferrer">${escapeHtml(CREDIT_HANDLE)}</a></p>
		`;
	}

	return { minVotesLabel, renderDiary, renderDiaryRows, renderMyViewings, renderViewingForm, renderCalendar, renderComingFilms, renderHome, renderMovieList, renderMovieRows, renderRandomizerCount, renderRandomizerOdds, renderSettings, randomizerFiltered };
}
