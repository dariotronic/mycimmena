import { POSTER_CARD_WIDTH, sizedPosterUrl } from './movie-info.js';

function loadSharePoster(movie) {
	const sources = [];
	if (movie.poster_local) sources.push(movie.poster_local);
	else if (/^tt[0-9]{1,20}$/.test(movie.id || '') && movie.poster_cached === true) sources.push(`api/poster.php?i=${encodeURIComponent(movie.id)}`);
	const remote = sizedPosterUrl(movie.poster, POSTER_CARD_WIDTH);
	if (remote && !sources.includes(remote)) sources.push(remote);
	return new Promise(resolve => {
		let settled = false;
		const finish = image => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timeout);
			resolve(image);
		};
		const trySource = index => {
			if (settled) return;
			if (index >= sources.length) {
				finish(null);
				return;
			}
			const image = new Image();
			image.crossOrigin = 'anonymous';
			image.onload = () => finish(image);
			image.onerror = () => trySource(index + 1);
			image.src = sources[index];
		};
		const timeout = window.setTimeout(() => finish(null), 10000);
		trySource(0);
	});
}

function wrapShareText(context, text, maxWidth) {
	const lines = [];
	let line = '';
	for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
		let candidate = line ? `${line} ${word}` : word;
		if (context.measureText(candidate).width <= maxWidth) {
			line = candidate;
			continue;
		}
		if (line) lines.push(line);
		line = '';
		for (const character of word) {
			candidate = line + character;
			if (line && context.measureText(candidate).width > maxWidth) {
				lines.push(line);
				line = character;
			} else {
				line = candidate;
			}
		}
	}
	if (line) lines.push(line);
	return lines;
}

// Palette letta dalle variabili CSS del tema attivo: l'immagine segue modalità chiara o scura e la palette del sito.
function sharePalette() {
	const styles = getComputedStyle(document.documentElement);
	const value = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
	const night = document.documentElement.dataset.theme === 'night';
	return {
		night,
		paper: value('--paper', '#f8f2ef'),
		ink: value('--ink', '#2b1419'),
		muted: value('--muted', '#77595f'),
		rust: value('--rust', '#8a1f2d'),
		apricot: value('--apricot', '#eaa83f'),
		clay: value('--clay', '#94696f'),
		surface: value('--surface', '#ffffff'),
		line: value('--line', 'rgba(43, 20, 25, .14)'),
		icon: value('--icon-color', '#8a1f2d'),
		clayWash: value('--clay-wash', 'rgba(156, 113, 81, .16)'),
		dot: value('--page-dot', 'rgba(138, 31, 45, .045)'),
		shadow: night ? 'rgba(0, 0, 0, .55)' : 'rgba(43, 20, 25, .16)'
	};
}

// Il logo SVG non dichiara width/height: senza dimensioni alcuni browser non lo disegnano su canvas.
async function loadShareLogo() {
	try {
		const response = await fetch('assets/logo.svg');
		if (!response.ok) return null;
		const svg = (await response.text()).replace('<svg ', '<svg width="322" height="315" ');
		const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
		const image = new Image();
		await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
		URL.revokeObjectURL(url);
		return image;
	} catch {
		return null;
	}
}

// Le icone si prendono dallo sprite SVG di index.php (viewBox 24 × 24); se un simbolo manca si omette.
function shareIconPaths(glyph) {
	const paths = [...(document.getElementById(`i-${glyph}`)?.querySelectorAll('path') || [])];
	if (!paths.length || typeof Path2D !== 'function') return null;
	return paths.map(path => new Path2D(path.getAttribute('d')));
}

function drawShareIcon(context, paths, x, y, size) {
	context.save();
	context.translate(x, y);
	context.scale(size / 24, size / 24);
	for (const path of paths) context.fill(path);
	context.restore();
}

function setShareFont(context, font, spacing = 0) {
	context.font = font;
	if ('letterSpacing' in context) context.letterSpacing = `${spacing}px`;
}

function drawShareText(context, lines, x, y, lineHeight) {
	lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
}

function drawShareRoundedRect(context, x, y, width, height, radius) {
	context.beginPath();
	context.roundRect(x, y, width, height, radius);
}

