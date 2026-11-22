// Modalità colore (giorno o notte): l'interruttore è nelle Impostazioni e la scelta resta salvata sul dispositivo.
// boot.js applica la modalità salvata prima del primo disegno.
import { showToast } from './toasts.js';

const COLOR_MODE_KEY = 'mycimmena-color-mode';
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

// Icone della barra di stato e di quella di navigazione di Android: seguono il tema dell'app, non quello del
// telefono (altrimenti con il telefono in modalità scura le icone restano chiare sul fondo chiaro di giorno).
// SystemBars è un plugin del core di Capacitor 8: 'DARK' = icone chiare su fondo scuro, 'LIGHT' = il contrario.
// Nel browser (npm run serve) il plugin non c'è e non succede niente.
function syncSystemBars(isNight) {
	const systemBars = globalThis.Capacitor?.Plugins?.SystemBars;
	if (!systemBars?.setStyle) return;
	systemBars.setStyle({ style: isNight ? 'DARK' : 'LIGHT' }).catch(error => {
		console.error('Impossibile aggiornare lo stile delle barre di sistema.', error);
	});
}

function setColorMode(mode, persist = false) {
	const isNight = mode === 'night';
	document.documentElement.dataset.theme = isNight ? 'night' : 'day';
	document.querySelectorAll('[data-theme-toggle]').forEach(toggle => {
		toggle.setAttribute('aria-checked', String(isNight));
		toggle.title = `Passa alla modalità ${isNight ? 'giorno' : 'notte'}`;
	});
	document.querySelectorAll('[data-theme-label]').forEach(label => {
		label.textContent = `Modalità ${isNight ? 'notte' : 'giorno'}`;
	});
	if (themeColorMeta) themeColorMeta.content = isNight ? '#141114' : '#f8f2ef';
	syncSystemBars(isNight);
	if (persist) {
		try {
			localStorage.setItem(COLOR_MODE_KEY, isNight ? 'night' : 'day');
		} catch (error) {
			console.error('Impossibile salvare la modalità colore scelta.', error);
		}
	}
}

export function initColorMode() {
	setColorMode(document.documentElement.dataset.theme);
	document.addEventListener('click', event => {
		const toggle = event.target.closest('[data-theme-toggle]');
		if (!toggle) return;
		const nextMode = toggle.getAttribute('aria-checked') === 'true' ? 'day' : 'night';
		setColorMode(nextMode, true);
		showToast('themeChanged', { mode: nextMode });
	});
}
