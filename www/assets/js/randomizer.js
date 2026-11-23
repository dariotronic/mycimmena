// Randomizer: la slot machine che estrae un film dalla watchlist, da aggiungere poi all'appuntamento.
// Il film si sceglie subito (pesato con l'Hypometro, se attivo); i rulli di locandine sono solo scena.
import { movieName } from './domain.js';
import { DEFAULT_DRAW_FILTERS, drawMovie, drawPool } from './draw.js';
import { poster } from './movie-info.js';
import { showToast } from './toasts.js';
import { setIcon } from './icons.js';
import { playLever, playStop, playTick, playWin, setSoundEnabled, soundEnabled } from './slot-sounds.js';

// Solo la preferenza del peso resta sul dispositivo: film estratto, filtri ed esclusi ripartono a ogni caricamento.
const WEIGHTED_KEY = 'mycimmena-randomizer-weighted';
// Scatti dei rulli: l'ultimo mostra il film estratto. Il rullo rallenta dopo i primi 12.
const SPIN_STEPS = 23;
const LANDING_MS = 420;
// Altezza del riquadro: si richiude alla misura standard prima del giro e si allunga con calma alla fine.
const SHRINK_MS = 320;
const GROW_MS = 450;
// Durata delle animazioni di comparsa del vincitore (sfondo, titolo, info: la più lunga è lo zoom dello sfondo).
const REVEAL_MS = 1500;

const readWeighted = () => {
	try {
		return localStorage.getItem(WEIGHTED_KEY) !== 'off';
	} catch {
		return true;
	}
};
const saveWeighted = weighted => {
	try {
		if (weighted) localStorage.removeItem(WEIGHTED_KEY);
		else localStorage.setItem(WEIGHTED_KEY, 'off');
	} catch {
		// Storage non disponibile (navigazione privata): la scelta vale solo fino al ricaricamento.
	}
};

