// Tema dalla locandina del film del cuore: dai pixel della locandina (rimpicciolita) si ricavano un colore di accento e
// uno secondario, e da questi le palette chiara e scura dell'app. Solo funzioni pure, senza DOM: si provano da sole.
// I colori si calcolano in OKLCH (luminosità, croma, tinta), così luminosità e contrasto restano quelli giusti
// qualunque sia la tinta; alla fine si riportano in sRGB esadecimale, riducendo il croma se il colore non ci sta.

// --- Conversioni sRGB ⇄ OKLab ⇄ OKLCH -------------------------------------------------------------------------
const toLinear = value => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const toGamma = value => (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);

export function rgbToOklch([r, g, b]) {
	const [lr, lg, lb] = [r, g, b].map(value => toLinear(value / 255));
	const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
	const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
	const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
	const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
	const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
	const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
	const C = Math.hypot(a, bb);
	const H = (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360;
	return { L, C, H };
}

function oklchToLinear({ L, C, H }) {
	const a = C * Math.cos(H * Math.PI / 180);
	const b = C * Math.sin(H * Math.PI / 180);
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
	];
}

const inGamut = linear => linear.every(value => value >= -0.0001 && value <= 1.0001);

// Colore OKLCH → "#rrggbb": se esce dallo spazio sRGB si riduce il croma (la tinta e la luminosità restano).
export function oklchToHex({ L, C, H }) {
	let chroma = C;
	let linear = oklchToLinear({ L, C: chroma, H });
	while (!inGamut(linear) && chroma > 0) {
		chroma = Math.max(0, chroma - 0.005);
		linear = oklchToLinear({ L, C: chroma, H });
	}
	return `#${linear.map(value => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, value))))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex) {
	const value = parseInt(hex.slice(1), 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// Contrasto WCAG fra due colori esadecimali (da 1 a 21).
export function contrast(first, second) {
	const luminance = hex => {
		const [r, g, b] = hexToRgb(hex).map(value => toLinear(value / 255));
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const [a, b] = [luminance(first), luminance(second)].sort((x, y) => y - x);
	return (a + 0.05) / (b + 0.05);
}

// --- Colori della locandina -----------------------------------------------------------------------------------
const HUE_BINS = 24;
const MIN_CHROMA = 0.03;
// Quote minime della locandina: l'accento basta che si veda (1%, come un titolo), il secondario deve spiccare (1,5%,
// come il pesce blu di Sonatine).
const ACCENT_MIN_SHARE = 0.01;
const SECONDARY_MIN_SHARE = 0.015;
const SECONDARY_MIN_DISTANCE = 60;
// Luminosità a cui l'accento si usa davvero nel tema chiaro (scuro, per stare sulla carta): "acceso" si misura lì.
const ACCENT_LIGHTNESS = 0.5;
const hueDistance = (first, second) => Math.min(Math.abs(first - second), 360 - Math.abs(first - second));
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

// Croma massimo che una tinta può avere a una certa luminosità restando in sRGB (i gialli scuri diventano oliva).
export function maxChroma(L, H) {
	let low = 0;
	let high = 0.4;
	for (let i = 0; i < 20; i += 1) {
		const mid = (low + high) / 2;
		if (inGamut(oklchToLinear({ L, C: mid, H }))) low = mid;
		else high = mid;
	}
	return low;
}

// `pixels`: [r, g, b, r, g, b, …] della locandina rimpicciolita. Raggruppa i pixel colorati per tinta (quasi neri,
// quasi bianchi e grigi non contano) e sceglie:
// - accento: il colore più acceso fra quelli presenti almeno per l'1%, misurato come resterebbe da accento (a parità,
//   entro il 10%, il più presente);
// - secondario: fra i colori che spiccano (almeno 1,5%, abbastanza colorati) e sono lontani dall'accento sulla ruota
//   dei colori, il più acceso e presente. Se non c'è, il tema userà una tinta vicina all'accento.
// { accent: { H, C } | null, secondary: { H, C } | null, bins: [{ H, C, share, vivid }] }
export function posterColors(pixels) {
	const total = Math.max(1, Math.floor(pixels.length / 3));
	const bins = Array.from({ length: HUE_BINS }, () => ({ count: 0, x: 0, y: 0, chromas: [] }));
	for (let index = 0; index + 2 < pixels.length; index += 3) {
		const color = rgbToOklch([pixels[index], pixels[index + 1], pixels[index + 2]]);
		if (color.L < 0.12 || color.L > 0.97 || color.C < MIN_CHROMA) continue;
		const bin = bins[Math.floor(color.H / (360 / HUE_BINS)) % HUE_BINS];
		bin.count += 1;
		bin.x += Math.cos(color.H * Math.PI / 180) * color.C;
		bin.y += Math.sin(color.H * Math.PI / 180) * color.C;
		bin.chromas.push(color.C);
	}
	const ranked = bins.filter(bin => bin.count).map(bin => {
		const H = (Math.atan2(bin.y, bin.x) * 180 / Math.PI + 360) % 360;
		const sorted = bin.chromas.sort((a, b) => a - b);
		const C = percentile(sorted, 0.9);
		return { H, C, median: percentile(sorted, 0.5), share: bin.count / total, vivid: Math.min(C, maxChroma(ACCENT_LIGHTNESS, H)) };
	}).sort((first, second) => second.share - first.share);
	const colorful = ranked.reduce((sum, bin) => sum + bin.share, 0);
	// Locandina in bianco e nero (o quasi): niente accento, resta il tema dell'app.
	const candidates = ranked.filter(bin => bin.share >= ACCENT_MIN_SHARE && bin.median >= 0.04);
	if (colorful < 0.03 || !candidates.length) return { accent: null, secondary: null, bins: ranked };
	const best = Math.max(...candidates.map(bin => bin.vivid));
	const accent = candidates.filter(bin => bin.vivid >= best * 0.9).sort((first, second) => second.share - first.share)[0];
	const secondary = ranked
		.filter(bin => bin !== accent && bin.share >= SECONDARY_MIN_SHARE && bin.median >= 0.05 && hueDistance(bin.H, accent.H) >= SECONDARY_MIN_DISTANCE)
		.sort((first, second) => second.vivid * Math.sqrt(second.share) - first.vivid * Math.sqrt(first.share))[0] || null;
	return { accent: { H: accent.H, C: accent.C }, secondary: secondary ? { H: secondary.H, C: secondary.C } : null, bins: ranked };
}

// --- Palette ---------------------------------------------------------------------------------------------------
// Luminosità più alta (chiaro) o più bassa (scuro) che dà almeno `ratio` di contrasto con lo sfondo.
function readableLightness({ C, H }, background, ratio, from, step) {
	let L = from;
	for (let i = 0; i < 60 && contrast(oklchToHex({ L, C, H }), background) < ratio; i += 1) L += step;
	return L;
}

const rgba = (hex, alpha) => `rgba(${hexToRgb(hex).join(', ')}, ${alpha})`;

// Cerchi e onda dello sfondo (le stesse forme di style.css) con i colori del tema, come url("data:…") per il CSS.
const svgUrl = svg => `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`;
export function decorations({ rust, apricot, clay }) {
	return {
		'--deco-circles': svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420'><circle cx='210' cy='210' r='160' fill='none' stroke='${rust}' stroke-opacity='.07' stroke-width='2'/><circle cx='210' cy='210' r='108' fill='none' stroke='${apricot}' stroke-opacity='.12' stroke-width='2'/></svg>`),
		'--deco-wave': svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='640' height='220'><path d='M0 110 Q 80 50 160 110 T 320 110 T 480 110 T 640 110' fill='none' stroke='${clay}' stroke-opacity='.1' stroke-width='3'/></svg>`)
	};
}

// Le variabili CSS del tema ("day" o "night") per un accento { H, C } e un secondario facoltativo (altrimenti una
// tinta vicina all'accento). I neutri prendono appena la tinta dell'accento, come oggi prendono il rosso.
export function posterPalette({ accent, secondary = null }, mode = 'day') {
	const H = accent.H;
	const C = Math.min(Math.max(accent.C, 0.09), 0.17);
	const second = secondary || { H: (H + 35) % 360, C: 0.13 };
	const night = mode === 'night';
	const paper = oklchToHex(night ? { L: 0.17, C: 0.012, H } : { L: 0.965, C: 0.012, H });
	const surface = oklchToHex(night ? { L: 0.215, C: 0.016, H } : { L: 0.995, C: 0.003, H });
	const surfaceStrong = oklchToHex(night ? { L: 0.255, C: 0.018, H } : { L: 1, C: 0, H });
	const ink = oklchToHex(night ? { L: 0.94, C: 0.014, H } : { L: 0.22, C: 0.04, H });
	const muted = oklchToHex(night ? { L: 0.76, C: 0.025, H } : { L: 0.48, C: 0.045, H });
	const clay = oklchToHex(night ? { L: 0.76, C: 0.05, H } : { L: 0.56, C: 0.06, H });
	// Accento: nel chiaro scuro abbastanza per il testo sulla carta (4,5:1), nello scuro chiaro abbastanza.
	const accentL = night
		? readableLightness({ C: Math.min(C, 0.14), H }, paper, 6, 0.72, 0.01)
		: readableLightness({ C, H }, paper, 6, 0.5, -0.01);
	const rust = oklchToHex({ L: accentL, C: night ? Math.min(C, 0.14) : C, H });
	const apricot = oklchToHex({ L: night ? 0.8 : 0.78, C: Math.min(Math.max(second.C, 0.1), 0.15), H: second.H });
	const shadow = night ? '0, 0, 0' : hexToRgb(ink).join(', ');
	return {
		'--paper': paper,
		'--ink': ink,
		'--clay': clay,
		'--rust': rust,
		'--apricot': apricot,
		'--icon-color': rust,
		'--icon-color-light': paper,
		'--line': rgba(ink, night ? 0.14 : 0.12),
		'--muted': muted,
		'--surface': surface,
		'--surface-strong': surfaceStrong,
		'--header-glass': rgba(paper, night ? 0.82 : 0.75),
		'--menu-glass': rgba(surface, night ? 0.96 : 0.88),
		'--accent-wash': rgba(apricot, 0.16),
		'--accent-wash-strong': rgba(apricot, 0.22),
		'--accent-wash-hover': rgba(apricot, 0.18),
		'--accent-focus': rgba(apricot, 0.3),
		'--accent-border': rgba(apricot, 0.5),
		'--clay-wash': rgba(clay, 0.16),
		'--clay-wash-subtle': rgba(clay, 0.14),
		'--rust-wash': rgba(rust, night ? 0.1 : 0.08),
		'--page-dot': rgba(night ? apricot : rust, 0.045),
		'--touch-shadow': night ? 'rgba(0, 0, 0, .28)' : rgba(ink, 0.08),
		'--loader-fill': oklchToHex({ L: night ? 0.5 : 0.4, C: Math.min(C, 0.14), H }),
		'--loader-accent': apricot,
		'--shadow-sm': `0 1px 2px rgba(${shadow}, ${night ? 0.2 : 0.05}), 0 10px 24px -16px rgba(${shadow}, ${night ? 0.55 : 0.3})`,
		'--shadow-md': `0 18px 36px -18px rgba(${shadow}, ${night ? 0.6 : 0.32})`,
		'--shadow-lift': `0 26px 52px -20px rgba(${shadow}, ${night ? 0.7 : 0.38})`,
		...decorations({ rust, apricot, clay })
	};
}
