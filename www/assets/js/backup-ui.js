// Finestra del backup (PIANO.md, §8): esporta in Documenti o con Condividi, ripristina un file scegliendo tra
// unire e sostituire, e promemoria quando il backup è vecchio.
import { escapeHtml, formatDate, today } from './domain.js';
import { APP_VERSION } from './app-info.js';
import { backupFileName, buildBackup, describeBackup, parseBackup, saveBackupFile } from './backup.js';
import { hydrateIcons } from './icons.js';
import { showErrorToast, showToast } from './toasts.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const REMINDER_DAYS = 30;
const isNative = () => Boolean(globalThis.Capacitor?.isNativePlatform?.());

// Serve il promemoria? Ci sono dati cambiati dopo l'ultimo backup (o mai fatto), che ha più di 30 giorni
// (o, senza backup, l'onboarding è finito da più di 30 giorni), e non lo si è già ricordato oggi.
// Si spegne dalle Impostazioni (settings.backupReminder = false).
export function backupReminderDue(state, now = Date.now()) {
	if (!state?.onboarding?.done || state.settings?.backupReminder === false) return false;
	const meta = state.meta || {};
	const lastBackup = Date.parse(meta.lastBackupAt || '') || 0;
	const since = lastBackup || Date.parse(state.onboarding.finishedAt || '') || now;
	if (now - since < REMINDER_DAYS * DAY_MS) return false;
	if (now - (Date.parse(meta.backupReminderAt || '') || 0) < DAY_MS) return false;
	const stamps = [
		...(state.watchlist || []).map(entry => entry.updatedAt || entry.addedAt),
		...(state.viewings || []).map(viewing => viewing.updatedAt || viewing.createdAt)
	].map(value => Date.parse(value || '') || 0);
	return stamps.some(value => value > lastBackup);
}

// `restoreOnly`: dall'onboarding si vuole solo ripristinare, quindi niente sezione "Esporta".
export function renderBackupBody({ data, pending = null, error = '', restoreOnly = false }) {
	const last = data.meta?.lastBackupAt;
	const hasKey = Boolean(data.settings?.omdbKey);
	if (pending) {
		return `
			<section class="backup-section" aria-labelledby="backup-restore-title">
				<h3 id="backup-restore-title">Ripristina questo backup?</h3>
				<p>${escapeHtml(pending.summary.name ? `Backup di ${pending.summary.name}: ` : '')}${escapeHtml(describeBackup(pending.summary, formatDate))}</p>
				${pending.skipped ? `<p class="help-text">${pending.skipped} ${pending.skipped === 1 ? 'voce non valida verrà saltata' : 'voci non valide verranno saltate'}.</p>` : ''}
				<div class="backup-choices">
					<button class="button" type="button" data-backup-restore="merge">Unisci</button>
					<p class="help-text">Tiene i dati di questo telefono e aggiunge quelli del backup. Se una voce c'è in tutti e due, vince quella modificata più di recente.</p>
					<button class="button secondary" type="button" data-backup-restore="replace">Sostituisci tutto</button>
					<p class="help-text">Cancella i dati di questo telefono e mette quelli del backup.</p>
				</div>
				<button class="text-button" type="button" data-backup-cancel>Annulla</button>
			</section>
		`;
	}
	const restoreSection = `
		<section class="backup-section" aria-labelledby="backup-import-title">
			<h3 id="backup-import-title">Ripristina</h3>
			<p>Da un file <code>mycimmena-backup-….json</code>, per esempio dopo aver cambiato telefono.</p>
			<label class="button${restoreOnly ? '' : ' secondary'} file-button">Scegli il file di backup<input type="file" accept="application/json,.json,text/plain" data-backup-file></label>
		</section>
		${error ? `<p class="status-message error" role="alert">${escapeHtml(error)}</p>` : ''}
	`;
	if (restoreOnly) return restoreSection;
	return `
		<section class="backup-section" aria-labelledby="backup-export-title">
			<h3 id="backup-export-title">Esporta</h3>
			<p>Watchlist, diario, voti, serie, profilo e impostazioni in un file. Le locandine non ci sono: si riscaricano da sole.</p>
			<p class="help-text">${last ? `Ultimo backup: ${escapeHtml(formatDate(today(new Date(last))))}.` : 'Non hai ancora fatto un backup.'}</p>
			${hasKey ? '<p class="backup-warning">Il file contiene anche la tua chiave OMDb: tienilo per te.</p>' : ''}
			<div class="button-row">
				<button class="button" type="button" data-backup-export="documents">${isNative() ? 'Salva in Documenti' : 'Scarica il file'}</button>
				${isNative() ? '<button class="button secondary" type="button" data-backup-export="share">Condividi…</button>' : ''}
			</div>
		</section>
		${restoreSection}
	`;
}

