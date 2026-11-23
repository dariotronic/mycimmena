// Finestra "Segnala un problema o proponi un'idea" (PIANO.md, §11). Il modulo resta compilato se l'invio non va
// (offline, server giù) o se si chiude la finestra: si svuota solo dopo un invio riuscito.
import { escapeHtml } from './domain.js';
import { DAILY_LIMIT, FEEDBACK_TYPES, MAX_IMAGES, MAX_MESSAGE, sendFeedback, sentToday, shrinkImage, techInfo, validateFeedback } from './feedback.js';
import { hydrateIcons } from './icons.js';
import { showErrorToast, showToast } from './toasts.js';

export function renderFeedbackForm({ tech = '' } = {}) {
	return `
		<form class="feedback-form" data-feedback-form novalidate>
			<fieldset class="feedback-types">
				<legend>Di cosa si tratta?</legend>
				<div class="onboarding-chips" role="radiogroup">
					${FEEDBACK_TYPES.map((option, index) => `
						<label class="onboarding-chip"><input type="radio" name="type" value="${option.value}"${index === 0 ? ' checked' : ''}><span>${escapeHtml(option.label)}</span></label>
					`).join('')}
				</div>
			</fieldset>
			<div class="field">
				<label for="feedback-message">Racconta</label>
				<textarea id="feedback-message" name="message" rows="6" maxlength="${MAX_MESSAGE}" required placeholder="Cosa è successo, o cosa ti piacerebbe?"></textarea>
				<p class="help-text feedback-count" data-feedback-count aria-live="polite">0/${MAX_MESSAGE}</p>
			</div>
			<div class="field">
				<label for="feedback-email">La tua email <span>(facoltativa, se vuoi una risposta)</span></label>
				<input id="feedback-email" name="email" type="email" maxlength="200" autocomplete="email">
			</div>
			<div class="field">
				<span class="field-label">Immagini <span>(fino a ${MAX_IMAGES}, per esempio uno screenshot)</span></span>
				<div class="feedback-images" data-feedback-images></div>
				<label class="button secondary file-button" data-feedback-add>Aggiungi immagini<input type="file" accept="image/*" multiple data-feedback-file></label>
			</div>
			<div class="feedback-tech">
				<label class="feedback-check"><input type="checkbox" name="includeTech" checked> Allega informazioni tecniche</label>
				<details>
					<summary>Vedi cosa viene inviato</summary>
					<pre data-feedback-tech>${escapeHtml(tech)}</pre>
					<p class="help-text">Mai la chiave OMDb, né watchlist, diario o voti.</p>
				</details>
			</div>
			<input class="feedback-trap" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
			<div class="button-row">
				<button class="button" type="submit" data-feedback-submit>Invia</button>
			</div>
		</form>
	`;
}

export function createFeedbackUi({ store, getData, refresh }) {
	const dialog = document.getElementById('feedback-dialog');
	const body = document.getElementById('feedback-body');
	let images = [];
	let sending = false;

	const form = () => body.querySelector('[data-feedback-form]');

	function drawImages() {
		const list = body.querySelector('[data-feedback-images]');
		images.forEach(image => { image.url ||= URL.createObjectURL(image.blob); });
		list.innerHTML = images.map((image, index) => `
			<figure class="feedback-image">
				<img src="${image.url}" alt="Immagine ${index + 1}">
				<button class="icon-button" type="button" data-feedback-remove="${index}" aria-label="Togli l’immagine ${index + 1}" title="Togli">${'<span class="material-icons-outlined" data-icon="close" aria-hidden="true"></span>'}</button>
			</figure>
		`).join('');
		hydrateIcons(list);
		body.querySelector('[data-feedback-add]').hidden = images.length >= MAX_IMAGES;
	}

	async function open() {
		if (!form()) {
			body.innerHTML = renderFeedbackForm({ tech: await techInfo({ mode: getData().mode }) });
			hydrateIcons(body);
			drawImages();
		} else {
			body.querySelector('[data-feedback-tech]').textContent = await techInfo({ mode: getData().mode });
		}
		if (!dialog.open) dialog.showModal();
	}

	async function addImages(files) {
		const room = MAX_IMAGES - images.length;
		if (files.length > room) showErrorToast(`Puoi allegare al massimo ${MAX_IMAGES} immagini.`);
		for (const file of [...files].slice(0, room)) {
			try {
				images.push({ blob: await shrinkImage(file) });
			} catch (error) {
				showErrorToast(error);
			}
		}
		drawImages();
	}

	function reset() {
		images.forEach(image => image.url && URL.revokeObjectURL(image.url));
		images = [];
		body.innerHTML = '';
	}

	async function submit() {
		const element = form();
		const values = Object.fromEntries(new FormData(element).entries());
		const input = { type: values.type, message: String(values.message || ''), email: String(values.email || '').trim(), images: images.map(image => image.blob) };
		const problem = validateFeedback(input);
		if (problem) {
			showErrorToast(problem);
			return;
		}
		if (sentToday(getData().meta).length >= DAILY_LIMIT) {
			showErrorToast(`Hai già inviato ${DAILY_LIMIT} segnalazioni oggi: riprova domani. Il testo resta qui.`);
			return;
		}
		if (values.website) return;
		sending = true;
		const button = element.querySelector('[data-feedback-submit]');
		button.disabled = true;
		button.textContent = 'Invio…';
		try {
			await sendFeedback({ ...input, tech: values.includeTech ? await techInfo({ mode: getData().mode }) : '' });
			await store.updateKv('meta', { feedbackSentAt: [...sentToday(getData().meta), new Date().toISOString()] });
			await refresh();
			reset();
			dialog.close();
			showToast('feedbackSent');
		} catch (error) {
			showErrorToast(error);
			button.disabled = false;
			button.textContent = 'Invia';
		} finally {
			sending = false;
		}
	}

	body.addEventListener('submit', event => {
		event.preventDefault();
		if (!sending) submit();
	});
	body.addEventListener('input', event => {
		if (event.target.name === 'message') body.querySelector('[data-feedback-count]').textContent = `${event.target.value.length}/${MAX_MESSAGE}`;
	});
	body.addEventListener('change', event => {
		const input = event.target.closest('[data-feedback-file]');
		if (input?.files?.length) {
			addImages(input.files);
			input.value = '';
		}
	});
	body.addEventListener('click', event => {
		const remove = event.target.closest('[data-feedback-remove]');
		if (!remove) return;
		const [removed] = images.splice(Number(remove.dataset.feedbackRemove), 1);
		if (removed?.url) URL.revokeObjectURL(removed.url);
		drawImages();
	});
	document.getElementById('feedback-close').addEventListener('click', () => dialog.close());

	return { open };
}
