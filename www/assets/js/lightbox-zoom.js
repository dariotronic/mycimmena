// Zoom dell'immagine nel lightbox: clic o tap per ingrandire nel punto scelto (e di nuovo per tornare indietro),
// rotellina e pinch per regolare l'ingrandimento, trascinamento per spostarsi, tasti + − 0 da tastiera.
// Lo zoom è una trasformazione CSS sull'<img>: il layout del modale non cambia.
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const CLICK_SCALE = 2.5;
const DRAG_THRESHOLD = 6;

export function createLightboxZoom(image, dialog) {
	let scale = 1;
	let x = 0;
	let y = 0;
	const pointers = new Map();
	let dragged = false;
	let downPoint = null;

	function apply(animate) {
		image.classList.toggle('is-gesturing', !animate);
		image.classList.toggle('is-zoomed', scale > 1);
		image.style.transform = scale > 1 ? `translate(${x}px, ${y}px) scale(${scale})` : '';
	}

	// L'immagine resta sempre a coprire il proprio riquadro originale: non si può trascinarla fuori dallo schermo.
	function clamp() {
		const maxX = image.offsetWidth * (scale - 1) / 2;
		const maxY = image.offsetHeight * (scale - 1) / 2;
		x = Math.max(-maxX, Math.min(maxX, x));
		y = Math.max(-maxY, Math.min(maxY, y));
	}

	// Ingrandisce tenendo fermo sotto il punto (clientX, clientY) il dettaglio che c'era prima.
	function zoomAt(clientX, clientY, nextScale, animate = false) {
		nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
		const rect = image.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2 - x;
		const centerY = rect.top + rect.height / 2 - y;
		const localX = (clientX - centerX - x) / scale;
		const localY = (clientY - centerY - y) / scale;
		scale = nextScale;
		x = clientX - centerX - localX * scale;
		y = clientY - centerY - localY * scale;
		if (scale === 1) x = y = 0;
		clamp();
		apply(animate);
	}

	function zoomAtCenter(nextScale) {
		const rect = image.getBoundingClientRect();
		zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, nextScale, true);
	}

	function reset() {
		scale = 1;
		x = y = 0;
		pointers.clear();
		apply(true);
	}

	const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

	image.draggable = false;
	image.addEventListener('pointerdown', event => {
		image.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 1) {
			dragged = false;
			downPoint = { x: event.clientX, y: event.clientY };
		} else {
			dragged = true;
		}
	});
	image.addEventListener('pointermove', event => {
		const previous = pointers.get(event.pointerId);
		if (!previous) return;
		const current = { x: event.clientX, y: event.clientY };
		if (downPoint && distance(downPoint, current) > DRAG_THRESHOLD) dragged = true;
		if (pointers.size === 2) {
			const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)[1];
			const before = distance(previous, other);
			const after = distance(current, other);
			const midBefore = midpoint(previous, other);
			const midAfter = midpoint(current, other);
			pointers.set(event.pointerId, current);
			if (before > 0) zoomAt(midAfter.x, midAfter.y, scale * after / before);
			if (scale > 1) {
				x += midAfter.x - midBefore.x;
				y += midAfter.y - midBefore.y;
				clamp();
				apply(false);
			}
			return;
		}
		pointers.set(event.pointerId, current);
		if (pointers.size === 1 && scale > 1 && dragged) {
			x += current.x - previous.x;
			y += current.y - previous.y;
			clamp();
			apply(false);
		}
	});
	const endPointer = event => {
		pointers.delete(event.pointerId);
		if (!pointers.size) image.classList.remove('is-gesturing');
	};
	image.addEventListener('pointerup', endPointer);
	image.addEventListener('pointercancel', endPointer);
	image.addEventListener('click', event => {
		if (dragged) return;
		if (scale > 1) zoomAt(event.clientX, event.clientY, 1, true);
		else zoomAt(event.clientX, event.clientY, CLICK_SCALE, true);
	});
	image.addEventListener('wheel', event => {
		event.preventDefault();
		zoomAt(event.clientX, event.clientY, scale * Math.exp(-event.deltaY * 0.002));
	}, { passive: false });
	dialog.addEventListener('keydown', event => {
		if (image.hidden || event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.key === '+' || event.key === '=') zoomAtCenter(scale * 1.5);
		else if (event.key === '-') zoomAtCenter(scale / 1.5);
		else if (event.key === '0') zoomAtCenter(1);
		else return;
		event.preventDefault();
	});
	window.addEventListener('resize', () => {
		if (!dialog.open || scale === 1) return;
		clamp();
		apply(false);
	});

	return { reset };
}
