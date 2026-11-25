// Toast: unico canale di feedback dell'app, sia per le conferme sia per gli errori.
// Per spegnerli tutti metti TOASTS_ENABLED = false; per spegnerne uno metti `enabled: false` alla sua voce.
// `message` può essere un testo o una funzione che riceve i dettagli dell'azione.
// Facoltativi: `variant: 'error'` per lo stile di errore e `duration` (ms) per una durata diversa da quella standard.
// showToast accetta anche un'azione ({ label, onClick, duration }), per esempio "Annulla" dopo una rimozione.

export const TOASTS_ENABLED = true;
export const TOAST_DURATION_MS = 2200;

export const TOASTS = {
	// Errori di qualsiasi azione. Attenzione: spegnendolo, chi incontra un errore non riceve alcun avviso.
	error: { enabled: true, variant: 'error', duration: 5000, message: ({ message }) => message || 'Si è verificato un errore.' },

	// Home
	// Mentre si prepara l'immagine (qualche secondo): resta finché non si apre il menu Condividi.
	sharePreparing: { enabled: true, duration: 15000, message: 'Preparo l’immagine…' },
	shareDone: { enabled: true, message: 'Immagine condivisa' },
	shareDownloaded: { enabled: true, message: 'Immagine scaricata' },
	calendarDownloaded: { enabled: true, message: 'Evento scaricato: aprilo per aggiungerlo al calendario' },

	// Serata in programma
	meetingSaved: { enabled: true, message: ({ past }) => past ? 'Serata salvata: la data è passata, in Home trovi «Com’è andata?»' : 'Serata salvata' },
	meetingCompleted: { enabled: true, message: ({ count }) => count === 1 ? 'Serata nel diario: ora puoi dare il voto' : 'Serata nel diario: ora puoi dare i voti' },
	meetingCleared: { enabled: true, message: 'Serata rimossa' },
	movieScheduled: { enabled: true, message: 'Aggiunto alla serata' },

	// Randomizer
	// Il film estratto non ha un toast (lo annuncia agli screen reader randomizer.js); lo scarto sì.
	movieExcluded: { enabled: true, message: ({ title }) => (title ? `Scartato: ${title}` : 'Film scartato') },

	// Watchlist
	movieQueued: { enabled: true, message: 'Messo in coda' },
	movieUnqueued: { enabled: true, message: 'Tolto dalla coda' },
	queueCleared: { enabled: true, message: 'Coda svuotata' },
	moviesAdded: { enabled: true, message: ({ count }) => count === 1 ? 'Film aggiunto alla watchlist' : `${count} film aggiunti alla watchlist` },
	movieRemoved: { enabled: true, message: 'Rimosso dalla watchlist' },

	// Diario
	viewingSaved: { enabled: true, message: ({ removed }) => removed ? 'Segnato come visto e tolto dalla watchlist' : 'Segnato come visto' },
	viewingUpdated: { enabled: true, message: 'Visione aggiornata' },
	viewingDeleted: { enabled: true, message: 'Visione eliminata' },

	// Serie TV
	episodesMarked: { enabled: true, message: ({ label }) => (label ? `Visto: ${label}` : 'Episodi segnati') },
	seriesStructureSaved: { enabled: true, message: 'Stagioni salvate' },
	seriesNoteSaved: { enabled: true, message: 'Nota salvata' },
	seriesRated: { enabled: true, message: 'Voto salvato' },
	seriesVoteRemoved: { enabled: true, message: 'Voto tolto' },
	episodesUnmarked: { enabled: true, message: ({ label }) => `Non più visto: ${label}` },

	// Backup e importazione
	backupSaved: { enabled: true, duration: 4000, message: ({ where, path }) => ({ documents: 'Backup salvato in Documenti/myCimmena', shared: 'Backup pronto da condividere', download: 'Backup scaricato' })[where] || 'Backup salvato' },
	backupRestored: { enabled: true, message: ({ mode }) => mode === 'replace' ? 'Backup ripristinato' : 'Backup unito ai tuoi dati' },
	backupReminderChanged: { enabled: true, message: ({ on }) => on ? 'Promemoria del backup attivo' : 'Promemoria del backup spento' },
	backupReminder: { enabled: true, message: 'È da un po’ che non fai un backup: i dati stanno solo su questo telefono.' },
	importMatched: { enabled: true, message: 'Abbinamento finito: apri Impostazioni → Importa watchlist per il riepilogo' },
	diaryImported: { enabled: true, duration: 4000, message: ({ added, skipped }) => `${added === 1 ? '1 visione aggiunta' : `${added} visioni aggiunte`} al diario${skipped ? ` (${skipped} già c’erano)` : ''}` },
	watchlistImported: { enabled: true, message: ({ count }) => count === 1 ? '1 titolo importato nella watchlist' : `${count} titoli importati nella watchlist` },

	// Segnalazioni e notifiche
	feedbackSent: { enabled: true, duration: 4000, message: 'Segnalazione inviata, grazie!' },
	notificationsChanged: { enabled: true, message: ({ on }) => on ? 'Notifica attiva' : 'Notifica spenta' },

	// Aggiornamenti
	updateNone: { enabled: true, message: ({ message }) => message || 'Hai già l’ultima versione' },
	updateDownloading: { enabled: true, duration: 5000, message: 'Download avviato: al termine apri il file per installare l’aggiornamento' },

	// Impostazioni
	profileSaved: { enabled: true, message: 'Profilo salvato' },
	keySaved: { enabled: true, message: 'Chiave OMDb attiva: le schede si completano da sole' },
	modeChanged: { enabled: true, message: ({ mode }) => ({ light: 'Schede light', full: 'Schede complete', waiting: 'Schede complete in attesa della chiave' })[mode] || 'Modalità cambiata' },
	themeChanged: { enabled: true, message: ({ mode }) => mode === 'night' ? 'Modalità notte' : 'Modalità giorno' },
	posterThemeChanged: { enabled: true, message: ({ on }) => (on ? 'Colori dal film del cuore' : 'Colori di myCimmena') }
};

