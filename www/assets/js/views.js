import { pageHeader } from './components.js';
import { icon } from './icons.js';
import { catState, formatSpipe } from './domain.js';
import { formatVoteTotal, HYPE_POINTS_EMOJI, HYPE_TITLE, watchlistVotes } from './hype.js';
import { DEFAULT_DRAW_FILTERS, drawChances, formatChance } from './draw.js';
import { soundEnabled } from './slot-sounds.js';
import { APP_VERSION, CREDIT_HANDLE, CREDIT_URL } from './app-info.js';

// Gatto SVG (simboli #cat-full e #cat-empty in index.html): la sagoma vuota sotto, quella calico sopra,
// ritagliata da CSS in base allo stato della cella (full, half, empty).
export const catCell = state => `<span class="cat-cell ${state}"><svg class="cat cat-empty-icon" aria-hidden="true" focusable="false"><use href="#cat-empty"/></svg><svg class="cat cat-fill" aria-hidden="true" focusable="false"><use href="#cat-full"/></svg></span>`;
export const catCells = rating => Array.from({ length: 10 }, (_, index) => catCell(catState(rating, index))).join('');

// Ordinamenti della watchlist: le icone delle linguette (sprite in index.html, disegnate per il Club) si cambiano qui;
// `label` è il nome letto dagli screen reader e mostrato passando il mouse. Per i voti il secchiello di popcorn
// richiama i punti dell'Hypometro.
export const SORT_FIELDS = Object.freeze([
	{ field: 'added', icon: 'sort_added', label: 'Aggiunto' },
	{ field: 'title', icon: 'sort_title', label: 'Titolo' },
	{ field: 'year', icon: 'sort_year', label: 'Anno' },
	{ field: 'votes', icon: 'sort_votes', label: 'Voti' }
]);

