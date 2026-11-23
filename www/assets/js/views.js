import { pageHeader } from './components.js';
import { icon } from './icons.js';
import { catState, formatSpipe } from './domain.js';
import { formatHype, HYPE_LEVELS, HYPE_POINTS_EMOJI, HYPE_TITLE, hypeLevel, watchlistVotes } from './hype.js';
import { sanitizeNotes } from './sanitize.js';
import { viewingLabel, viewingsOf } from './app-data.js';
import { DEFAULT_DRAW_FILTERS, drawChances, formatChance } from './draw.js';
import { soundEnabled } from './slot-sounds.js';
import { APP_VERSION, CREDIT_HANDLE, CREDIT_URL, REPO_URL } from './app-info.js';
import { birthdayFields, birthdayMonthDay, COMPANY, diaryDefaults, flavourLine, isBirthday, LANGUAGES, PLACES, POPCORN, SPECTATORS } from './profile.js';
import { renderWatchingRow } from './series-ui.js';
import { renderMoviePicker } from './movie-picker.js';
import { IMPORT_SOURCES } from './watchlist-import.js';

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
		// Gruppi di episodi aperti nel diario (date|serie|giro), per tenerli aperti quando la lista si ridisegna.
		getDiaryOpenGroups = () => new Set(),
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
		today,
		// Riga "Versione" con il controllo degli aggiornamenti (update-ui.js).
		renderVersionRow = () => `<div class="profile-setting-row"><div><p class="field-label">Versione</p><span>myCimmena ${escapeHtml(APP_VERSION)}</span></div></div>`
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
					${renderBirthday(data)}
					${renderWatching()}
					<div class="empty-state">
						<p>Non c’è ancora una serata in programma.</p>
						<button class="button secondary" type="button" data-edit-meeting>Organizza la prossima serata</button>
					</div>
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
				${pageHeader('Home', 'La prossima serata.', homeActions(meeting))}
				${renderBirthday(data)}
				<div class="home-eyebrow-row">
					<p class="eyebrow">La prossima serata</p>
					<button class="icon-button" type="button" data-edit-meeting aria-label="Modifica la prossima serata" title="Modifica">
						${icon('edit')}
					</button>
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

	// Condividi e "Aggiungi al calendario" (solo con la data) di fianco al titolo "Home".
	function homeActions(meeting) {
		return `
			<button id="share-home" class="icon-button" type="button" aria-label="Condividi la prossima serata" title="Condividi">
				${icon('share')}
			</button>
			${meeting.date ? `
				<button id="calendar-home" class="icon-button" type="button" aria-label="Aggiungi la prossima serata al calendario" title="Aggiungi al calendario">
					${icon('event_available')}
				</button>
			` : ''}
		`;
	}

	// Il giorno del compleanno (PIANO.md, §12): auguri in Home e il film del cuore "da riguardare".
	function renderBirthday(data) {
		if (!isBirthday(data.profile?.birthday, today())) return '';
		const name = data.profile?.name ? `, ${escapeHtml(data.profile.name)}` : '';
		const favorite = data.favorite ? `<p class="help-text">Per festeggiare: ${escapeHtml(movieName(data.favorite))}, il tuo film del cuore?</p>` : '';
		return `<div class="birthday-banner" role="status"><p class="birthday-title">🎂 Buon compleanno${name}!</p>${favorite}</div>`;
	}

	// "Stai guardando": serie in corso o in pausa, con il pulsante per segnare il prossimo episodio.
	function renderWatching() {
		const watching = getData().watching || [];
		if (!watching.length) return '';
		return `
			<section class="watching" aria-labelledby="watching-title">
				<h2 id="watching-title" class="section-title">Stai guardando</h2>
				${watching.map(item => renderWatchingRow(item, { poster })).join('')}
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

	// Modulo della prossima serata, nella finestra che si apre dalla matita in Home: data, luogo e i titoli in programma.
	// La croce toglie il titolo dal modulo (meeting.js); si salva tutto insieme con "Salva".
	function renderMeetingForm() {
		const data = getData();
		const meeting = data.upcoming || {};
		const scheduledMovies = meetingMovies(meeting);
		const scheduledRows = scheduledMovies.map(movie => `
			<article class="calendar-film-row" data-meeting-movie>
				<input type="hidden" name="movieIds" value="${escapeHtml(movie.id)}">
				${poster(movie, 'calendar-film-poster')}
				<div class="calendar-film-copy">
					<h3>${escapeHtml(movie.title)}</h3>
					<p>${escapeHtml(movie.year || 'Anno non indicato')}</p>
				</div>
				<button class="icon-button small" type="button" data-meeting-remove aria-label="Togli ${escapeHtml(movie.title)} dalla serata" title="Togli dalla serata">
					${icon('close')}
				</button>
			</article>
		`).join('');
		return `
			<form id="calendar-form" class="form-grid calendar-form">
				<div class="field">
					<label for="meeting-date">Data</label>
					<input id="meeting-date" name="date" type="date" value="${escapeHtml(meeting.date || '')}">
				</div>
				<div class="field">
					<label for="meeting-place">Luogo</label>
					<input id="meeting-place" name="place" type="text" maxlength="120" value="${escapeHtml(meeting.place || '')}" placeholder="Dove si guarda?">
				</div>
				${scheduledMovies.length ? `
					<section class="field full movie-picks" aria-labelledby="scheduled-films-title">
						<p id="scheduled-films-title" class="field-label">Titoli in programma</p>
						<div class="calendar-film-list">${scheduledRows}</div>
					</section>
				` : '<p class="field full help-text">Nessun titolo in programma: aggiungili dalla scheda di un titolo della watchlist.</p>'}
				<div class="button-row field full review-form-actions">
					<button class="button" type="submit">Salva</button>
					<button class="button secondary" type="button" data-meeting-cancel>Annulla</button>
					${data.upcoming ? '<button class="text-button" type="button" data-meeting-clear>Cancella la serata</button>' : ''}
				</div>
			</form>
		`;
	}

	// Diario: le visioni dalla più recente, raggruppate per giorno, con ricerca per titolo (PIANO.md, §6).
	function renderDiary() {
		const header = pageHeader('Diario', 'Quello che hai visto.', (getData().viewings || []).length
			? `<a class="icon-button" href="#statistiche" aria-label="Le tue statistiche" title="Statistiche">${icon('bar_chart')}</a>`
			: '');
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
				<div class="archive-films">${groupEpisodes(day.items).map(entry => (Array.isArray(entry) ? episodeGroupRow(day.date, entry) : diaryRow(entry))).join('')}</div>
			</article>
		`).join('');
	}

	// Nello stesso giorno gli episodi di una serie (stesso giro) stanno in un gruppo, al posto della prima visione;
	// un episodio solo resta una card normale. Il resto non cambia ordine.
	function groupEpisodes(items) {
		const groups = new Map();
		const entries = [];
		for (const viewing of items) {
			if (viewing.scope !== 'episodes') {
				entries.push(viewing);
				continue;
			}
			const key = `${viewing.movieId}|${viewing.round || 1}`;
			if (!groups.has(key)) {
				groups.set(key, []);
				entries.push(groups.get(key));
			}
			groups.get(key).push(viewing);
		}
		return entries.map(entry => (Array.isArray(entry) && entry.length === 1 && (entry[0].episodes || []).length <= 1 ? entry[0] : entry));
	}

	// Card del gruppo di episodi: la freccia apre l'elenco, con una card per episodio (voto, nota, matita).
	function episodeGroupRow(date, viewings) {
		const movie = viewings[0].movie;
		const items = viewings.flatMap(viewing => (viewing.episodes || []).map(episode => ({ viewing, episode })))
			.sort((first, second) => first.episode.s - second.episode.s || first.episode.e - second.episode.e);
		const label = viewingLabel({ scope: 'episodes', episodes: items.map(item => item.episode) }, movie.seasons);
		const metas = [...new Set(viewings.map(viewingMeta).filter(Boolean))];
		const key = `${date}|${movie.id}|${viewings[0].round || 1}`;
		// Media delle spipe degli episodi che hanno un voto loro (arrotondata alla mezza spipa).
		const rated = viewings.filter(viewing => (viewing.episodes || []).length === 1 && viewing.rating);
		const average = rated.length ? Math.round((rated.reduce((sum, viewing) => sum + Number(viewing.rating), 0) / rated.length) * 2) / 2 : null;
		return `
			<details class="diary-episodes" data-diary-group="${escapeHtml(key)}"${getDiaryOpenGroups().has(key) ? ' open' : ''}>
				<summary class="archive-film-row diary-row">
					${moviePosterButton(movie, 'archive-film-poster')}
					<div class="archive-film-copy">
						<h3 class="archive-film-title">${escapeHtml(movieName(movie))}</h3>
						<p class="diary-episodes-label">${escapeHtml(label)}</p>
						<p class="diary-meta">${items.length} episodi${metas.length === 1 ? ` · ${escapeHtml(metas[0])}` : ''}</p>
						${average ? `<div class="review-summary">${ratingSummary(average)}<span class="diary-average">media di ${rated.length === 1 ? '1 episodio' : `${rated.length} episodi`}</span></div>` : ''}
					</div>
					<div class="archive-film-actions">
						<span class="diary-episodes-toggle" aria-hidden="true">${icon('expand_more')}</span>
						<span class="visually-hidden">Mostra o nascondi gli episodi</span>
					</div>
				</summary>
				<div class="diary-episode-list">${items.map(({ viewing, episode }) => episodeCard(viewing, episode, movie)).join('')}</div>
			</details>
		`;
	}

	// Un episodio del gruppo. Voto e nota sono suoi solo se la visione è di quell'episodio soltanto: quelle di più
	// episodi insieme (fino alla 0.5) si separano quando si tocca la matita (diary.js, store.splitEpisode).
	function episodeCard(viewing, episode, movie) {
		const own = (viewing.episodes || []).length === 1;
		const name = viewingLabel({ scope: 'episodes', episodes: [episode] }, movie.seasons);
		const notes = own ? sanitizeNotes(viewing.notes).text.replace(/\s+/g, ' ').trim() : '';
		const edit = own
			? `class="icon-button small viewing-edit" data-viewing-id="${escapeHtml(viewing.id)}"`
			: `class="icon-button small diary-episode-edit" data-movie-id="${escapeHtml(movie.id)}" data-episode="${episode.s}-${episode.e}"`;
		return `
			<article class="diary-episode">
				<div class="diary-episode-copy">
					<p class="diary-episode-title">${escapeHtml(name)}</p>
					<div class="review-summary">${ratingSummary(own ? viewing.rating : null)}</div>
					${notes ? `<p class="review-content diary-notes">${escapeHtml(notes)}</p>` : ''}
				</div>
				<div class="diary-episode-actions">
					${own ? readButton(viewing, `${name} di ${movie.title}`) : ''}
					<button ${edit} type="button" aria-label="Modifica ${escapeHtml(name)} di ${escapeHtml(movie.title)}" title="Modifica">${icon('edit')}</button>
				</div>
			</article>
		`;
	}

	// Apre la visione in sola lettura (diary.js): data, dove, voto e note per intero, con la matita per modificarla.
	const readButton = (viewing, what) => `<button class="icon-button small viewing-read" data-viewing-id="${escapeHtml(viewing.id)}" type="button" aria-label="Leggi ${escapeHtml(what)}" title="Leggi">${icon('visibility')}</button>`;

	function renderViewingSummary(viewing) {
		const movie = viewing.movie;
		const meta = viewingMeta(viewing);
		const notes = sanitizeNotes(viewing.notes).html;
		return `
			<article class="viewing-summary">
				<button class="icon-button viewing-summary-edit" data-viewing-id="${escapeHtml(viewing.id)}" type="button" aria-label="Modifica questa visione" title="Modifica">${icon('edit')}</button>
				<div class="viewing-summary-head">
					<div>
						<p class="viewing-form-title">${escapeHtml(movieName(movie))}${viewing.label ? ` <span class="diary-label">· ${escapeHtml(viewing.label)}</span>` : ''}</p>
						<p class="viewing-summary-date">${escapeHtml(formatDate(viewing.date))}${meta ? ` · ${escapeHtml(meta)}` : ''}</p>
					</div>
				</div>
				<div class="review-summary">${ratingSummary(viewing.rating)}</div>
				${notes ? `<div class="review-content viewing-summary-notes">${notes}</div>` : '<p class="help-text">Nessuna nota.</p>'}
			</article>
		`;
	}

	// "Con chi" si legge dopo "con" ("con gli amici"), tranne "da solo/sola", che resta così.
	const withWhomText = withWhom => (/^da sol[oaie]$/i.test(String(withWhom).trim()) ? String(withWhom).trim().replace(/^d/, 'D') : `con ${withWhom}`);
	const viewingMeta = viewing => [viewing.place, viewing.withWhom ? withWhomText(viewing.withWhom) : ''].filter(Boolean).join(' · ');

	function diaryRow(viewing) {
		const movie = viewing.movie;
		const meta = viewingMeta(viewing);
		// Della nota solo il testo, con gli a capo diventati spazi: nel diario se ne vede una riga.
		const notes = sanitizeNotes(viewing.notes).text.replace(/\s+/g, ' ').trim();
		return `
			<article class="archive-film-row diary-row">
				${moviePosterButton(movie, 'archive-film-poster')}
				<div class="archive-film-copy">
					<h3 class="archive-film-title">${escapeHtml(movieName(movie))}${viewing.label ? ` <span class="diary-label">· ${escapeHtml(viewing.label)}</span>` : ''}</h3>
					${meta ? `<p class="diary-meta">${escapeHtml(meta)}</p>` : ''}
					<div class="review-summary">${ratingSummary(viewing.rating)}</div>
					${notes ? `<p class="review-content diary-notes">${escapeHtml(notes)}</p>` : ''}
				</div>
				<div class="archive-film-actions">
					${infoButton(movie)}
					${readButton(viewing, `la visione di ${movie.title} del ${formatDate(viewing.date)}`)}
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
		// "Segna come visto" sta sotto l'Hypometro, con "Aggiungi alla prossima serata" (movie-info.js).
		if (!list.length) return '';
		const rounded = average === null ? null : Math.round(average * 2) / 2;
		if (contentType(movie) === 'series') return renderSeriesVotes(movie, list);
		const summary = ratedCount > 1
			? `<p class="my-viewings-average">Media ${escapeHtml(formatSpipe(rounded))} · ${list.length} visioni</p>`
			: list.length > 1 ? `<p class="my-viewings-average">${list.length} visioni</p>` : '';
		return `
			<h3 id="movie-info-viewings-title" class="movie-vote-title">I miei voti</h3>
			${summary}
			<ul class="my-viewings">
				${list.map(viewing => myViewingItem(viewing)).join('')}
			</ul>
		`;
	}

	// Una visione nella lista di "I miei voti".
	function myViewingItem(viewing, prefix = '') {
		const meta = viewingMeta(viewing);
		const notes = sanitizeNotes(viewing.notes).text;
		return `
			<li class="my-viewing-item">
				<button class="my-viewing" type="button" data-viewing-id="${escapeHtml(viewing.id)}" aria-label="Modifica la visione del ${escapeHtml(formatDate(viewing.date))}">
					<span class="my-viewing-date">${escapeHtml(formatDate(viewing.date))}${prefix ? ` · ${escapeHtml(prefix)}` : ''}</span>
					<span class="review-summary">${ratingSummary(viewing.rating)}</span>
					${meta ? `<span class="diary-meta">${escapeHtml(meta)}</span>` : ''}
					${notes ? `<span class="my-viewing-notes">${escapeHtml(notes.length > 140 ? `${notes.slice(0, 140).trim()}…` : notes)}</span>` : ''}
				</button>
				${readButton(viewing, `la visione del ${formatDate(viewing.date)}`)}
			</li>
		`;
	}

	// "I miei voti" di una serie (PIANO.md, §7): voto complessivo, una riga per stagione (il voto della stagione o la
	// media delle sessioni), poi le sessioni per data.
	function renderSeriesVotes(movie, list) {
		const seriesVotes = list.filter(viewing => viewing.scope === 'series');
		const seasonVotes = list.filter(viewing => viewing.scope === 'season');
		const sessions = list.filter(viewing => viewing.scope !== 'series' && viewing.scope !== 'season');
		const seasonNumbers = [...new Set([...seasonVotes.map(viewing => viewing.season), ...sessions.flatMap(viewing => (viewing.episodes || []).map(episode => episode.s))])].sort((first, second) => first - second);
		const average = items => {
			const rated = items.filter(viewing => viewing.rating);
			return rated.length ? Math.round((rated.reduce((sum, viewing) => sum + Number(viewing.rating), 0) / rated.length) * 2) / 2 : null;
		};
		const seasonRows = seasonNumbers.map(n => {
			const own = seasonVotes.find(viewing => viewing.season === n && viewing.rating);
			const value = own ? Number(own.rating) : average(sessions.filter(viewing => (viewing.episodes || []).some(episode => episode.s === n)));
			return value ? `<li class="series-vote-row"><span>Stagione ${n}</span><span>${escapeHtml(formatSpipe(value))}${own ? '' : ' <small>(media delle sessioni)</small>'}</span></li>` : '';
		}).join('');
		const overall = seriesVotes.find(viewing => viewing.rating);
		return `
			<h3 id="movie-info-viewings-title" class="movie-vote-title">I miei voti</h3>
			${overall ? `<p class="my-viewings-average">Serie: ${escapeHtml(formatSpipe(Number(overall.rating)))}</p>` : ''}
			${seasonRows ? `<ul class="series-votes">${seasonRows}</ul>` : ''}
			<ul class="my-viewings">${list.map(viewing => myViewingItem(viewing, viewing.label)).join('')}</ul>
		`;
	}

	// Modulo della visione (nuova o da modificare) nel dialog del diario. Lo slider dei gatti e l'editor delle note sono
	// quelli delle recensioni del sito (review-editor.js), con il voto facoltativo.
	// `scope` e `season` per il voto a una stagione o a tutta la serie; una visione nuova propone "Dove" e "Con chi"
	// dalle risposte dell'onboarding.
	// `episode` ({ s, e }) con scope 'episodes': la visione di un episodio nuovo (dalla sezione Episodi della scheda).
	// `prefill` ({ date, place, withWhom }): per gli episodi, i dati dell'ultimo episodio della serie compilato a mano
	// (diary.js); riempiono i campi vuoti, e la data solo per un episodio nuovo.
	function renderViewingForm({ movie, viewing = null, inWatchlist = false, scope = null, season = null, episode = null, prefill = null }) {
		const rating = viewing?.rating ? Number(viewing.rating) : 0;
		const id = viewing ? escapeHtml(viewing.id) : 'new';
		const kind = viewing?.scope || scope;
		// Il voto a una stagione o alla serie non è una serata: niente "Dove" e "Con chi" proposti (per un episodio sì).
		const defaults = prefill || (viewing || (kind && kind !== 'episodes') ? {} : diaryDefaults(getData().profile));
		const date = viewing?.date || prefill?.date || today();
		const episodeName = episode ? viewingLabel({ scope: 'episodes', episodes: [episode] }, movie.seasons) : '';
		const subtitle = viewing?.label || episodeName || (kind === 'season' ? `Stagione ${season}` : kind === 'series' ? 'Voto alla serie' : '');
		return `
			<form class="review-form viewing-form" data-review-form="${escapeHtml(movie.id)}" data-viewing-form${viewing ? ` data-viewing-id="${id}"` : ''}${!viewing && kind ? ` data-scope="${escapeHtml(kind)}"${season ? ` data-season="${Number(season)}"` : ''}${episode ? ` data-episode="${Number(episode.s)}-${Number(episode.e)}"` : ''}` : ''} novalidate>
				<p class="viewing-form-title">${escapeHtml(movieName(movie))}${subtitle ? ` <span class="diary-label">· ${escapeHtml(subtitle)}</span>` : ''}</p>
				<div class="form-grid">
					<div class="field">
						<label for="viewing-date-${id}">Data</label>
						<input id="viewing-date-${id}" name="date" type="date" required value="${escapeHtml(date)}" max="${escapeHtml(today())}">
					</div>
					<div class="field">
						<label for="viewing-place-${id}">Dove <span>(facoltativo)</span></label>
						<input id="viewing-place-${id}" name="place" type="text" maxlength="120" value="${escapeHtml(viewing?.place || defaults.place || '')}" placeholder="Divano, cinema…">
					</div>
					<div class="field full">
						<label for="viewing-with-${id}">Con chi <span>(facoltativo)</span></label>
						<input id="viewing-with-${id}" name="withWhom" type="text" maxlength="120" value="${escapeHtml(viewing?.withWhom || defaults.withWhom || '')}">
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
				${!viewing && inWatchlist && !kind ? `
					<label class="viewing-remove-watchlist">
						<input class="switch" name="removeFromWatchlist" type="checkbox" role="switch" checked>
						<span>Togli dalla watchlist</span>
					</label>
				` : ''}
				<div class="button-row review-form-actions">
					<button class="button icon-button-wide" type="submit" aria-label="Salva" title="Salva">${icon('save')}</button>
					<button class="button secondary icon-button-wide viewing-cancel" type="button" aria-label="Annulla" title="Annulla">${icon('close')}</button>
				</div>
				${viewing ? deleteZone(viewing) : ''}
			</form>
		`;
	}

	// "Elimina" cancella tutta la visione, non solo la nota: sta in fondo, separato da Salva e Annulla, e dice
	// esattamente cosa toglie dal diario.
	function deleteZone(viewing) {
		const date = formatDate(viewing.date);
		const [label, help, question] = viewing.scope === 'episodes'
			? ['Elimina questa visione degli episodi', `Toglie dal diario la visione del ${date} con gli episodi ${viewing.label || ''}, che tornano da vedere.`, `Eliminare dal diario la visione del ${date}? Gli episodi ${viewing.label || ''} tornano da vedere.`]
			: viewing.scope === 'season' || viewing.scope === 'series'
				? ['Elimina questo voto', 'Toglie dal diario il voto con la sua nota.', 'Eliminare questo voto dal diario, con la sua nota?']
				: ['Elimina questa visione dal diario', `Toglie dal diario tutta la visione del ${date}, con voto e note.`, `Eliminare dal diario la visione del ${date}, con voto e note?`];
		return `
			<div class="viewing-delete-zone">
				<button class="text-button viewing-delete" type="button" data-confirm="${escapeHtml(question)}">${icon('delete')}<span>${escapeHtml(label)}</span></button>
				<p class="help-text">${escapeHtml(help)} Per cancellare solo la nota, svuotala e salva.</p>
			</div>
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
			${adding ? '' : renderWatching()}
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
						<button class="button icon-only schedule-movie" data-movie-id="${escapeHtml(movie.id)}" type="button" ${scheduled.has(movie.id) ? 'disabled' : ''} aria-label="Aggiungi ${escapeHtml(movie.title)} alla prossima serata" title="Aggiungi alla prossima serata">
							${icon('movie')}
						</button>
						<button class="button secondary icon-only remove-movie" data-movie-id="${escapeHtml(movie.id)}" type="button" aria-label="Rimuovi ${escapeHtml(movie.title)} dalla watchlist" title="Rimuovi">
							${icon('delete')}
						</button>
				</div>
			</article>
		`).join('');
		return movies || emptyState(data.movies.length && (query || type || minVotes)
			? 'Nessun titolo corrisponde alla ricerca o ai filtri.'
			: 'La watchlist è vuota. Cerca un titolo per aggiungere il primo film.');
	}

	const selectField = (name, label, options, value) => `
		<div class="field">
			<label for="profile-${name}">${label}</label>
			<select id="profile-${name}" name="${name}">
				<option value="">—</option>
				${options.map(option => `<option value="${escapeHtml(option.value)}"${option.value === value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
			</select>
		</div>
	`;

	const MODE_TEXT = {
		light: ['Light', 'Schede con i dati di IMDb: locandina, anno, tipo e attori principali.'],
		full: ['Completa', 'Trama, regista, cast, durata, genere, voto IMDb e premi da OMDb, con la tua chiave.'],
		waiting: ['Completa, in attesa della chiave', 'Finché la chiave OMDb non funziona le schede restano light.']
	};

	function renderSettings() {
		const data = getData();
		const isNight = getColorMode() === 'night';
		const profile = data.profile || {};
		const [modeTitle, modeText] = MODE_TEXT[data.mode] || MODE_TEXT.light;
		const key = data.settings?.omdbKey || '';
		// Della chiave si mostrano solo gli ultimi due caratteri, per riconoscerla senza svelarla.
		const maskedKey = key ? `••••••${key.slice(-2)}` : '';
		const flavour = flavourLine(profile);
		const lastBackup = data.meta?.lastBackupAt || '';
		const reminderOn = data.settings?.backupReminder !== false;
		const hasBirthday = Boolean(birthdayMonthDay(profile.birthday));
		const posterThemeOn = data.settings?.posterTheme !== false;
		return `
			${pageHeader('Impostazioni', profile.name ? `Ciao, ${profile.name}!` : 'Ciao!')}
			<section class="settings-panel">
				<div class="settings-profile">
					${data.favorite ? `<button class="movie-poster-trigger settings-favorite" data-movie-id="${escapeHtml(data.favorite.id)}" type="button" aria-label="Il tuo film del cuore: ${escapeHtml(data.favorite.title)}">${poster(data.favorite, 'archive-film-poster')}</button>` : ''}
					<div>
						${profile.name ? `<p class="settings-name">${escapeHtml(profile.name)}</p>` : ''}
						${flavour ? `<p class="help-text">${escapeHtml(flavour)}</p>` : ''}
						${data.favorite ? `<p class="help-text">Film del cuore: ${escapeHtml(movieName(data.favorite))}</p>` : ''}
					</div>
				</div>
				<details class="settings-group">
					<summary>Modifica il profilo</summary>
					<form id="profile-form" class="form-grid profile-settings-form">
						<div class="field"><label for="profile-name">Nome</label><input id="profile-name" name="name" type="text" maxlength="60" value="${escapeHtml(profile.name || '')}" autocomplete="given-name"></div>
						<div class="field"><label for="profile-birthday-day">Compleanno</label>${birthdayFields('profile-birthday', profile.birthday)}</div>
						<div class="field full">
							<span class="field-label">Film del cuore</span>
							${renderMoviePicker(data.favorite)}
						</div>
						${selectField('place', 'Dove guardi di solito', PLACES, profile.place)}
						${selectField('company', 'Con chi', COMPANY, profile.company)}
						${selectField('popcorn', 'Popcorn', POPCORN, profile.popcorn)}
						${selectField('language', 'Doppiato o sottotitoli', LANGUAGES, profile.language)}
						${selectField('spectator', 'Che spettatore sei', SPECTATORS, profile.spectator)}
						<div class="field"><label for="profile-director">Il regista che non sbaglia mai</label><input id="profile-director" name="director" type="text" maxlength="80" value="${escapeHtml(profile.director || '')}"></div>
						<div class="button-row field full"><button class="button" type="submit">Salva il profilo</button></div>
					</form>
				</details>
				<div class="profile-setting-row settings-mode">
					<div>
						<p class="field-label">Schede</p>
						<span>${escapeHtml(modeTitle)}</span>
						<p class="help-text">${escapeHtml(modeText)}${maskedKey ? ` Chiave: ${escapeHtml(maskedKey)}.` : ''}</p>
						<div class="button-row">
							${data.mode === 'light' ? '<button class="button secondary" type="button" data-settings-mode="full">Passa alla versione completa</button>' : ''}
							${data.mode !== 'light' ? `<button class="button secondary" type="button" data-open-key>${data.mode === 'full' ? 'Cambia la chiave' : 'Inserisci la chiave'}</button>` : ''}
							${data.mode !== 'light' ? '<button class="text-button" type="button" data-settings-mode="light">Torna alla versione light</button>' : ''}
						</div>
					</div>
				</div>
				<div class="profile-setting-row">
					<div><p class="field-label">Aspetto</p><span data-theme-label>Modalità ${isNight ? 'notte' : 'giorno'}</span></div>
					<button class="theme-toggle" type="button" role="switch" aria-checked="${isNight}" aria-label="Modalità notte" title="Passa alla modalità ${isNight ? 'giorno' : 'notte'}" data-theme-toggle>
						<span class="theme-toggle-track" aria-hidden="true">
							${icon('light_mode')}${icon('dark_mode')}<span class="theme-toggle-thumb"></span>
						</span>
					</button>
				</div>
				<div class="profile-setting-row settings-poster-theme">
					<div>
						<div class="setting-switch-row">
							<span id="poster-theme-label">Colori dal film del cuore</span>
							<button class="setting-switch" type="button" role="switch" aria-checked="${posterThemeOn}" aria-labelledby="poster-theme-label" aria-describedby="poster-theme-help" data-poster-theme-switch><span class="setting-switch-thumb" aria-hidden="true"></span></button>
						</div>
						<p class="help-text" id="poster-theme-help">${data.favorite
							? `L’accento e gli altri colori dell’app vengono dalla locandina di ${escapeHtml(movieName(data.favorite))}, di giorno e di notte. Spento, torna il rosso di myCimmena.`
							: 'Scegli un film del cuore in «Modifica il profilo»: l’app prenderà i colori dalla sua locandina.'}</p>
					</div>
				</div>
				<div class="profile-setting-row settings-backup">
					<div>
						<p class="field-label">Backup</p>
						<span>${lastBackup ? `Ultimo backup: ${escapeHtml(formatDate(today(new Date(lastBackup))))}` : 'Non hai ancora fatto un backup'}</span>
						<p class="help-text">I dati stanno solo su questo telefono: esporta un backup ogni tanto, e per cambiare telefono.</p>
						<div class="button-row"><button class="button secondary" type="button" data-open-backup>Esporta o ripristina</button></div>
						<div class="setting-switch-row">
							<span id="backup-reminder-label">Ricordamelo dopo 30 giorni senza backup</span>
							<button class="setting-switch" type="button" role="switch" aria-checked="${reminderOn}" aria-labelledby="backup-reminder-label" data-backup-reminder><span class="setting-switch-thumb" aria-hidden="true"></span></button>
						</div>
					</div>
				</div>
				<div class="profile-setting-row settings-import">
					<div>
						<p class="field-label">Importa da Letterboxd o IMDb</p>
						<span>${data.importJob ? `Importazione ${data.importJob.kind === 'diary' ? 'del diario' : 'della watchlist'} da ${escapeHtml(IMPORT_SOURCES[data.importJob.source] || '')} lasciata a metà` : 'Watchlist, diario e voti da Letterboxd o IMDb'}</span>
						<div class="button-row">
							${data.importJob
								? '<button class="button secondary" type="button" data-open-import>Riprendi l’importazione</button>'
								: '<button class="button secondary" type="button" data-open-import="watchlist">Importa watchlist</button><button class="button secondary" type="button" data-open-import="diary">Importa diario e voti</button>'}
						</div>
					</div>
				</div>
				<div class="profile-setting-row settings-notifications">
					<div>
						<p class="field-label">Notifiche</p>
						<div class="setting-switch-row">
							<span id="notify-birthday-label">Auguri alle 9 del giorno del compleanno${hasBirthday ? '' : ' (aggiungi la data in «Modifica il profilo»)'}</span>
							<button class="setting-switch" type="button" role="switch" aria-checked="${hasBirthday && data.settings?.notifyBirthday !== false}" aria-labelledby="notify-birthday-label" data-notify="notifyBirthday"${hasBirthday ? '' : ' disabled'}><span class="setting-switch-thumb" aria-hidden="true"></span></button>
						</div>
						<div class="setting-switch-row">
							<span id="notify-evening-label">Promemoria alle 9 del giorno della serata in programma</span>
							<button class="setting-switch" type="button" role="switch" aria-checked="${data.settings?.notifyEvening !== false}" aria-labelledby="notify-evening-label" data-notify="notifyEvening"><span class="setting-switch-thumb" aria-hidden="true"></span></button>
						</div>
						<p class="help-text" data-notify-status></p>
					</div>
				</div>
				<div class="profile-setting-row settings-feedback">
					<div>
						<p class="field-label">Segnalazioni</p>
						<span>Un problema, un’idea, un saluto: arriva a chi ha fatto l’app.</span>
						<div class="button-row"><button class="button secondary" type="button" data-open-feedback>Segnala un problema o proponi un’idea</button></div>
					</div>
				</div>
				<a class="profile-setting-row settings-link" href="#informazioni">
					<div><p class="field-label">Informazioni</p><span>Fonti dei dati, privacy e licenze</span></div>
					${icon('info')}
				</a>
				${renderVersionRow()}
			</section>
			<p class="app-credit">made with 🎬 by <a href="${escapeHtml(CREDIT_URL)}" target="_blank" rel="noopener noreferrer">${escapeHtml(CREDIT_HANDLE)}</a></p>
		`;
	}

	// Pagina "Informazioni" (PIANO.md, §14): fonti dei dati, privacy e licenze.
	function renderInfo() {
		return `
			${pageHeader('Informazioni', `myCimmena ${APP_VERSION}`)}
			<article class="info-page">
				<section>
					<h2 class="section-title">Da dove vengono i dati</h2>
					<ul>
						<li><strong>Ricerca e locandine:</strong> IMDb, attraverso un indirizzo pubblico non ufficiale. myCimmena non è collegata a IMDb.</li>
						<li><strong>Dettagli</strong> (trama, regista, cast, episodi…): <a href="https://www.omdbapi.com/" target="_blank" rel="noopener noreferrer">OMDb API</a>, con la tua chiave personale. I dati di OMDb sono sotto licenza <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener noreferrer">CC BY-NC 4.0</a>.</li>
						<li><strong>Aggiornamenti dell'app:</strong> GitHub.</li>
					</ul>
				</section>
				<section>
					<h2 class="section-title">Privacy</h2>
					<ul>
						<li>Tutti i tuoi dati (watchlist, diario, profilo, chiave OMDb) restano su questo telefono. Non ci sono account né server con i tuoi dati.</li>
							<li>L'app contatta solo IMDb, OMDb e GitHub, e il server delle segnalazioni quando ne invii una.</li>
							<li>Una segnalazione contiene il testo, il tipo, la tua email se la scrivi, le immagini che alleghi e, se lasci la casella attiva, versione dell'app, di Android e della WebView, modello del telefono e tipo di schede. Mai la chiave OMDb né watchlist, diario o voti. Il server la inoltra per mail e non ne conserva copia; per il limite di 5 al giorno tiene solo un'impronta anonima dell'indirizzo IP, per un giorno.</li>
							<li>Le notifiche (compleanno e serata) le programma il telefono: non passano da nessun server.</li>
						<li>Nessuna pubblicità, nessuna statistica d'uso.</li>
							<li>Disinstallando l'app o cancellandone i dati si perde tutto: per cambiare telefono o non rischiare, esporta un backup dalle Impostazioni. Il file del backup contiene anche la tua chiave OMDb.</li>
					</ul>
				</section>
				<section>
					<h2 class="section-title">Licenze</h2>
					<ul>
						<li><a href="https://capacitorjs.com/" target="_blank" rel="noopener noreferrer">Capacitor</a> (MIT), per far girare l'app su Android.</li>
						<li>Caratteri Montserrat e Spectral (SIL Open Font License); icone Material (Apache 2.0).</li>
						<li>Codice dell'app: <a href="${escapeHtml(REPO_URL)}" target="_blank" rel="noopener noreferrer">github.com/dariotronic/mycimmena</a>.</li>
					</ul>
				</section>
			</article>
		`;
	}

	return { minVotesLabel, renderInfo, renderWatching, renderDiary, renderDiaryRows, renderMyViewings, renderViewingForm, renderViewingSummary, renderMeetingForm, renderComingFilms, renderHome, renderMovieList, renderMovieRows, renderRandomizerCount, renderRandomizerOdds, renderSettings, randomizerFiltered };
}
