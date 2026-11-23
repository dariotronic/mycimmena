// Segnalazioni (PIANO.md, §11): un problema, un'idea o altro, con fino a 3 immagini ridotte e, se l'utente
// lo lascia, qualche informazione tecnica. Si mandano a feedback.php sul sito, che le inoltra per mail a Dario.
// Mai la chiave OMDb né i dati del diario.
import { APP_VERSION } from './app-info.js';

export const FEEDBACK_URL = 'https://www.clubdelcimmena.it/mycimmena/feedback.php';
export const FEEDBACK_TYPES = Object.freeze([
	{ value: 'bug', label: 'Un problema' },
	{ value: 'idea', label: 'Un’idea' },
	{ value: 'altro', label: 'Altro' }
]);
export const MAX_MESSAGE = 5000;
export const MAX_IMAGES = 3;
export const MAX_SIDE = 1600;
export const DAILY_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

// Dimensioni ridotte per stare entro maxSide sul lato lungo (mai ingrandite).
export function fitSize(width, height, maxSide = MAX_SIDE) {
	const scale = Math.min(1, maxSide / Math.max(width, height));
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Immagine ridotta a 1600 px sul lato lungo, in JPEG.
export async function shrinkImage(file) {
	let bitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		throw new Error(`«${file.name}» non è un’immagine che riesco a leggere.`);
	}
	const { width, height } = fitSize(bitmap.width, bitmap.height);
	const canvas = Object.assign(document.createElement('canvas'), { width, height });
	const context = canvas.getContext('2d');
	// Sfondo bianco: le trasparenze dei PNG in JPEG diventerebbero nere.
	context.fillStyle = '#ffffff';
	context.fillRect(0, 0, width, height);
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close?.();
	return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Non riesco a preparare l’immagine.'))), 'image/jpeg', 0.85));
}

// Informazioni tecniche, in righe leggibili: le stesse che l'utente vede con "Vedi cosa viene inviato".
export async function techInfo({ mode = 'light', device = globalThis.Capacitor?.Plugins?.Device, userAgent = globalThis.navigator?.userAgent || '' } = {}) {
	let info = null;
	try {
		if (globalThis.Capacitor?.isNativePlatform?.() && device?.getInfo) info = await device.getInfo();
	} catch { /* senza il plugin si usa lo user agent */ }
	const android = info?.osVersion || userAgent.match(/Android ([\d.]+)/)?.[1] || '';
	const webView = info?.webViewVersion || userAgent.match(/Chrome\/([\d.]+)/)?.[1] || '';
	const model = info ? [info.manufacturer, info.model].filter(Boolean).join(' ') : '';
	return [
		`myCimmena ${APP_VERSION}`,
		android ? `Android ${android}` : `Sistema: ${info?.operatingSystem || 'browser'}`,
		model ? `Telefono: ${model}` : '',
		webView ? `WebView: ${webView}` : '',
		`Schede: ${({ light: 'light', full: 'complete', waiting: 'complete, in attesa della chiave' })[mode] || mode}`
	].filter(Boolean).join('\n');
}

// Segnalazioni inviate nelle ultime 24 ore (meta.feedbackSentAt), per fermarsi prima del server.
export const sentToday = (meta, now = Date.now()) => (Array.isArray(meta?.feedbackSentAt) ? meta.feedbackSentAt : [])
	.filter(stamp => now - Date.parse(stamp) < DAY_MS);

export function validateFeedback({ type, message, email = '', images = [] }) {
	if (!FEEDBACK_TYPES.some(option => option.value === type)) return 'Scegli di cosa si tratta: un problema, un’idea o altro.';
	if (!String(message || '').trim()) return 'Scrivi qualcosa nella segnalazione.';
	if (String(message).length > MAX_MESSAGE) return `Il testo supera i ${MAX_MESSAGE} caratteri.`;
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'L’indirizzo email per la risposta non sembra valido.';
	if (images.length > MAX_IMAGES) return `Puoi allegare al massimo ${MAX_IMAGES} immagini.`;
	return '';
}

// Invio: le immagini sono già ridotte (Blob JPEG). Restituisce true o lancia un errore con un messaggio per l'utente.
export async function sendFeedback({ type, message, email = '', images = [], tech = '' }, { fetchImpl = (...args) => globalThis.fetch(...args), url = FEEDBACK_URL, isOnline = () => globalThis.navigator?.onLine !== false } = {}) {
	const problem = validateFeedback({ type, message, email, images });
	if (problem) throw new Error(problem);
	if (!isOnline()) throw new Error('Sei offline: riprova quando torna la connessione. Il testo resta qui.');
	const form = new FormData();
	form.append('type', type);
	form.append('message', String(message).trim());
	if (email) form.append('email', email);
	if (tech) form.append('tech', tech);
	form.append('website', '');
	images.forEach((image, index) => form.append('images[]', image, `immagine-${index + 1}.jpg`));
	let response;
	try {
		response = await fetchImpl(url, { method: 'POST', body: form });
	} catch {
		throw new Error(isOnline() ? 'Il server delle segnalazioni non risponde: riprova tra poco. Il testo resta qui.' : 'Sei offline: riprova quando torna la connessione. Il testo resta qui.');
	}
	let body = null;
	try {
		body = await response.json();
	} catch { /* risposta non JSON */ }
	if (!response.ok || !body?.ok) throw new Error(body?.error || `La segnalazione non è partita (HTTP ${response.status}). Riprova più tardi.`);
	return true;
}
