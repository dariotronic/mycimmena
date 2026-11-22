// Tasto Indietro di Android (plugin @capacitor/app). Senza questo gestore Capacitor chiude l'app al primo tocco.
// In ordine: chiude la finestra aperta (rispettando chi la vuole tenere aperta, come l'editor di una recensione
// con il testo non salvato), poi il menu, poi torna alla vista precedente; dalla Home mette l'app in sottofondo
// invece di chiuderla, come fanno le app di sistema.
import { route } from './navigation.js';

// `onBack` (facoltativo) gestisce il tasto per primo, per esempio nell'onboarding: se restituisce true basta così.
export function initBackButton({ closeMenu, onBack = () => false }) {
	const app = globalThis.Capacitor?.Plugins?.App;
	if (!app?.addListener) return;
	app.addListener('backButton', ({ canGoBack }) => {
		if (onBack()) return;
		const dialog = [...document.querySelectorAll('dialog[open]')].pop();
		if (dialog) {
			// Lo stesso evento del tasto Esc: i moduli che bloccano la chiusura lo annullano.
			const cancel = new Event('cancel', { cancelable: true });
			if (dialog.dispatchEvent(cancel)) dialog.close();
			return;
		}
		const menu = document.getElementById('site-menu');
		if (menu && !menu.hidden) {
			closeMenu();
			return;
		}
		if (route() !== 'home') {
			if (canGoBack) history.back();
			else location.hash = '#home';
			return;
		}
		app.minimizeApp();
	});
}