export function createViews(context) {
	const {
		getData,
		getArchiveQuery = () => '',
		getColorMode = () => 'day',
		getMovieSearchMode,
		getMovieSort,
		getOmdbQuery,
		getReviewState = () => null,
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
		if (!meeting) {
			return `
				<section class="home-view">
					${pageHeader('Home', 'La prossima serata.')}
					${emptyState('Non c’è ancora una serata in programma.', 'Organizza la prossima serata', '#calendario')}
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
				<button id="archive-meeting" class="button secondary icon-only" type="button" aria-label="Archivia la serata" title="Archivia la serata">
					${icon('archive')}
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

	function archiveEntries() {
		const data = getData();
		const expiredMeeting = data.upcoming?.date && data.upcoming.date < today() ? [data.upcoming] : [];
		return [...data.archive, ...expiredMeeting].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
	}

	function renderArchive() {
		if (!archiveEntries().length) {
			return `
				${pageHeader('Archivio', 'Le serate passate.')}
				${emptyState('L’archivio è ancora vuoto.')}
				${backToTopButton()}
			`;
		}
		return `
			${pageHeader('Archivio', 'Le serate passate.')}
			<section class="archive-search-area">
				<form id="archive-search-form" class="search-bar" role="search" autocomplete="off">
					<div class="search-input-wrap">
						<label class="visually-hidden" for="archive-query">Cerca un film nell’archivio</label>
						<input id="archive-query" type="search" placeholder="Cerca un film nell’archivio" aria-label="Cerca un film nell’archivio" value="${escapeHtml(getArchiveQuery())}">
					</div>
				</form>
			</section>
			<div id="archive-rows" class="list-stack">${renderArchiveRows()}</div>
			${backToTopButton()}
		`;
	}

	// Mostra le serate in cui almeno un film corrisponde alla ricerca, con tutti i film della serata.
	function renderArchiveRows() {
		const query = getArchiveQuery().trim().toLocaleLowerCase('it');
		const entries = archiveEntries().filter(entry => !query
			|| meetingMovies(entry).some(movie => String(movie.title || '').toLocaleLowerCase('it').includes(query)));
		if (!entries.length) return emptyState('Nessuna serata in archivio con questo film.');
		return entries.map(entry => {
			const films = meetingMovies(entry);
			const archived = entry.id !== undefined;
			const filmRows = films.length
				? films.map(movie => `
					<article class="archive-film-row">
						${moviePosterButton(movie, 'archive-film-poster')}
						<div class="archive-film-copy">
							<h4 class="archive-film-title">${escapeHtml(movieName(movie))}</h4>
							${movieDetails(movie)}
							${archived ? `
								${Number(movie.review_count) > 0
									? `<button class="review-summary review-summary-button" data-review-summary="${escapeHtml(movie.id)}" data-review-action="read" data-movie-id="${escapeHtml(movie.id)}" type="button" aria-label="Leggi le recensioni di ${escapeHtml(movie.title)}">${renderReviewSummary(movie)}</button>`
									: `<div class="review-summary" data-review-summary="${escapeHtml(movie.id)}">${renderReviewSummary(movie)}</div>`}
								<section id="review-panel-${escapeHtml(movie.id)}" class="review-panel" data-review-panel="${escapeHtml(movie.id)}" hidden></section>
							` : ''}
						</div>
						${archived ? `<div class="archive-film-actions">${context.infoButton(movie)}${renderReviewActions(movie)}</div>` : ''}
					</article>
				`).join('')
				: '<p class="archive-empty-film">Film non indicato</p>';
			return `
				<article class="archive-entry">
					<h2 class="archive-date">
						<time datetime="${escapeHtml(entry.date || '')}">${escapeHtml(formatDate(entry.date) || 'Data non indicata')}</time>
					</h2>
					<h3 class="archive-place">${escapeHtml(entry.place || 'Luogo non indicato')}</h3>
					<div class="archive-films">${filmRows}</div>
				</article>
			`;
		}).join('');
	}

	function renderReviewSummary(movie) {
		const count = Math.max(0, Number(movie.review_count) || 0);
		const average = Number(movie.average_rating);
		if (!count || !Number.isFinite(average)) {
			return `<span class="review-stars cat-rating" aria-hidden="true">${catCells(0)}</span><span class="review-stars-compact" aria-hidden="true">${catCell('empty')}</span><span class="visually-hidden">Nessuna recensione</span>`;
		}
		const rounded = Math.round(average * 2) / 2;
		// Il gatto singolo sostituisce i dieci quando la card è troppo stretta (container query in style.css).
		return `<span class="review-stars cat-rating" role="img" aria-label="${rounded.toFixed(1)} su 10">${catCells(rounded)}</span><span class="review-stars-compact" aria-hidden="true">${catCell('full')}</span><span class="review-rating-label">${average.toFixed(1)}</span>`;
	}

	// Matita se l'utente ha già recensito il film, altrimenti l'icona di aggiunta.
	function renderReviewWriteButton(movie) {
		const expanded = Boolean(getReviewState(movie.id)?.expanded);
		const labels = movie.my_review
			? `aria-label="Modifica la tua recensione di ${escapeHtml(movie.title)}" title="Modifica recensione"`
			: `aria-label="Aggiungi una recensione di ${escapeHtml(movie.title)}" title="Aggiungi recensione"`;
		return `<button class="icon-button small review-toggle" data-review-action="write" data-movie-id="${escapeHtml(movie.id)}" type="button" ${labels} aria-expanded="${expanded}" aria-controls="review-panel-${escapeHtml(movie.id)}">${icon(movie.my_review ? 'edit' : 'add_comment')}</button>`;
	}

	function renderReviewActions(movie) {
		const count = Math.max(0, Number(movie.review_count) || 0);
		const expanded = Boolean(getReviewState(movie.id)?.expanded);
		return `
			${renderReviewWriteButton(movie)}
			${count ? `<button class="icon-button small review-toggle" data-review-action="read" data-movie-id="${escapeHtml(movie.id)}" type="button" aria-label="Leggi ${count === 1 ? 'la recensione' : `le ${count} recensioni`} di ${escapeHtml(movie.title)}" title="Leggi recensioni" aria-expanded="${expanded}" aria-controls="review-panel-${escapeHtml(movie.id)}">${icon('forum')}</button>` : ''}
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

	function renderArchiveReviews(movieId, { dialog = false } = {}) {
		const state = getReviewState(movieId);
		if (state?.loading) return '<p class="help-text" role="status">Caricamento recensioni…</p>';
		if (!state) return '<p class="help-text">Caricamento recensioni…</p>';
		if (state.error) return `<p class="status-message error" role="alert">${escapeHtml(state.error)}</p>`;
		const reviews = Array.isArray(state.reviews) ? state.reviews : [];
		const ownReview = state.mine;
		const reviewRows = !state.editing && reviews.length
			? reviews.map(review => `
				<article class="member-review">
					<div class="review-author">
						<div class="review-author-lines">
							<span class="review-author-stars cat-rating" aria-hidden="true">${catCells(review.rating)}</span>
							<span>${formatSpipe(review.rating)}</span>
						</div>
					</div>
					${review.content ? `<div class="review-content">${review.content}</div>` : '<p class="help-text">Nessun testo aggiunto.</p>'}
				</article>
			`).join('')
			: state.editing ? '' : '<p class="help-text">Non ci sono ancora recensioni per questo film.</p>';
		const isEditing = Boolean(state.editing);
		const formVisible = isEditing || (!dialog && !ownReview);
		const selectedRating = ownReview ? Number(ownReview.rating) : 0;
		const editorContent = isEditing && ownReview ? ownReview.content : '';
		return `
			${isEditing ? '' : `<div class="review-list">${reviewRows}</div>`}
			${ownReview && !isEditing && !dialog ? `<button class="icon-button small review-edit" data-movie-id="${escapeHtml(movieId)}" type="button" aria-label="Modifica la tua recensione" title="Modifica la tua recensione">${icon('edit')}</button>` : ''}
			${formVisible ? `
				<form class="review-form" data-review-form="${escapeHtml(movieId)}" novalidate>
					<fieldset class="review-rating">
						<legend id="review-rating-label-${escapeHtml(movieId)}">Il tuo voto</legend>
						<input type="hidden" name="rating" value="${selectedRating || ''}">
						<!-- Slider a 20 step (mezzo gatto ciascuno): dito, mouse e tastiera sono gestiti in script.js. -->
						<div class="rating-slider cat-rating" data-rating-slider role="slider" tabindex="0"
							aria-labelledby="review-rating-label-${escapeHtml(movieId)}" aria-valuemin="0.5" aria-valuemax="10"
							${selectedRating ? `aria-valuenow="${selectedRating}" aria-valuetext="${escapeHtml(formatSpipe(selectedRating))}"` : 'aria-valuetext="Nessun voto"'}>${catCells(selectedRating)}</div>
						<output class="review-rating-output">${selectedRating ? formatSpipe(selectedRating) : 'Seleziona un punteggio da mezza spipa a dieci spipe'}</output>
					</fieldset>
					${richEditor({ label: 'La tua recensione <span>(facoltativa)</span>', toolbarLabel: 'Formattazione recensione', textLabel: 'Testo della recensione', content: editorContent })}
					<div class="button-row review-form-actions">
						<button class="icon-button small" type="submit" aria-label="${ownReview ? 'Salva modifiche' : 'Pubblica recensione'}" title="${ownReview ? 'Salva modifiche' : 'Pubblica recensione'}" ${ownReview ? 'disabled' : ''}>${icon(ownReview ? 'save' : 'done_all')}</button>
						${ownReview ? `<button class="icon-button small review-delete" data-movie-id="${escapeHtml(movieId)}" type="button" aria-label="Elimina recensione" title="Elimina recensione">${icon('delete')}</button><button class="icon-button small review-cancel" data-movie-id="${escapeHtml(movieId)}" type="button" aria-label="Annulla modifica" title="Annulla modifica">${icon('close')}</button>` : ''}
						${!ownReview && dialog ? `<button class="icon-button small review-cancel" data-movie-id="${escapeHtml(movieId)}" type="button" aria-label="Annulla recensione" title="Annulla">${icon('close')}</button>` : ''}
					</div>
				</form>
			` : ''}
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
	const minVotesLabel = minVotes => (minVotes ? `Almeno ${minVotes} ${HYPE_POINTS_EMOJI}` : 'Tutti');
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
						<span>Pesa con l’${escapeHtml(HYPE_TITLE)}<small>Più ${escapeHtml(HYPE_POINTS_EMOJI)} ha un film, più spesso esce</small></span>
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
					<span class="randomizer-odds-votes" title="${escapeHtml(formatVoteTotal(votes))}">${votes.total} ${escapeHtml(HYPE_POINTS_EMOJI)}</span>
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
		const toggleLabel = adding ? 'Torna alla ricerca nella watchlist' : 'Cerca un film da aggiungere su OMDb';
		return `
			${pageHeader('Watchlist', 'Quello che vuoi vedere.')}
			<section class="list-search-area">
				<form id="movie-search-form" class="search-bar" role="search" autocomplete="off">
					<div id="watchlist-search-input" class="search-input-wrap" ${adding ? 'hidden' : ''}>
						<label class="visually-hidden" for="watchlist-query">Cerca nella watchlist</label>
						<input id="watchlist-query" type="search" placeholder="Cerca nella watchlist" aria-label="Cerca nella watchlist" value="${escapeHtml(getWatchlistQuery())}">
					</div>
						<div id="omdb-search-input" class="search-input-wrap" ${adding ? '' : 'hidden'}>
							<label class="visually-hidden" for="movie-query">Cerca un film su OMDb</label>
							<input id="movie-query" type="search" placeholder="Cerca un film su OMDb" aria-label="Cerca un film su OMDb" value="${escapeHtml(getOmdbQuery())}">
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
						<p>Ricerca OMDb in corso...</p>
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

	// Punteggio dell'Hypometro sulla riga della watchlist, solo nella vista a lista e se qualcuno ha votato: "12 🍿".
	// Nella vista a card si vede solo nel modale del film.
	function voteMarker(movie) {
		const votes = watchlistVotes(movie);
		if (!votes.count) return '';
		const label = `${HYPE_TITLE}: ${formatVoteTotal(votes)}`;
		return `<span class="vote-marker" title="${escapeHtml(label)}"><span aria-hidden="true">${votes.total} ${escapeHtml(HYPE_POINTS_EMOJI)}</span><span class="visually-hidden">${escapeHtml(label)}</span></span>`;
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
				// Più punti prima (in ordine discendente); a parità di punti conta chi ha più votanti.
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
						<button class="button secondary icon-only remove-movie" data-movie-id="${escapeHtml(movie.id)}" type="button" aria-label="Rimuovi ${escapeHtml(movie.title)} dalla watchlist" title="Rimuovi">
							${icon('delete')}
						</button>
						<button class="button icon-only schedule-movie" data-movie-id="${escapeHtml(movie.id)}" type="button" ${scheduled.has(movie.id) ? 'disabled' : ''} aria-label="Segna ${escapeHtml(movie.title)} come prossimo film" title="Guarda">
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

	return { minVotesLabel, renderArchive, renderArchiveReviews, renderArchiveRows, renderReviewSummary, renderReviewWriteButton, renderCalendar, renderComingFilms, renderHome, renderMovieList, renderMovieRows, renderRandomizerCount, renderRandomizerOdds, renderSettings, randomizerFiltered };
}