export function createRandomizer({ render, viewRenderer, selectableMovies, scheduleMovie }) {
	let selectedMovieId = null;
	let weighted = readWeighted();
	let filters = { ...DEFAULT_DRAW_FILTERS };
	let excluded = new Set();
	let oddsOpen = false;
	let rouletteTimer = null;

	const pool = () => drawPool(selectableMovies(), { filters, excluded });

	function setSelectedMovie(movieId) {
		selectedMovieId = movieId;
	}

	// Stato letto dalla vista (views.js): film in gioco, opzioni ed esclusi ancora in watchlist.
	function getState() {
		const selectable = new Set(selectableMovies().map(movie => movie.id));
		return {
			pool: pool(),
			weighted,
			filters: { ...filters },
			excludedCount: [...excluded].filter(id => selectable.has(id)).length,
			oddsOpen,
			spinning: Boolean(rouletteTimer)
		};
	}

	// Nodi delle locandine della sequenza, creati una volta sola e caricati subito: durante il giro
	// i rulli devono mostrare immagini già pronte.
	function posterNode(movie) {
		const template = document.createElement('template');
		template.innerHTML = `<div class="reel-item">${poster(movie, 'roulette-poster')}</div>`;
		const node = template.content.firstElementChild;
		const image = node.querySelector('img');
		if (image) image.loading = 'eager';
		return node;
	}

	function setControlsDisabled(disabled) {
		document.querySelectorAll('[data-randomizer-control]').forEach(control => { control.disabled = disabled; });
	}

	function chooseFilm() {
		const choices = pool();
		if (!choices.length || rouletteTimer) return;
		const roulette = document.getElementById('roulette');
		const reel = document.getElementById('roulette-reel');
		setControlsDisabled(true);
		// Durante il giro il titolo resta nascosto (style.css) e compare solo con il vincitore, insieme allo sfondo.
		// Se il titolo precedente stava su più righe, il riquadro torna prima alla misura standard (una riga).
		const shrinking = shrinkTitleRow(roulette);
		// Via le animazioni di comparsa del giro precedente: altrimenti tengono titolo e info visibili e bloccano
		// la dissolvenza in uscita (style.css).
		roulette.classList.remove('reveal');
		roulette.classList.add('spinning');
		playLever();
		const winner = drawMovie(choices, weighted);
		// Le locandine che scorrono prima del vincitore sono casuali (senza peso): è solo scena.
		const randomChoice = () => choices[Math.floor(Math.random() * choices.length)];
		const sequence = Array.from({ length: SPIN_STEPS }, (_, index) => (index === SPIN_STEPS - 1 ? winner : randomChoice()));
		const upcoming = randomChoice();
		const nodes = reel ? sequence.map(posterNode) : [];
		const upcomingNode = reel ? posterNode(upcoming) : null;
		let step = 0;

		// Rullo verticale: sopra il prossimo, al centro il film dello scatto, sotto i due precedenti.
		// Scorre di una posizione per scatto, così il film che era al centro scende al posto di sotto.
		function showStep(duration, landing) {
			if (!reel) return;
			const at = index => (index < 0 ? null : (index < nodes.length ? nodes[index] : upcomingNode));
			const items = [at(step + 1), at(step), at(step - 1), at(step - 2)]
				.map(node => node?.cloneNode(true) || Object.assign(document.createElement('div'), { className: 'reel-item' }));
			reel.replaceChildren(...items);
			reel.classList.remove('rolling', 'landing');
			void reel.offsetWidth; // riavvia l'animazione dello scatto
			reel.style.setProperty('--roll-duration', `${duration}ms`);
			reel.classList.add('rolling');
			reel.classList.toggle('landing', landing);
		}

		function finish() {
			const heightBefore = roulette.offsetHeight;
			// Posizione dei pulsanti prima del render, per animare la riga quando compaiono escludi e aggiungi.
			const hadActions = Boolean(document.getElementById('exclude-picked'));
			const soundLeft = document.getElementById('roulette-sound')?.getBoundingClientRect().left;
			setSelectedMovie(winner.id);
			roulette.classList.remove('spinning');
			rouletteTimer = null;
			render();
			// Sfondo con la locandina e titolo del vincitore: l'animazione d'ingresso solo qui, non agli altri render.
			const revealed = document.getElementById('roulette');
			revealed?.classList.add('reveal');
			// Finite le animazioni di comparsa si toglie la classe: con le animazioni ancora attaccate Chrome non fa
			// partire le dissolvenze in uscita del giro successivo.
			if (revealed) window.setTimeout(() => revealed.classList.remove('reveal'), REVEAL_MS);
			if (revealed) growFrom(revealed, heightBefore);
			if (!hadActions) revealActions(soundLeft);
			announce(`Estratto: ${movieName(winner)}`);
		}

		const tick = () => {
			const last = step === SPIN_STEPS - 1;
			const delay = 55 + Math.max(0, step + 1 - 12) * 18;
			showStep(last ? LANDING_MS : delay, last);
			if (window.matchMedia('(pointer: coarse)').matches && typeof navigator.vibrate === 'function') {
				navigator.vibrate(30);
			}
			if (last) {
				playStop();
				playWin();
				// La vista finale arriva quando il rullo si è fermato.
				rouletteTimer = window.setTimeout(finish, LANDING_MS);
				return;
			}
			playTick();
			step += 1;
			rouletteTimer = window.setTimeout(tick, delay);
		};
		// I rulli partono dopo la leva (e dopo che il riquadro si è richiuso, se serviva).
		rouletteTimer = window.setTimeout(tick, shrinking ? Math.max(220, SHRINK_MS) : 220);
	}

	const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Annuncio solo per gli screen reader del film estratto (niente toast a schermo). La regione aria-live
	// sta fuori dalla vista, così resta la stessa anche quando la pagina si ridisegna.
	function announce(message) {
		if (!document.body) return;
		let region = document.getElementById('randomizer-announcer');
		if (!region) {
			region = Object.assign(document.createElement('p'), { id: 'randomizer-announcer', className: 'visually-hidden' });
			region.setAttribute('aria-live', 'polite');
			document.body.append(region);
		}
		region.textContent = '';
		window.setTimeout(() => { region.textContent = message; }, 50);
	}

	// Richiude la riga del titolo all'altezza di una riga. Restituisce true se c'è un'animazione da aspettare.
	function shrinkTitleRow(roulette) {
		const row = roulette.querySelector?.('.roulette-title');
		if (!row) return false;
		const from = row.offsetHeight;
		const to = Math.round(parseFloat(getComputedStyle(row).lineHeight)) || from;
		row.style.overflow = 'hidden';
		row.style.height = `${from}px`;
		if (from <= to + 1 || reducedMotion()) {
			row.style.height = `${Math.min(from, to)}px`;
			return false;
		}
		// La transizione dell'altezza è in style.css (.roulette-title, durata SHRINK_MS), insieme alla dissolvenza.
		void row.offsetHeight;
		row.style.height = `${to}px`;
		return true;
	}

	// Primo film estratto: escludi e aggiungi escono da dietro il dado verso il loro posto, e il pulsante dei suoni
	// scivola di lato da dove stava. L'info compare solo in dissolvenza (style.css).
	function revealActions(soundLeft) {
		if (reducedMotion()) return;
		const timing = { duration: 480, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' };
		const sound = document.getElementById('roulette-sound');
		if (sound?.animate && Number.isFinite(soundLeft)) {
			const shift = soundLeft - sound.getBoundingClientRect().left;
			if (Math.abs(shift) > 1) sound.animate([{ transform: `translateX(${shift}px)` }, { transform: 'none' }], timing);
		}
		const spin = document.getElementById('choose-film');
		if (!spin) return;
		const center = rect => rect.left + rect.width / 2;
		const spinCenter = center(spin.getBoundingClientRect());
		['exclude-picked', 'add-picked'].forEach(id => {
			const button = document.getElementById(id);
			if (!button?.animate) return;
			const shift = spinCenter - center(button.getBoundingClientRect());
			button.animate([{ transform: `translateX(${shift}px) scale(.4)`, opacity: 0 }, { transform: 'none', opacity: 1 }], timing);
		});
	}

	// Dopo il render il riquadro ha la sua altezza naturale: la si raggiunge con una transizione da quella di prima.
	function growFrom(element, from) {
		if (!from || reducedMotion()) return;
		const to = element.offsetHeight;
		if (Math.abs(to - from) < 2) return;
		element.style.height = `${from}px`;
		void element.offsetHeight;
		element.style.transition = `height ${GROW_MS}ms ease, box-shadow .2s ease`;
		element.style.height = `${to}px`;
		const done = event => {
			if (event.target !== element || event.propertyName !== 'height') return;
			element.style.height = '';
			element.style.transition = '';
			element.removeEventListener('transitionend', done);
		};
		element.addEventListener('transitionend', done);
	}

	async function addPickedFilm() {
		if (!selectedMovieId) return;
		await scheduleMovie(selectedMovieId);
	}

	// Scarta il film appena uscito (fino al ricaricamento della pagina; resta in watchlist) e gira di nuovo.
	function excludeAndSpin() {
		if (!selectedMovieId || rouletteTimer) return;
		const movie = selectableMovies().find(item => item.id === selectedMovieId);
		excluded.add(selectedMovieId);
		showToast('movieExcluded', { title: movie ? movieName(movie) : '' });
		setSelectedMovie(null);
		// Niente render prima del giro: il riquadro si richiude con l'animazione di chooseFilm, non di scatto.
		updatePool();
		chooseFilm();
	}

	function restoreExcluded() {
		excluded = new Set();
		updatePool();
	}

	// Senza argomenti azzera la scelta; con un id solo se è quel film (per esempio appena tolto dalla watchlist).
	function clearSelectedMovie(movieId) {
		if (movieId === undefined || selectedMovieId === movieId) setSelectedMovie(null);
	}

	function updateSoundButton(button, enabled) {
		const label = enabled ? 'Spegni i suoni' : 'Accendi i suoni';
		button.setAttribute('aria-pressed', String(!enabled));
		button.setAttribute('aria-label', label);
		button.title = label;
		setIcon(button.querySelector('.material-icons-outlined'), enabled ? 'volume_up' : 'volume_off');
	}

	// Cambiando opzioni si aggiornano solo riepilogo e probabilità, senza ridisegnare la pagina:
	// lo slider resta trascinabile e il focus resta dov'è.
	function updatePool() {
		const count = document.getElementById('randomizer-count');
		if (count) count.innerHTML = viewRenderer.renderRandomizerCount();
		const odds = document.getElementById('randomizer-odds');
		if (odds) odds.innerHTML = viewRenderer.renderRandomizerOdds();
		document.getElementById('randomizer-filter-open')?.setAttribute('aria-pressed', String(viewRenderer.randomizerFiltered({ weighted, filters })));
		const spin = document.getElementById('choose-film');
		if (spin && !rouletteTimer) spin.disabled = !pool().length;
	}

	// Mobile: le opzioni si aprono in un modale, come i filtri della watchlist. Il riquadro delle opzioni
	// si sposta nel modale all'apertura e torna al suo posto alla chiusura (su desktop è sempre visibile).
	function bindFilterDialog() {
		const dialog = document.getElementById('randomizer-filter-dialog');
		const options = document.getElementById('randomizer-options');
		const slot = document.getElementById('randomizer-options-slot');
		const body = document.getElementById('randomizer-filter-body');
		if (!dialog || !options || !slot || !body) return;
		let scrollPosition = null;
		document.getElementById('randomizer-filter-open')?.addEventListener('click', () => {
			scrollPosition = { left: window.scrollX, top: window.scrollY };
			body.append(options);
			document.body.classList.add('modal-open');
			dialog.showModal();
		});
		document.getElementById('randomizer-filter-close')?.addEventListener('click', () => dialog.close());
		dialog.addEventListener('click', event => {
			if (event.target === dialog) dialog.close();
		});
		dialog.addEventListener('close', () => {
			slot.append(options);
			document.body.classList.remove('modal-open');
			if (scrollPosition) window.scrollTo({ ...scrollPosition, behavior: 'instant' });
			scrollPosition = null;
		});
	}

	function bind() {
		document.getElementById('choose-film')?.addEventListener('click', chooseFilm);
		document.getElementById('add-picked')?.addEventListener('click', addPickedFilm);
		document.getElementById('exclude-picked')?.addEventListener('click', excludeAndSpin);
		// Due pulsanti dei suoni: nella riga della slot (desktop) e nella barra in alto (mobile). Restano allineati.
		const soundButtons = document.querySelectorAll('#roulette-sound, #roulette-sound-bar');
		soundButtons.forEach(button => button.addEventListener('click', () => {
			const enabled = !soundEnabled();
			setSoundEnabled(enabled);
			soundButtons.forEach(item => updateSoundButton(item, enabled));
		}));
		bindFilterDialog();
		const options = document.getElementById('randomizer-options');
		if (!options) return;
		options.addEventListener('click', event => {
			const chip = event.target.closest('[data-randomizer-filter]');
			if (!chip || chip.disabled) return;
			const key = chip.dataset.randomizerFilter;
			filters[key] = chip.dataset.value;
			options.querySelectorAll(`[data-randomizer-filter="${key}"]`).forEach(item => {
				const active = item === chip;
				item.classList.toggle('active', active);
				item.setAttribute('aria-pressed', String(active));
			});
			updatePool();
		});
		document.getElementById('randomizer-min-votes')?.addEventListener('input', event => {
			filters.minVotes = Number(event.currentTarget.value);
			const output = document.getElementById('randomizer-min-votes-value');
			if (output) output.value = viewRenderer.minVotesLabel(filters.minVotes);
			event.currentTarget.setAttribute('aria-valuetext', viewRenderer.minVotesLabel(filters.minVotes));
			updatePool();
		});
		document.getElementById('randomizer-weighted')?.addEventListener('change', event => {
			weighted = event.currentTarget.checked;
			saveWeighted(weighted);
			updatePool();
		});
		document.getElementById('randomizer-odds')?.addEventListener('toggle', event => {
			if (event.target.matches('.randomizer-odds')) oddsOpen = event.target.open;
		}, true);
		document.getElementById('randomizer-count')?.addEventListener('click', event => {
			if (event.target.closest('#restore-excluded')) restoreExcluded();
		});
	}

	// isSpinning: i rulli stanno girando (script.js non ridisegna la pagina in sottofondo, che rimpiazzerebbe la slot).
	return { getSelectedMovieId: () => selectedMovieId, getState, clearSelectedMovie, bind, isSpinning: () => Boolean(rouletteTimer) };
}
