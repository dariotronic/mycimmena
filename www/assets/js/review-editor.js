// Editor delle recensioni (e, dalla Fase 1, delle note del diario): contatore dei caratteri, pulsante di salvataggio, formattazione e slider del voto.
import { catState, formatSpipe } from './domain.js';
import { showErrorToast } from './toasts.js';

export function reviewTextLength(editor) {
	return Array.from((editor.innerText || editor.textContent || '').replace(/\r\n?/g, '\n')).length;
}

export function updateReviewCounter(form) {
	const editor = form.querySelector('[data-review-editor]');
	const counter = form.querySelector('.review-character-count');
	if (!editor || !counter) return;
	const length = reviewTextLength(editor);
	counter.textContent = `${length.toLocaleString('it-IT')} / 20.000 caratteri`;
	counter.classList.toggle('error', length > 20000);
	updateReviewSaveButton(form);
}

export function updateReviewSaveButton(form) {
	const submit = form.querySelector('button[type="submit"]');
	const editor = form.querySelector('[data-review-editor]');
	const rating = form.querySelector('input[name="rating"]')?.value || '';
	if (!submit || !editor || !form.querySelector('.review-delete')) return;
	submit.disabled = rating === form.dataset.originalReviewRating
		&& editor.innerHTML === form.dataset.originalReviewContent;
}

export function initializeReviewForm(form) {
	const editor = form.querySelector('[data-review-editor]');
	if (!editor || !form.querySelector('.review-delete')) return;
	form.dataset.originalReviewRating = form.querySelector('input[name="rating"]')?.value || '';
	form.dataset.originalReviewContent = editor.innerHTML;
	updateReviewSaveButton(form);
}

export function updateReviewRating(form) {
	const fieldset = form.querySelector('.review-rating');
	if (!fieldset) return;
	const selected = Number(form.querySelector('input[name="rating"]')?.value || 0);
	const slider = fieldset.querySelector('[data-rating-slider]');
	if (slider) {
		slider.querySelectorAll('.cat-cell').forEach((cell, index) => {
			cell.className = `cat-cell ${catState(selected, index)}`;
		});
		if (selected) {
			slider.setAttribute('aria-valuenow', String(selected));
			slider.setAttribute('aria-valuetext', formatSpipe(selected));
		} else {
			slider.removeAttribute('aria-valuenow');
			slider.setAttribute('aria-valuetext', 'Nessun voto');
		}
	}
	const output = fieldset.querySelector('.review-rating-output');
	if (output) output.textContent = selected ? formatSpipe(selected) : 'Seleziona un punteggio da mezza spipa a dieci spipe';
}

// Barra di formattazione: grassetto, corsivo, elenchi, citazione e link esterni (solo HTTP o HTTPS).
export function applyReviewFormat(format) {
	const editor = format.closest('.review-form')?.querySelector('[data-review-editor]');
	if (!editor) return;
	editor.focus();
	const command = format.dataset.reviewFormat;
	if (command === 'createLink') {
		const selection = window.getSelection();
		const savedRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
		const value = window.prompt('Indirizzo del link esterno (https://…)');
		if (!value) return;
		let url;
		try {
			url = new URL(value.trim());
		} catch {
			showErrorToast('Inserisci un indirizzo web valido.');
			return;
		}
		if (!['http:', 'https:'].includes(url.protocol)) {
			showErrorToast('Sono consentiti solo link HTTP o HTTPS.');
			return;
		}
		if (savedRange && selection) {
			selection.removeAllRanges();
			selection.addRange(savedRange);
		}
		document.execCommand(command, false, url.href);
		const anchor = selection?.anchorNode?.parentElement?.closest('a');
		if (anchor) {
			anchor.target = '_blank';
			anchor.rel = 'noopener noreferrer';
		}
	} else {
		document.execCommand(command, false, command === 'formatBlock' ? `<${format.dataset.reviewValue}>` : null);
	}
	updateReviewCounter(format.closest('.review-form'));
}

export function handleReviewInput(event) {
	const editor = event.target.closest('[data-review-editor]');
	if (editor) updateReviewCounter(editor.closest('.review-form'));
}

// Slider del voto: 20 step da mezzo gatto. Imposta il valore, aggiorna i gatti e, sui touch, vibra a ogni step.
function setReviewRating(form, value) {
	const input = form.querySelector('input[name="rating"]');
	const next = Math.min(10, Math.max(0.5, Math.round(value * 2) / 2));
	if (!input || Number(input.value) === next) return;
	input.value = String(next);
	updateReviewRating(form);
	updateReviewSaveButton(form);
	if (window.matchMedia('(pointer: coarse)').matches && typeof navigator.vibrate === 'function') navigator.vibrate(8);
}

const ratingFromPointer = (slider, clientX) => {
	const rect = slider.getBoundingClientRect();
	return Math.ceil(((clientX - rect.left) / rect.width) * 20) / 2;
};

// Mouse e penna impostano il voto subito. Col dito il voto cambia con un tocco o un trascinamento orizzontale;
// se il gesto diventa uno scorrimento verticale della pagina (pointercancel) si torna al voto di partenza.
export function handleRatingPointerDown(event) {
	const slider = event.target.closest('[data-rating-slider]');
	if (!slider || (event.pointerType === 'mouse' && event.button !== 0)) return;
	const form = slider.closest('[data-review-form]');
	const input = form?.querySelector('input[name="rating"]');
	if (!form || !input) return;
	const touch = event.pointerType === 'touch';
	const startValue = input.value;
	const startX = event.clientX;
	let dragging = !touch;
	slider.setPointerCapture?.(event.pointerId);
	if (!touch) {
		event.preventDefault();
		slider.focus({ preventScroll: true });
		setReviewRating(form, ratingFromPointer(slider, event.clientX));
	}
	const move = moveEvent => {
		if (!dragging && Math.abs(moveEvent.clientX - startX) > 6) dragging = true;
		if (dragging) setReviewRating(form, ratingFromPointer(slider, moveEvent.clientX));
	};
	const end = endEvent => {
		slider.removeEventListener('pointermove', move);
		slider.removeEventListener('pointerup', end);
		slider.removeEventListener('pointercancel', end);
		if (endEvent.type === 'pointercancel') {
			if (touch && input.value !== startValue) {
				input.value = startValue;
				updateReviewRating(form);
				updateReviewSaveButton(form);
			}
			return;
		}
		if (!dragging) setReviewRating(form, ratingFromPointer(slider, endEvent.clientX));
	};
	slider.addEventListener('pointermove', move);
	slider.addEventListener('pointerup', end);
	slider.addEventListener('pointercancel', end);
}

export function handleRatingKeydown(event) {
	const slider = event.target.closest('[data-rating-slider]');
	const form = slider?.closest('[data-review-form]');
	if (!form) return;
	const current = Number(form.querySelector('input[name="rating"]')?.value || 0);
	const steps = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5, PageUp: 1, PageDown: -1 };
	let next;
	if (event.key in steps) next = current + steps[event.key];
	else if (event.key === 'Home') next = 0.5;
	else if (event.key === 'End') next = 10;
	else return;
	event.preventDefault();
	setReviewRating(form, next);
}
