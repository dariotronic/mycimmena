// Il film del cuore, nell'onboarding e nelle Impostazioni: ricerca su IMDb (con le locandine) e, una volta scelto, una
// piccola card con locandina, titolo e anno e una croce per toglierlo. La scelta sta nel campo nascosto
// `favoriteMovieId` del modulo e si salva con il resto del profilo, quando lo decide l'utente.
import { escapeHtml, movieName } from './domain.js';
import { searchImdb } from './imdb.js';
import { icon } from './icons.js';

// Locandina piccola di IMDb (120 px di larghezza) per risultati e card.
const smallPoster = url => String(url || '').replace(/\._V1_.*\.jpg$/, '._V1_SX120.jpg');

function chosenCard(movie) {
	const src = movie.poster_local || smallPoster(movie.poster);
	return `
		${src ? `<img class="movie-picker-poster" src="${escapeHtml(src)}" alt="" loading="lazy">` : '<span class="movie-picker-poster empty" aria-hidden="true"></span>'}
		<span class="movie-picker-name"><strong>${escapeHtml(movie.title)}</strong>${movie.year ? `<small>${escapeHtml(movie.year)}</small>` : ''}</span>
		<button class="icon-button small" type="button" data-movie-picker-clear aria-label="Togli ${escapeHtml(movie.title)} come film del cuore" title="Togli">${icon('close')}</button>
	`;
}

// `favorite`: il film del cuore salvato (dati delle viste) o null; `label`: il nome del campo di ricerca.
export function renderMoviePicker(favorite, { label = 'Cerca il tuo film del cuore' } = {}) {
	return `
		<div class="movie-picker" data-movie-picker>
			<input type="hidden" name="favoriteMovieId" value="${escapeHtml(favorite?.id || '')}">
			<div class="movie-picker-chosen" data-movie-picker-chosen${favorite ? '' : ' hidden'}>${favorite ? chosenCard(favorite) : ''}</div>
			<div class="movie-picker-search" data-movie-picker-search${favorite ? ' hidden' : ''}>
				<input type="search" placeholder="Cerca un titolo" aria-label="${escapeHtml(label)}" data-movie-picker-input>
				<div class="movie-picker-results" data-movie-picker-results></div>
			</div>
		</div>
	`;
}

// `onPick(movie)` salva il titolo nel catalogo (serve per mostrarlo poi), senza toccare il profilo.
export function bindMoviePicker(root, { onPick = async () => {} } = {}) {
	const picker = root.querySelector('[data-movie-picker]');
	if (!picker) return;
	const hidden = picker.querySelector('input[name="favoriteMovieId"]');
	const chosen = picker.querySelector('[data-movie-picker-chosen]');
	const search = picker.querySelector('[data-movie-picker-search]');
	const input = picker.querySelector('[data-movie-picker-input]');
	const results = picker.querySelector('[data-movie-picker-results]');
	let timer = null;
	let sequence = 0;
	let found = [];

	input.addEventListener('input', () => {
		window.clearTimeout(timer);
		const query = input.value.trim();
		const current = ++sequence;
		if (!query) {
			results.innerHTML = '';
			return;
		}
		timer = window.setTimeout(async () => {
			results.innerHTML = '<p class="help-text" role="status">Ricerca in corso…</p>';
			try {
				const list = await searchImdb(query);
				if (current !== sequence) return;
				found = list.slice(0, 6);
				results.innerHTML = found.length
					? `<ul class="movie-picker-list">${found.map((movie, index) => `
						<li><button class="movie-picker-option" type="button" data-pick="${index}">
							${movie.poster ? `<img class="movie-picker-poster" src="${escapeHtml(smallPoster(movie.poster))}" alt="" loading="lazy">` : '<span class="movie-picker-poster empty" aria-hidden="true"></span>'}
							<span class="movie-picker-name"><strong>${escapeHtml(movieName(movie))}</strong>${movie.stars ? `<small>${escapeHtml(movie.stars)}</small>` : ''}</span>
						</button></li>`).join('')}</ul>`
					: '<p class="help-text">Nessun risultato.</p>';
			} catch (error) {
				if (current === sequence) results.innerHTML = `<p class="help-text error">${escapeHtml(error.message)}</p>`;
			}
		}, 500);
	});
	results.addEventListener('click', async event => {
		const option = event.target.closest('[data-pick]');
		if (!option) return;
		const movie = found[Number(option.dataset.pick)];
		await onPick(movie);
		hidden.value = movie.id;
		chosen.innerHTML = chosenCard(movie);
		chosen.hidden = false;
		search.hidden = true;
		input.value = '';
		results.innerHTML = '';
		// Chi ascolta i cambiamenti del modulo (per esempio "modifiche non salvate") lo sa.
		hidden.dispatchEvent(new Event('change', { bubbles: true }));
	});
	chosen.addEventListener('click', event => {
		if (!event.target.closest('[data-movie-picker-clear]')) return;
		hidden.value = '';
		chosen.innerHTML = '';
		chosen.hidden = true;
		search.hidden = false;
		input.focus();
		hidden.dispatchEvent(new Event('change', { bubbles: true }));
	});
}
