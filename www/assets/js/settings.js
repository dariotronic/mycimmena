// Impostazioni (profilo, modalità delle schede), dialog della chiave OMDb e banner "Versione completa in attesa"
// (PIANO.md, §5): il banner si nasconde per 24 ore con "Più tardi" e il tocco apre la chiave.
import { hydrateIcons } from './icons.js';
import { showErrorToast, showToast } from './toasts.js';
import { bindKeySetup, renderKeySetup } from './key-setup.js';
import { bindMoviePicker } from './movie-picker.js';
import { profileValues } from './profile.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// onProfileSaved: dopo il salvataggio del profilo (compleanno → permesso delle notifiche).
export function createSettings({ store, details, getData, refresh, onProfileSaved = () => {} }) {
	const keyDialog = document.getElementById('omdb-key-dialog');
	const keyBody = document.getElementById('omdb-key-body');
	const banner = document.getElementById('mode-banner');
	const indicator = document.getElementById('completion-indicator');
	let unbindKey = () => {};

	function openKeyDialog() {
		keyBody.innerHTML = renderKeySetup({ later: false });
		hydrateIcons(keyBody);
		unbindKey = bindKeySetup(keyBody, {
			useKey: details.useKey,
			onDone: async () => {
				keyDialog.close();
				showToast('keySaved');
				await refresh();
			}
		});
		keyDialog.showModal();
	}
	document.getElementById('omdb-key-close').addEventListener('click', () => keyDialog.close());
	keyDialog.addEventListener('close', () => {
		unbindKey();
		keyBody.innerHTML = '';
	});

	// Banner sottile sotto l'intestazione, solo in attesa della chiave e fuori dal periodo "Più tardi".
	function updateBanner() {
		const snoozed = Number(getData().settings?.bannerSnoozedUntil || 0) > Date.now();
		banner.hidden = getData().mode !== 'waiting' || snoozed || !getData().onboarding?.done;
	}
	banner.addEventListener('click', async event => {
		if (event.target.closest('[data-banner-later]')) {
			await store.updateKv('settings', { bannerSnoozedUntil: Date.now() + DAY_MS });
			await refresh();
			return;
		}
		if (event.target.closest('[data-banner-open]')) openKeyDialog();
	});

	// "Completamento schede: 12/40" mentre details.js scarica i dettagli in sottofondo.
	function showProgress(progress) {
		indicator.hidden = !progress;
		if (progress) indicator.textContent = `Completamento schede: ${progress.done}/${progress.total}`;
	}

	async function setMode(mode) {
		const settings = getData().settings || {};
		await store.updateKv('settings', mode === 'full'
			? { detailMode: 'full', omdbKeyStatus: settings.omdbKey && settings.omdbKeyStatus === 'valid' ? 'valid' : (settings.omdbKeyStatus || 'missing') }
			: { detailMode: 'light' });
		await refresh();
		showToast('modeChanged', { mode: getData().mode });
		if (getData().mode === 'waiting') openKeyDialog();
		else if (getData().mode === 'full') details.complete();
	}

	// Collega la pagina Impostazioni appena disegnata.
	function bind() {
		const form = document.getElementById('profile-form');
		if (!form) return;
		form.addEventListener('submit', async event => {
			event.preventDefault();
			const values = profileValues(Object.fromEntries([...new FormData(form).entries()].map(([name, value]) => [name, String(value).trim()])));
			try {
				await store.updateKv('profile', values);
				await refresh();
				showToast('profileSaved');
				onProfileSaved();
			} catch (error) {
				showErrorToast(error);
			}
		});
		bindMoviePicker(form, {
			onPick: async movie => {
				await store.saveMovie(movie);
				await store.updateKv('profile', { favoriteMovieId: movie.id });
				await refresh();
				showToast('profileSaved');
			}
		});
		document.querySelectorAll('[data-settings-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.settingsMode)));
		document.querySelector('[data-open-key]')?.addEventListener('click', openKeyDialog);
	}

	return { bind, updateBanner, showProgress, openKeyDialog };
}
