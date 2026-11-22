// Dialog condivisi: conferma delle operazioni e immagine ingrandita (locandine e avatar).
import { createLightboxZoom } from './lightbox-zoom.js';

export function createDialogs({ app }) {
	const actionDialog = document.getElementById('action-dialog');
	const actionDialogForm = document.getElementById('action-dialog-form');
	const actionDialogTitle = document.getElementById('action-dialog-title');
	const actionDialogMessage = document.getElementById('action-dialog-message');
	const actionDialogSubmit = document.getElementById('action-dialog-submit');
	const posterLightbox = document.getElementById('poster-lightbox');
	const posterLightboxClose = document.getElementById('poster-lightbox-close');
	const posterLightboxImage = document.getElementById('poster-lightbox-image');
	const posterLightboxLoader = document.getElementById('poster-lightbox-loader');
	const posterLightboxDownload = document.getElementById('poster-lightbox-download');
	let actionDialogResolver = null;
	const reviewsDialog = document.getElementById('reviews-dialog');

	function finishActionDialog(value) {
		const resolve = actionDialogResolver;
		actionDialogResolver = null;
		if (actionDialog.open) actionDialog.close();
		resolve?.(value);
	}

	function showActionDialog({ title, message, submitText }) {
		return new Promise(resolve => {
			actionDialogTitle.textContent = title;
			actionDialogMessage.textContent = message;
			actionDialogSubmit.textContent = submitText;
			actionDialogResolver = resolve;
			actionDialog.showModal();
			document.getElementById('action-dialog-cancel').focus();
		});
	}

	function askConfirmation(message) {
		return showActionDialog({ title: 'Conferma operazione', message, submitText: 'Conferma' });
	}

	actionDialogForm.addEventListener('submit', event => {
		event.preventDefault();
		finishActionDialog(true);
	});
	document.getElementById('action-dialog-cancel').addEventListener('click', () => finishActionDialog(null));
	actionDialog.addEventListener('cancel', event => {
		event.preventDefault();
		finishActionDialog(null);
	});
	// Il modale si apre con il loader; l'immagine compare solo quando è scaricata del tutto: la versione grande
	// (data-full) se c'è, altrimenti la miniatura. Se la grande non arriva si mostra la miniatura.
	// Il loader appare dopo un attimo, così le immagini già in cache non lo fanno lampeggiare.
	let lightboxSequence = 0;
	let lightboxLoaderTimer = null;
	const lightboxZoom = createLightboxZoom(posterLightboxImage, posterLightbox);
	function showLightboxImage(src) {
		window.clearTimeout(lightboxLoaderTimer);
		lightboxZoom.reset();
		posterLightboxLoader.hidden = true;
		posterLightboxImage.src = src;
		posterLightboxImage.hidden = false;
	}
	// downloadUrl (facoltativo, solo per le locandine): mostra il pulsante per scaricare l'immagine.
	function openImageLightbox(img, downloadUrl = '') {
		const sequence = ++lightboxSequence;
		posterLightboxDownload.hidden = !downloadUrl;
		if (downloadUrl) posterLightboxDownload.href = downloadUrl;
		else posterLightboxDownload.removeAttribute('href');
		const thumbnail = img.currentSrc || img.src;
		const large = img.dataset.full;
		posterLightboxImage.hidden = true;
		posterLightboxImage.removeAttribute('src');
		posterLightboxImage.alt = img.alt;
		posterLightboxLoader.hidden = true;
		window.clearTimeout(lightboxLoaderTimer);
		lightboxLoaderTimer = window.setTimeout(() => {
			if (sequence === lightboxSequence && posterLightbox.open) posterLightboxLoader.hidden = false;
		}, 150);
		posterLightbox.showModal();
		const loader = new Image();
		loader.onload = () => {
			if (sequence === lightboxSequence) showLightboxImage(loader.src);
		};
		loader.onerror = () => {
			if (sequence === lightboxSequence) showLightboxImage(thumbnail);
		};
		loader.src = large || thumbnail;
	}
	posterLightbox.addEventListener('close', () => {
		lightboxSequence += 1;
		window.clearTimeout(lightboxLoaderTimer);
		posterLightboxLoader.hidden = true;
		lightboxZoom.reset();
	});
	// Avatar nelle recensioni e nel Profilo: si aprono nello stesso modale delle locandine.
	[app, reviewsDialog].forEach(root => root.addEventListener('click', event => {
		const img = event.target.closest('.review-avatar-trigger, .profile-avatar-trigger')?.querySelector('img');
		if (img) openImageLightbox(img);
	}));
	posterLightboxClose.addEventListener('click', () => posterLightbox.close());
	posterLightbox.addEventListener('click', event => {
		if (event.target === posterLightbox) posterLightbox.close();
	});
	return { askConfirmation, openImageLightbox };
}
