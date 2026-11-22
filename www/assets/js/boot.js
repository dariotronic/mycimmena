// Primo script della pagina, classico e non a modulo, così gira anche su una WebView troppo vecchia per il resto.
// 1. Applica il tema salvato prima del primo disegno (niente lampo chiaro aprendo l'app di notte).
// 2. Controlla che la WebView regga l'app: le regole di style.css usano :has(), le container query e le unità dvh
//    (Chromium 108, fine 2022). Se mancano mostra la schermata "Serve un aggiornamento" al posto di una pagina rotta.
(function () {
	'use strict';
	try {
		if (localStorage.getItem('mycimmena-color-mode') === 'night') {
			document.documentElement.dataset.theme = 'night';
		}
	} catch (error) {
		console.error('Impossibile leggere la modalità colore salvata.', error);
	}

	var supported = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
		&& CSS.supports('selector(:has(a))')
		&& CSS.supports('container-type: inline-size')
		&& CSS.supports('height: 1dvh')
		&& typeof HTMLDialogElement === 'function';
	if (supported) return;
	document.documentElement.dataset.webviewTooOld = 'true';
	document.addEventListener('DOMContentLoaded', function () {
		var notice = document.getElementById('webview-too-old');
		if (notice) notice.hidden = false;
	});
}());
