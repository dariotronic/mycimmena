// Filtro dell'HTML delle note del diario: sul sito lo faceva il server (api/lib/review-content.php), qui lo fa l'app
// prima di salvare e prima di mostrare, così anche un backup modificato a mano non può inserire script nella pagina.
// Restano solo i tag dell'editor: paragrafi, a capo, grassetto, corsivo, barrato, citazione, elenchi e link HTTP/HTTPS.
import { escapeHtml } from './domain.js';

const ALLOWED = new Set(['P', 'BR', 'DIV', 'B', 'STRONG', 'I', 'EM', 'S', 'STRIKE', 'DEL', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A']);
// Tag i cui contenuti non sono testo da tenere.
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'SVG', 'MATH']);

function cleanNode(node, doc) {
	if (node.nodeType === 3) return doc.createTextNode(node.nodeValue);
	if (node.nodeType !== 1) return null;
	const tag = node.tagName.toUpperCase();
	if (DROP_WITH_CONTENT.has(tag)) return null;
	const children = [...node.childNodes].map(child => cleanNode(child, doc)).filter(Boolean);
	if (!ALLOWED.has(tag)) {
		const fragment = doc.createDocumentFragment();
		children.forEach(child => fragment.append(child));
		return fragment;
	}
	const element = doc.createElement(tag === 'DIV' ? 'p' : tag.toLowerCase());
	if (tag === 'A') {
		let url = null;
		try {
			url = new URL(node.getAttribute('href') || '');
		} catch { /* link non valido: resta solo il testo */ }
		if (!url || !['http:', 'https:'].includes(url.protocol)) {
			const fragment = doc.createDocumentFragment();
			children.forEach(child => fragment.append(child));
			return fragment;
		}
		element.setAttribute('href', url.href);
		element.setAttribute('target', '_blank');
		element.setAttribute('rel', 'noopener noreferrer');
	}
	children.forEach(child => element.append(child));
	return element;
}

// Restituisce l'HTML filtrato e il testo semplice (per contare i caratteri e per le anteprime).
// Senza DOMParser (test in Node) il testo viene trattato come testo semplice, senza formattazione.
export function sanitizeNotes(html) {
	const source = String(html || '');
	if (typeof DOMParser === 'undefined') {
		const text = source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
		return { html: text ? `<p>${escapeHtml(text)}</p>` : '', text };
	}
	const parsed = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html');
	const container = parsed.createElement('div');
	[...parsed.body.childNodes].map(child => cleanNode(child, parsed)).filter(Boolean).forEach(child => container.append(child));
	const text = (container.textContent || '').replace(/ /g, ' ').trim();
	return { html: text ? container.innerHTML : '', text };
}
