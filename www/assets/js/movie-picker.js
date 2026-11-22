// Ricerca di un titolo su IMDb con scelta di un risultato: il film del cuore, nell'onboarding e nelle Impostazioni.
import { escapeHtml, movieName } from './domain.js';
import { searchImdb } from './imdb.js';

export function bindMoviePicker(root, { onPick }) {
	const picker = root.querySelector('[data-movie-picker]');
	if (!picker) return;
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
					? `<ul class="movie-picker-list">${found.map((movie, index) => `<li><button class="movie-picker-option" type="button" data-pick="${index}">${escapeHtml(movieName(movie))}${movie.stars ? `<small>${escapeHtml(movie.stars)}</small>` : ''}</button></li>`).join('')}</ul>`
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
		input.value = movieName(movie);
		results.innerHTML = '';
		await onPick(movie);
	});
}
