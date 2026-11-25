// Menù a tendina nello stile dell'app: al posto della finestra di sistema di Android, un pannello che sale dal basso
// con i colori del tema. Il <select> vero resta nel modulo, nascosto: valore, FormData ed eventi "change" sono i
// suoi, così il resto del codice non cambia. Si applica da solo a ogni <select> che compare nella pagina.
import { escapeHtml } from './domain.js';
import { icon } from './icons.js';

const ENHANCED = 'customSelect';
let sheet = null;
let current = null;

// Il nome del menù: aria-label, oppure il testo della sua <label>.
function labelOf(select) {
	if (select.getAttribute('aria-label')) return select.getAttribute('aria-label');
	const label = select.id ? document.querySelector(`label[for="${CSS.escape(select.id)}"]`) : null;
	return label ? label.textContent.replace(/\s+/g, ' ').trim() : '';
}

const optionText = select => select.selectedOptions[0]?.textContent.trim() || '';

function syncButton(select) {
	const button = select.nextElementSibling;
	if (!button?.matches('.custom-select-button')) return;
	button.querySelector('.custom-select-value').textContent = optionText(select);
	button.classList.toggle('is-placeholder', !select.value);
}

function getSheet() {
	if (sheet) return sheet;
	sheet = document.createElement('dialog');
	sheet.className = 'select-sheet';
	sheet.innerHTML = '<div class="select-sheet-panel"><p class="select-sheet-title" id="select-sheet-title"></p><div class="select-sheet-list" role="listbox" aria-labelledby="select-sheet-title"></div></div>';
	document.body.append(sheet);
	// Tocco fuori dal pannello: chiude senza cambiare.
	sheet.addEventListener('click', event => {
		const option = event.target.closest('[data-select-value]');
		if (option) return void choose(option.dataset.selectValue);
		if (!event.target.closest('.select-sheet-panel')) sheet.close();
	});
	sheet.addEventListener('close', () => {
		const button = current?.nextElementSibling;
		button?.setAttribute('aria-expanded', 'false');
		current = null;
	});
	return sheet;
}

function choose(value) {
	const select = current;
	sheet.close();
	if (!select || select.value === value) return;
	select.value = value;
	syncButton(select);
	select.dispatchEvent(new Event('input', { bubbles: true }));
	select.dispatchEvent(new Event('change', { bubbles: true }));
}

function open(select) {
	const dialog = getSheet();
	current = select;
	dialog.querySelector('.select-sheet-title').textContent = labelOf(select);
	dialog.querySelector('.select-sheet-list').innerHTML = [...select.options].map(option => {
		const selected = option.value === select.value;
		return `<button class="select-sheet-option${selected ? ' selected' : ''}" type="button" role="option" aria-selected="${selected}" data-select-value="${escapeHtml(option.value)}"${option.disabled ? ' disabled' : ''}><span>${escapeHtml(option.textContent.trim())}</span>${selected ? icon('check', 'select-sheet-check') : ''}</button>`;
	}).join('');
	select.nextElementSibling?.setAttribute('aria-expanded', 'true');
	dialog.showModal();
	// L'opzione scelta in vista, senza farle prendere il focus (niente bordo al primo tocco).
	dialog.querySelector('.select-sheet-option.selected')?.scrollIntoView({ block: 'center', behavior: 'instant' });
	document.activeElement?.blur?.();
}

function enhance(select) {
	if (select.dataset[ENHANCED] || select.multiple) return;
	select.dataset[ENHANCED] = 'true';
	select.classList.add('custom-select-native');
	select.tabIndex = -1;
	select.setAttribute('aria-hidden', 'true');
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'custom-select-button';
	button.setAttribute('aria-haspopup', 'listbox');
	button.setAttribute('aria-expanded', 'false');
	button.setAttribute('aria-label', labelOf(select));
	button.innerHTML = `<span class="custom-select-value"></span>${icon('expand_more', 'custom-select-chevron')}`;
	button.disabled = select.disabled;
	select.after(button);
	syncButton(select);
	button.addEventListener('click', () => open(select));
	// Cambi fatti da codice (o dal modulo azzerato): il pulsante si aggiorna.
	select.addEventListener('change', () => syncButton(select));
	// La <label> del menù apre il pannello.
	if (select.id) document.querySelectorAll(`label[for="${CSS.escape(select.id)}"]`).forEach(label => label.addEventListener('click', event => {
		event.preventDefault();
		button.focus({ preventScroll: true });
	}));
}

export function enhanceSelects(root = document) {
	root.querySelectorAll?.('select').forEach(enhance);
}

// Una volta all'avvio: i menù già nella pagina e quelli che arrivano dopo (ogni vista, onboarding, finestre).
export function initCustomSelects() {
	enhanceSelects(document);
	const observer = new MutationObserver(records => {
		for (const record of records) {
			for (const node of record.addedNodes) {
				if (node.nodeType !== 1) continue;
				if (node.matches('select')) enhance(node);
				else enhanceSelects(node);
			}
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
}
