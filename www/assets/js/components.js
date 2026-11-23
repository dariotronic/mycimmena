import { escapeHtml } from './domain.js';

// `actions`: HTML già pronto (pulsanti a icona) da mettere di fianco al titolo.
export function pageHeader(title, description = '', actions = '') {
	return `
		<header class="page-heading">
			<div>
				<p class="eyebrow">myCimmena</p>
				${actions ? `<div class="page-title-row"><h1>${escapeHtml(title)}</h1><div class="page-heading-actions">${actions}</div></div>` : `<h1>${escapeHtml(title)}</h1>`}
				${description ? `<p>${escapeHtml(description)}</p>` : ''}
			</div>
		</header>
	`;
}

export function emptyState(message, linkText, href) {
	return `
		<div class="empty-state">
			<p>${message}</p>
			${linkText ? `<a class="button secondary" href="${href}">${linkText}</a>` : ''}
		</div>
	`;
}
