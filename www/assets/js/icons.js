const iconMap = Object.freeze({
	add: 'add',
	archive: 'archive',
	bar_chart: 'bar_chart',
	add_comment: 'add_comment',
	arrow_downward: 'arrow_downward',
	arrow_upward: 'arrow_upward',
	casino: 'casino',
	check: 'check',
	chevron_right: 'chevron_right',
	close: 'close',
	content_copy: 'content_copy',
	dark_mode: 'dark_mode',
	delete: 'delete',
	download: 'download',
	done_all: 'done_all',
	edit: 'edit',
	event: 'event',
	event_available: 'event_available',
	event_busy: 'event_busy',
	expand_more: 'expand_more',
	filter_list: 'filter_list',
	format_bold: 'format_bold',
	format_italic: 'format_italic',
	format_list_bulleted: 'format_list_bulleted',
	format_list_numbered: 'format_list_numbered',
	format_quote: 'format_quote',
	forum: 'forum',
	info: 'info',
	inventory_2: 'inventory_2',
	light_mode: 'light_mode',
	link: 'link',
	movie: 'movie',
	notifications_active: 'notifications_active',
	notifications_off: 'notifications_off',
	person: 'person',
	place: 'place',
	playlist_add: 'playlist_add',
	playlist_add_check: 'playlist_add_check',
	progress_activity: 'progress_activity',
	remove: 'remove',
	reset_settings: 'reset_settings',
	save: 'save',
	send: 'send',
	strikethrough_s: 'strikethrough_s',
	share: 'share',
	task_alt: 'task_alt',
	sort_added: 'sort_added',
	sort_title: 'sort_title',
	sort_votes: 'sort_votes',
	sort_year: 'sort_year',
	settings: 'settings',
	view_list: 'view_list',
	visibility: 'visibility',
	volume_off: 'volume_off',
	volume_up: 'volume_up',
	grid_view: 'grid_view'
});

// Le icone sono simboli dello sprite SVG inline in index.html (<symbol id="i-nome">), non più un font di Google.
// La classe resta material-icons-outlined: le regole di style.css la usano per dimensione (font-size) e colore.
const glyphSvg = glyph => `<svg focusable="false"><use href="#i-${glyph}"/></svg>`;

export function icon(name, className = '') {
	const glyph = iconMap[name];
	if (!glyph) throw new RangeError(`Icona non configurata: ${name}`);
	if (className && !/^[a-z0-9_-]+(?:\s+[a-z0-9_-]+)*$/.test(className)) {
		throw new TypeError('Classe icona non valida.');
	}
	const classes = className ? `material-icons-outlined ${className}` : 'material-icons-outlined';
	return `<span class="${classes}" data-icon="${name}" aria-hidden="true">${glyphSvg(glyph)}</span>`;
}

export function hydrateIcons(root = document) {
	const elements = [];
	if (root instanceof Element && root.matches('.material-icons-outlined[data-icon]')) {
		elements.push(root);
	}
	elements.push(...root.querySelectorAll('.material-icons-outlined[data-icon]'));
	for (const element of elements) {
		const glyph = iconMap[element.dataset.icon];
		if (glyph && !element.firstElementChild) element.innerHTML = glyphSvg(glyph);
	}
}

export function setIcon(element, name) {
	const glyph = iconMap[name];
	if (!element || !glyph) return;
	element.dataset.icon = name;
	element.innerHTML = glyphSvg(glyph);
}

export { iconMap };