// Fondo come quello del sito: griglia di puntini, cerchi concentrici in alto a destra e onda in basso a sinistra.
function drawShareBackground(context, palette, width, height) {
	context.fillStyle = palette.paper;
	context.fillRect(0, 0, width, height);
	context.fillStyle = palette.dot;
	for (let y = 4; y < height; y += 12) {
		for (let x = 4; x < width; x += 12) {
			context.beginPath();
			context.arc(x, y, 1.1, 0, Math.PI * 2);
			context.fill();
		}
	}
	context.save();
	// Come nel sito: cerchi e onda appena accennati, più tenui in modalità scura.
	context.strokeStyle = palette.clay;
	context.globalAlpha = palette.night ? .14 : .2;
	context.lineWidth = 3;
	for (const radius of [230, 160]) {
		context.beginPath();
		context.arc(width - 40, 40, radius, 0, Math.PI * 2);
		context.stroke();
	}
	context.globalAlpha = palette.night ? .12 : .18;
	context.lineWidth = 4;
	context.beginPath();
	const waveY = height - 160;
	context.moveTo(-20, waveY);
	for (let x = -20; x < width * .62; x += 240) {
		context.quadraticCurveTo(x + 60, waveY - 60, x + 120, waveY);
		context.quadraticCurveTo(x + 180, waveY + 60, x + 240, waveY);
	}
	context.stroke();
	context.restore();
}

function drawSharePoster(context, palette, image, x, y, width, height) {
	context.save();
	drawShareRoundedRect(context, x, y, width, height, 16);
	context.clip();
	context.fillStyle = palette.clayWash;
	context.fillRect(x, y, width, height);
	if (image) {
		const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
		const drawWidth = image.naturalWidth * scale;
		const drawHeight = image.naturalHeight * scale;
		context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
	} else {
		context.fillStyle = palette.clay;
		setShareFont(context, '400 72px Spectral, serif');
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillText('C', x + width / 2, y + height / 2);
	}
	context.restore();
}

function drawShareCard(context, palette, x, y, width, height, radius, border = false) {
	context.save();
	context.shadowColor = palette.shadow;
	context.shadowBlur = 36;
	context.shadowOffsetY = 14;
	context.fillStyle = palette.surface;
	drawShareRoundedRect(context, x, y, width, height, radius);
	context.fill();
	context.restore();
	if (border) {
		context.strokeStyle = palette.line;
		context.lineWidth = 2;
		drawShareRoundedRect(context, x, y, width, height, radius);
		context.stroke();
	}
}

