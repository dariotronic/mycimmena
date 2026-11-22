// Aggiornamenti nell'interfaccia (PIANO.md, §10): controlli all'apertura, ogni ora e al ritorno in primo piano;
// avviso "È disponibile myCimmena 1.2.0" con Aggiorna e Più tardi; pallino su Impostazioni; pulsante manuale.
// v1: "Aggiorna" apre l'APK della Release nel browser, che lo scarica; l'installazione la conferma l'utente.
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
		if (!dialog.open) dialog.showModal();
	}

	async function install() {
		const latest = available();
		if (!latest) return;
		dialog.close();
		await openExternal(latest.apkUrl || latest.url);
		showToast('updateDownloading');
	}

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

	document.getElementById('update-dialog-install').addEventListener('click', install);
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
