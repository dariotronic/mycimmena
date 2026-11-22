// Attivazione della chiave OMDb (PIANO.md, §4, passaggio 6): spiegazione, pagina di registrazione nel browser interno,
// chiave copiata riconosciuta negli appunti al ritorno nell'app, verifica immediata. Lo stesso blocco sta
// nell'onboarding e nel dialog che si apre dal banner "in attesa" o dalle Impostazioni.
import { escapeHtml } from './domain.js';
import { looksLikeOmdbKey, OMDB_SIGNUP_URL } from './omdb.js';

// Pagina esterna: con Capacitor nel browser interno (Custom Tab), nel browser del PC in una scheda nuova.
export async function openExternal(url) {
	const browser = globalThis.Capacitor?.Plugins?.Browser;
	if (browser?.open) await browser.open({ url });
	else window.open(url, '_blank', 'noopener');
}

async function readClipboard() {
	try {
		const clipboard = globalThis.Capacitor?.Plugins?.Clipboard;
		if (clipboard?.read) return String((await clipboard.read())?.value || '').trim();
	} catch {
		// Appunti vuoti o non leggibili: niente proposta.
	}
	return '';
}

export function renderKeySetup({ later = true } = {}) {
	return `
		<div class="key-setup" data-key-setup>
			<ol class="key-steps">
				<li><p><strong>Registrati su OMDb</strong>, il servizio che fornisce trama, regista, cast e gli episodi delle serie. È gratuito: scegli <em>FREE</em>, scrivi la tua mail e premi <em>Submit</em>.</p>
					<button class="button secondary" type="button" data-key-open>Apri la pagina di registrazione</button>
				</li>
				<li><p><strong>Controlla la mail:</strong> arrivano la chiave e un link di attivazione da cliccare. Con Hotmail e Outlook può volerci fino a un'ora; guarda anche nella posta indesiderata.</p></li>
				<li><p><strong>Incolla la chiave qui.</strong> Se l'hai copiata, tornando nell'app te la proponiamo noi.</p>
					<p class="key-suggestion" data-key-suggestion hidden></p>
					<form class="key-form" data-key-form>
						<label class="visually-hidden" for="omdb-key-input">Chiave OMDb</label>
						<input id="omdb-key-input" name="key" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40" placeholder="Es. a1b2c3d4" required>
						<button class="button" type="submit">Verifica</button>
					</form>
					<p class="key-status" data-key-status role="status" aria-live="polite"></p>
				</li>
			</ol>
			${later ? '<button class="text-button" type="button" data-key-later>La inserisco più tardi</button>' : ''}
		</div>
	`;
}

// Collega il blocco: `useKey` prova e salva la chiave (details.useKey), `onDone` dopo una chiave valida,
// `onLater` per "La inserisco più tardi".
export function bindKeySetup(root, { useKey, onDone = () => {}, onLater = () => {} }) {
	const container = root.querySelector('[data-key-setup]');
	if (!container) return () => {};
	const form = container.querySelector('[data-key-form]');
	const input = form.elements.key;
	const status = container.querySelector('[data-key-status]');
	const suggestion = container.querySelector('[data-key-suggestion]');

	async function verify(key) {
		const submit = form.querySelector('button[type="submit"]');
		submit.disabled = true;
		status.className = 'key-status';
		status.textContent = 'Verifica in corso…';
		try {
			await useKey(key);
			status.classList.add('ok');
			status.textContent = 'Funziona ✓';
			window.setTimeout(onDone, 700);
		} catch (error) {
			status.classList.add('error');
			status.textContent = error.kind === 'network'
				? `${error.message} Riprova quando c'è la connessione.`
				: error.message;
		} finally {
			submit.disabled = false;
		}
	}

	async function checkClipboard() {
		if (!container.isConnected) return;
		const text = await readClipboard();
		if (!looksLikeOmdbKey(text) || text === input.value.trim()) return;
		suggestion.hidden = false;
		suggestion.innerHTML = `Negli appunti c'è <code>${escapeHtml(text)}</code>. <button class="text-button" type="button" data-key-use="${escapeHtml(text)}">Usare questa?</button>`;
	}

	container.addEventListener('click', async event => {
		if (event.target.closest('[data-key-open]')) await openExternal(OMDB_SIGNUP_URL);
		else if (event.target.closest('[data-key-later]')) onLater();
		else {
			const use = event.target.closest('[data-key-use]');
			if (use) {
				input.value = use.dataset.keyUse;
				suggestion.hidden = true;
				verify(input.value);
			}
		}
	});
	form.addEventListener('submit', event => {
		event.preventDefault();
		verify(input.value);
	});
	// Al ritorno nell'app (dopo la mail) si guarda negli appunti.
	const onVisible = () => { if (!document.hidden) checkClipboard(); };
	document.addEventListener('visibilitychange', onVisible);
	return () => document.removeEventListener('visibilitychange', onVisible);
}