async function createHomeShareImage(meeting, formatDate, meetingMovies) {
	if (!meeting) throw new Error('Non c’è una serata in programma da condividere.');
	await Promise.all([
		document.fonts?.ready,
		document.fonts?.load('400 96px Spectral'),
		document.fonts?.load('600 32px Montserrat'),
		document.fonts?.load('700 22px Montserrat')
	]);
	const palette = sharePalette();
	const listedMovies = meetingMovies(meeting);
	const movies = listedMovies.length ? listedMovies : [{ title: 'Film da definire', year: '', director: '' }];
	const [posters, logo] = await Promise.all([Promise.all(movies.map(loadSharePoster)), loadShareLogo()]);
	const icons = { event: shareIconPaths('event'), place: shareIconPaths('place') };
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Il browser non supporta la creazione dell’immagine.');

	const width = 1080;
	const margin = 72;
	const contentWidth = width - margin * 2;
	const posterWidth = 168;
	const posterHeight = 240;
	const cardPadding = 12;
	const textX = margin + cardPadding + posterWidth + 36;
	const textWidth = width - margin - 36 - textX;

	// Misure: intestazione, barra data/luogo e card dei film, per calcolare l'altezza dell'immagine.
	context.textBaseline = 'top';
	const headerTop = 64;
	const titleTop = headerTop + 150;
	const dividerY = titleTop + 112;
	const metaTop = dividerY + 48;
	const iconSpace = icons.event && icons.place ? 52 : 0;
	const columnWidth = (contentWidth - 64 - 40) / 2 - iconSpace;
	setShareFont(context, '600 32px Montserrat, sans-serif');
	const dateLines = wrapShareText(context, formatDate(meeting.date) || 'Data da definire', columnWidth);
	const placeLines = wrapShareText(context, meeting.place || 'Luogo da definire', columnWidth);
	const metaHeight = 56 + Math.max(dateLines.length, placeLines.length) * 42;
	const sectionTop = metaTop + metaHeight + 56;
	const rowsTop = sectionTop + 48;
	const rows = movies.map(movie => {
		setShareFont(context, '400 54px Spectral, serif');
		const titleText = `${movie.title || 'Film da definire'}${movie.year ? ` (${movie.year})` : ''}`;
		const titleLines = wrapShareText(context, titleText, textWidth);
		setShareFont(context, '500 30px Montserrat, sans-serif');
		const directorLines = wrapShareText(context, movie.director || 'Regista non indicato', textWidth);
		const textHeight = titleLines.length * 62 + 14 + directorLines.length * 40;
		return { titleLines, directorLines, textHeight, height: Math.max(posterHeight + cardPadding * 2, textHeight + 56) };
	});
	const rowGap = 24;
	const rowsHeight = rows.reduce((total, row) => total + row.height, 0) + rowGap * (rows.length - 1);
	const footerHeight = 120;
	// Almeno 4:5, il formato verticale più comodo da condividere; il piè di pagina resta in fondo.
	canvas.width = width;
	canvas.height = Math.max(1350, rowsTop + rowsHeight + 64 + footerHeight);
	context.textBaseline = 'top';

	drawShareBackground(context, palette, canvas.width, canvas.height);

	// Intestazione: logo, sopratitolo e titolo come in cima alle pagine del sito.
	if (logo) context.drawImage(logo, margin, headerTop, 84, 82);
	const eyebrowY = headerTop + 112;
	context.fillStyle = palette.apricot;
	context.fillRect(margin, eyebrowY + 9, 34, 3);
	context.fillStyle = palette.rust;
	setShareFont(context, '700 20px Montserrat, sans-serif', 3);
	context.fillText('MYCIMMENA', margin + 48, eyebrowY);
	context.fillStyle = palette.ink;
	setShareFont(context, '400 88px Spectral, serif');
	context.fillText('La prossima serata', margin - 4, titleTop);
	context.fillStyle = palette.line;
	context.fillRect(margin, dividerY, contentWidth, 2);

	// Barra data e luogo, con le stesse icone della Home.
	drawShareCard(context, palette, margin, metaTop, contentWidth, metaHeight, 22, true);
	const columns = [['event', dateLines, margin + 32], ['place', placeLines, margin + 32 + (contentWidth - 64) / 2 + 20]];
	for (const [glyph, lines, x] of columns) {
		if (iconSpace) {
			context.fillStyle = palette.icon;
			drawShareIcon(context, icons[glyph], x, metaTop + 24, 40);
		}
		context.fillStyle = palette.ink;
		setShareFont(context, '600 32px Montserrat, sans-serif');
		drawShareText(context, lines, x + iconSpace, metaTop + 28, 42);
	}

	// Elenco dei film: card con locandina, titolo e anno in Spectral, regista sotto.
	context.fillStyle = palette.rust;
	setShareFont(context, '700 20px Montserrat, sans-serif', 3);
	context.fillText(`${movies.length === 1 ? 'IL FILM' : 'I FILM'} DELLA SERATA · ${movies.length}`, margin, sectionTop);
	let rowTop = rowsTop;
	rows.forEach((row, index) => {
		drawShareCard(context, palette, margin, rowTop, contentWidth, row.height, 26);
		drawSharePoster(context, palette, posters[index], margin + cardPadding, rowTop + (row.height - posterHeight) / 2, posterWidth, posterHeight);
		const textTop = rowTop + (row.height - row.textHeight) / 2;
		context.textAlign = 'left';
		context.textBaseline = 'top';
		context.fillStyle = palette.ink;
		setShareFont(context, '400 54px Spectral, serif');
		drawShareText(context, row.titleLines, textX, textTop, 62);
		context.fillStyle = palette.muted;
		setShareFont(context, '500 30px Montserrat, sans-serif');
		drawShareText(context, row.directorLines, textX, textTop + row.titleLines.length * 62 + 14, 40);
		rowTop += row.height + rowGap;
	});

	// Piè di pagina come quello del sito: filetto e testo maiuscoletto.
	const footerY = canvas.height - footerHeight + 40;
	context.fillStyle = palette.line;
	context.fillRect(margin, footerY, contentWidth, 2);
	context.fillStyle = palette.muted;
	setShareFont(context, '700 18px Montserrat, sans-serif', 3);
	context.fillText('CLUB DEL CIMMENA', margin, footerY + 30);
	const year = String(meeting.date || '').slice(0, 4) || String(new Date().getFullYear());
	context.textAlign = 'right';
	context.fillText(year, width - margin, footerY + 30);
	context.textAlign = 'left';
	return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Impossibile creare la locandina.')), 'image/png'));
}

// Restituisce l'esito ('shared', 'downloaded', 'cancelled') per i toast; in caso di errore rilancia l'eccezione.
export async function shareHome(meeting, formatDate, meetingMovies) {
	const button = document.getElementById('share-home');
	if (!button || !meeting || button.disabled) return null;
	button.disabled = true;
	try {
		let blob;
		try {
			blob = await createHomeShareImage(meeting, formatDate, meetingMovies);
		} catch (error) {
			throw new Error(error.message || 'Non è stato possibile preparare l’immagine da condividere.');
		}
		const fileName = 'prossima-serata.png';
		const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
		if (file && navigator.canShare && navigator.share) {
			try {
				if (navigator.canShare({ files: [file] })) {
					await navigator.share({ title: 'La prossima serata', files: [file] });
					return 'shared';
				}
			} catch (error) {
				if (error.name === 'AbortError') return 'cancelled';
			}
		}
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName;
		link.hidden = true;
		document.body.append(link);
		link.click();
		link.remove();
		window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
		return 'downloaded';
	} finally {
		button.disabled = false;
	}
}