export function createBackupUi({ store, getData, getState, refresh, askConfirmation, onRestored = () => {} }) {
	const dialog = document.getElementById('backup-dialog');
	const body = document.getElementById('backup-body');
	let pending = null;
	let error = '';
	let busy = false;
	let restoreOnly = false;
	// Dall'onboarding: riceve l'esito ({ ok, text } o { ok: false, message }) prima che l'app si ridisegni.
	let onResult = null;

	function draw() {
		body.innerHTML = renderBackupBody({ data: getData(), pending, error, restoreOnly });
		hydrateIcons(body);
	}

	function open({ onResult: report = null } = {}) {
		pending = null;
		error = '';
		onResult = report;
		restoreOnly = Boolean(report);
		draw();
		if (!dialog.open) dialog.showModal();
	}

	// Ripristino non riuscito durante l'onboarding: la finestra si chiude e l'avviso compare nella schermata.
	async function reportFailure(message) {
		const report = onResult;
		dialog.close();
		await report?.({ ok: false, message });
		await refresh();
	}

	async function exportBackup(how) {
		const now = new Date();
		const text = JSON.stringify(buildBackup(await store.exportData(), { appVersion: APP_VERSION, now }), null, '\t');
		const saved = await saveBackupFile({ text, fileName: backupFileName(now), how });
		if (saved.where === 'cancelled') return;
		await store.updateKv('meta', { lastBackupAt: now.toISOString() });
		await refresh();
		draw();
		showToast('backupSaved', saved);
	}

	async function chooseFile(file) {
		error = '';
		pending = null;
		try {
			if (file.size > 50 * 1024 * 1024) throw new Error('Il file è troppo grande per essere un backup di myCimmena.');
			pending = parseBackup(await file.text());
		} catch (problem) {
			error = problem.message;
			if (onResult) return void await reportFailure(problem.message);
		}
		draw();
	}

	async function restore(mode) {
		if (!pending) return;
		if (mode === 'replace' && !(await askConfirmation('I dati di questo telefono verranno sostituiti da quelli del backup. Continuare?'))) return;
		const text = describeBackup(pending.summary, formatDate);
		try {
			await store.restoreData(pending.data, { mode });
		} catch (problem) {
			if (onResult) return void await reportFailure(problem.message);
			throw problem;
		}
		pending = null;
		const report = onResult;
		await report?.({ ok: true, text });
		await refresh();
		dialog.close();
		showToast('backupRestored', { mode });
		// Dall'onboarding l'esito lo mostra la sua schermata; dalle Impostazioni un avviso in cima alla pagina (script.js).
		onRestored({ mode, text, fromOnboarding: Boolean(report) });
	}

	body.addEventListener('click', async event => {
		const exportButton = event.target.closest('[data-backup-export]');
		const restoreButton = event.target.closest('[data-backup-restore]');
		if (busy || (!exportButton && !restoreButton && !event.target.closest('[data-backup-cancel]'))) return;
		busy = true;
		try {
			if (exportButton) await exportBackup(exportButton.dataset.backupExport);
			else if (restoreButton) await restore(restoreButton.dataset.backupRestore);
			else {
				pending = null;
				draw();
			}
		} catch (problem) {
			showErrorToast(problem);
		} finally {
			busy = false;
		}
	});
	body.addEventListener('change', event => {
		const input = event.target.closest('[data-backup-file]');
		if (input?.files?.[0]) chooseFile(input.files[0]);
	});
	document.getElementById('backup-close').addEventListener('click', () => dialog.close());
	dialog.addEventListener('close', () => {
		pending = null;
		onResult = null;
		body.innerHTML = '';
	});

	// All'apertura dell'app: toast con "Esporta ora" se il backup è vecchio e ci sono dati nuovi.
	async function maybeRemind() {
		if (!backupReminderDue(getState())) return;
		await store.updateKv('meta', { backupReminderAt: new Date().toISOString() });
		showToast('backupReminder', {}, { label: 'Esporta ora', onClick: open, duration: 9000 });
	}

	return { open, chooseFile, maybeRemind };
}
