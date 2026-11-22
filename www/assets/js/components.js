import { escapeHtml } from './domain.js';

export function pageHeader(title, description = '') {
	return `
		<header class="page-heading">
			<div>
				<p class="eyebrow">myCimmena</p>
				<h1>${escapeHtml(title)}</h1>
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
