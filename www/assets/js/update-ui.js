// Aggiornamenti nell'interfaccia (PIANO.md, §10): controlli all'apertura, ogni ora e al ritorno in primo piano;
// avviso "È disponibile myCimmena 1.2.0" con Aggiorna e Più tardi; pallino su Impostazioni; pulsante manuale.
// v2 (Fase 5): nell'app Android "Aggiorna" scarica l'APK con il plugin nativo Updater (UpdaterPlugin.java), che
// controlla impronta, versione e firma, e apre l'installer. La prima volta Android chiede di consentire a
// myCimmena di installare app: l'avviso porta alla pagina giusta e riprende da solo al ritorno.
// v1, nel browser o se qualcosa va storto: l'APK si apre nel browser, che lo scarica.
import { APP_VERSION } from './app-info.js';
import { escapeHtml } from './domain.js';
import { openExternal } from './key-setup.js';
import { showToast } from './toasts.js';
import { createUpdateChecker, describeResult, HOUR_MS, isNewer, isSnoozed } from './updates.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function createUpdates({ store, getData, refresh, canShowDialog = () => true, fetchImpl }) {
	const dialog = document.getElementById('update-dialog');
	const check = () => getData().meta?.updateCheck || {};
	let lastMessage = '';
	const checker = createUpdateChecker({
		getCheck: check,
		saveCheck: async patch => {
			await store.updateKv('meta', { updateCheck: { ...check(), ...patch } });
			await refresh();
		},
		currentVersion: APP_VERSION,
		...(fetchImpl ? { fetchImpl } : {})
	});

	const available = () => (isNewer(check().latest, APP_VERSION) ? check().latest : null);

	// Pallino su Impostazioni (menu e barra in basso) finché c'è una versione nuova.
	function updateBadge() {
		const hasUpdate = Boolean(available());
		document.querySelectorAll('a[href="#impostazioni"]').forEach(link => link.classList.toggle('has-update', hasUpdate));
	}

	function showDialog(latest) {
		document.getElementById('update-dialog-title').textContent = `È disponibile myCimmena ${latest.version}`;
		const notes = document.getElementById('update-dialog-notes');
		notes.textContent = latest.notes || 'Nessuna nota per questa versione.';
		document.getElementById('update-dialog-current').textContent = `Hai la versione ${APP_VERSION}.`;
		setStatus('');
		installButton.textContent = 'Aggiorna';
		delete installButton.dataset.mode;
		if (!dialog.open) dialog.showModal();
	}

	const updater = () => (globalThis.Capacitor?.isNativePlatform?.() ? globalThis.Capacitor.Plugins.Updater : null);
	const installButton = document.getElementById('update-dialog-install');
	const status = document.getElementById('update-dialog-status');
	const bar = document.getElementById('update-dialog-progress');
	let busy = false;
	let waitingPermission = false;

	function setStatus(text, { progress = null, error = false } = {}) {
		status.textContent = text;
		status.classList.toggle('error', error);
		bar.hidden = progress === null;
		if (progress !== null) bar.value = progress;
	}

	async function inBrowser(latest) {
		dialog.close();
		await openExternal(latest.apkUrl || latest.url);
		showToast('updateDownloading');
	}

	async function install() {
		const latest = available();
		if (!latest || busy) return;
		const plugin = updater();
		if (!plugin?.download || !latest.apkUrl) return inBrowser(latest);
		if (installButton.dataset.mode === 'browser') return inBrowser(latest);
		busy = true;
		installButton.disabled = true;
		let listener = null;
		try {
			if (!(await plugin.canInstall()).allowed) {
				waitingPermission = true;
				setStatus('Android chiede di consentire a myCimmena di installare gli aggiornamenti: nella pagina che si apre attiva l’interruttore, poi torna qui.');
				installButton.textContent = 'Apri le impostazioni';
				installButton.dataset.mode = 'settings';
				await plugin.openInstallSettings();
				return;
			}
			setStatus('Download in corso…', { progress: 0 });
			listener = await plugin.addListener('progress', ({ done, total }) => {
				const share = total > 0 ? done / total : 0;
				setStatus(`Download in corso… ${Math.round(share * 100)}%`, { progress: share });
			});
			const { path } = await plugin.download({ url: latest.apkUrl, version: latest.version, sha256: latest.sha256 || '' });
			setStatus('Download completato: conferma l’installazione nella finestra di Android.', { progress: 1 });
			await plugin.install({ path });
		} catch (error) {
			setStatus(`${error?.message || 'Aggiornamento non riuscito.'} Puoi riprovare, o scaricarlo dal browser.`, { error: true });
			installButton.textContent = 'Scarica dal browser';
			installButton.dataset.mode = 'browser';
		} finally {
			listener?.remove?.();
			busy = false;
			installButton.disabled = false;
		}
	}

	// Di ritorno dalla pagina del permesso: se ora è dato, si riparte da soli.
	document.addEventListener('visibilitychange', async () => {
		if (document.visibilityState !== 'visible' || !waitingPermission || !dialog.open) return;
		const plugin = updater();
		if (plugin && (await plugin.canInstall()).allowed) {
			waitingPermission = false;
			installButton.textContent = 'Aggiorna';
			delete installButton.dataset.mode;
			install();
		}
	});

	async function later() {
		dialog.close();
		const latest = available();
		if (latest) await store.updateKv('meta', { updateCheck: { ...check(), dismissedVersion: latest.version, dismissedUntil: Date.now() + DAY_MS } });
		await refresh();
	}

	// Controllo automatico: silenzioso; l'avviso compare solo se la versione non è stata rimandata.
	async function autoCheck() {
		try {
			const result = await checker.check();
			updateBadge();
			if (result.kind === 'available' && !isSnoozed(check()) && canShowDialog()) showDialog(result.latest);
		} catch (error) {
			console.warn('Controllo degli aggiornamenti non riuscito.', error);
		}
	}

	// Pulsante "Controlla aggiornamenti": l'esito si mostra sempre.
	async function checkNow() {
		const result = await checker.check({ manual: true });
		// Con una versione nuova lo dice già la riga "Aggiornamento disponibile": niente doppione.
		lastMessage = result.kind === 'available' ? '' : describeResult(result, APP_VERSION);
		updateBadge();
		const status = document.querySelector('[data-update-status]');
		if (status) status.textContent = lastMessage;
		if (result.kind === 'available') showDialog(result.latest);
		else if (result.kind === 'current') showToast('updateNone', { message: lastMessage });
		else showToast('error', { message: lastMessage });
	}

	function start() {
		updateBadge();
		autoCheck();
		setInterval(autoCheck, HOUR_MS);
		// Al ritorno in primo piano, se l'ultimo controllo ha più di un'ora.
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible' && checker.isDue()) autoCheck();
		});
	}

	installButton.addEventListener('click', () => {
		if (installButton.dataset.mode === 'settings') updater()?.openInstallSettings();
		else install();
	});
	document.getElementById('update-dialog-later').addEventListener('click', later);
	dialog.addEventListener('cancel', event => {
		event.preventDefault();
		later();
	});

	// Riga "Versione" delle Impostazioni.
	function renderVersionRow() {
		const latest = available();
		return `
			<div class="profile-setting-row settings-version">
				<div>
					<p class="field-label">Versione</p>
					<span>myCimmena ${escapeHtml(APP_VERSION)}</span>
					${latest ? `<p class="update-available">Aggiornamento disponibile: ${escapeHtml(latest.version)}</p>` : ''}
					<p class="help-text" data-update-status aria-live="polite">${escapeHtml(lastMessage)}</p>
					<div class="button-row">
						${latest ? '<button class="button" type="button" data-update-open>Aggiorna</button>' : ''}
						<button class="button secondary" type="button" data-update-check>Controlla aggiornamenti</button>
					</div>
				</div>
			</div>
		`;
	}

	function bind() {
		updateBadge();
		document.querySelector('[data-update-check]')?.addEventListener('click', event => {
			event.currentTarget.disabled = true;
			const button = event.currentTarget;
			checkNow().finally(() => { button.disabled = false; });
		});
		document.querySelector('[data-update-open]')?.addEventListener('click', () => showDialog(available()));
	}

	return { start, checkNow, bind, renderVersionRow, updateBadge };
}