let toastElement = null;
let hideTimer = null;

// Un solo elemento riusato: un nuovo toast sostituisce quello visibile.
// Come popover sta nel top layer, quindi resta visibile anche sopra i dialog aperti.
function getToastElement() {
	if (toastElement?.isConnected) return toastElement;
	toastElement = document.createElement('div');
	toastElement.className = 'toast';
	toastElement.setAttribute('role', 'status');
	toastElement.setAttribute('aria-live', 'polite');
	if ('popover' in toastElement) toastElement.popover = 'manual';
	document.body.append(toastElement);
	return toastElement;
}

const isPopoverOpen = element => Boolean(element.popover) && element.matches(':popover-open');

export function toastMessage(key, details = {}) {
	const config = TOASTS[key];
	if (!TOASTS_ENABLED || !config?.enabled) return '';
	return typeof config.message === 'function' ? config.message(details) : config.message;
}

export function showToast(key, details = {}, action = null) {
	const message = toastMessage(key, details);
	if (!message || typeof document === 'undefined') return false;
	const config = TOASTS[key];
	const isError = config.variant === 'error';
	const element = getToastElement();
	window.clearTimeout(hideTimer);
	element.classList.remove('visible');
	element.classList.toggle('error', isError);
	element.classList.toggle('has-action', Boolean(action));
	// Gli errori interrompono subito la lettura dello screen reader, le conferme no.
	element.setAttribute('role', isError ? 'alert' : 'status');
	element.setAttribute('aria-live', isError ? 'assertive' : 'polite');
	element.textContent = message;
	if (action) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'toast-action';
		button.textContent = action.label;
		button.addEventListener('click', () => {
			hideToast();
			action.onClick();
		});
		element.append(' ', button);
	}
	// Riaperto ogni volta per finire sopra un eventuale dialog aperto nel frattempo.
	if (isPopoverOpen(element)) element.hidePopover();
	if (element.popover) element.showPopover();
	void element.offsetWidth;
	element.classList.add('visible');
	hideTimer = window.setTimeout(() => {
		element.classList.remove('visible');
		hideTimer = window.setTimeout(() => {
			if (isPopoverOpen(element)) element.hidePopover();
		}, 250);
	}, action?.duration || config.duration || TOAST_DURATION_MS);
	return true;
}

export function hideToast() {
	if (!toastElement) return;
	const element = toastElement;
	window.clearTimeout(hideTimer);
	element.classList.remove('visible');
	hideTimer = window.setTimeout(() => {
		if (isPopoverOpen(element)) element.hidePopover();
	}, 250);
}

// Scorciatoia per gli errori: mostra il messaggio dell'eccezione o il testo passato.
export function showErrorToast(errorOrMessage) {
	const message = typeof errorOrMessage === 'string' ? errorOrMessage : errorOrMessage?.message;
	return showToast('error', { message });
}
