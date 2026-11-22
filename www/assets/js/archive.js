// Ricerca nell'archivio: filtra le serate già viste senza ridisegnare il resto della pagina.
import { hydrateIcons } from './icons.js';

export function createArchive({ viewRenderer }) {
	let archiveQuery = '';

	function updateArchiveRows() {
		const list = document.getElementById('archive-rows');
		if (!list) return;
		list.innerHTML = viewRenderer.renderArchiveRows();
		hydrateIcons(list);
	}

	function bind() {
		document.getElementById('archive-search-form')?.addEventListener('submit', event => event.preventDefault());
		document.getElementById('archive-query')?.addEventListener('input', event => {
			archiveQuery = event.target.value;
			updateArchiveRows();
		});
	}

	return { getArchiveQuery: () => archiveQuery, updateArchiveRows, bind };
}
