// Colori dal film del cuore: scelta di accento e secondario dalla locandina e palette leggibili, giorno e notte.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { contrast, decorations, maxChroma, oklchToHex, posterColors, posterPalette, rgbToOklch } from '../www/assets/js/poster-theme.js';
import { themeForPixels } from '../www/assets/js/poster-theme-ui.js';

// Locandina finta: `parts` = [[r, g, b], quota] in ordine, su 48 × 72 pixel; il resto nero.
function poster(parts) {
	const total = 48 * 72;
	const pixels = [];
	for (const [rgb, share] of parts) for (let i = 0; i < Math.round(total * share); i += 1) pixels.push(...rgb);
	while (pixels.length < total * 3) pixels.push(5, 5, 5);
	return pixels;
}
const hueOf = hex => rgbToOklch([parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]).H;
const near = (hue, target, tolerance = 25) => Math.min(Math.abs(hue - target), 360 - Math.abs(hue - target)) <= tolerance;

test('converts colors to OKLCH and back without drifting', () => {
	for (const hex of ['#8a1f2d', '#eaa83f', '#2a5f8a', '#5c600b']) {
		assert.equal(oklchToHex(rgbToOklch([parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)])), hex);
	}
	assert.ok(maxChroma(0.5, 25) > maxChroma(0.5, 110), 'un rosso scuro può essere più acceso di un giallo scuro');
});

test('takes the red as accent and the small but striking blue as secondary (Sonatine)', () => {
	const sonatine = poster([[[200, 30, 25], 0.4], [[50, 80, 170], 0.05], [[240, 240, 240], 0.2]]);
	const { accent, secondary } = posterColors(sonatine);
	assert.ok(near(accent.H, 28), `accento rosso, non ${accent.H}`);
	assert.ok(secondary && near(secondary.H, 265, 30), 'il blu del pesce entra come secondario');
	const day = posterPalette({ accent, secondary }, 'day');
	assert.ok(near(hueOf(day['--apricot']), secondary.H, 30), 'il secondario prende il posto dell’ambra');
});

test('lets the most vivid color win over a larger dull one (Blade Runner)', () => {
	const bladeRunner = poster([[[190, 200, 60], 0.2], [[215, 40, 30], 0.02]]);
	const { accent, secondary } = posterColors(bladeRunner);
	assert.ok(near(accent.H, 30), 'vince il rosso del titolo, non il giallo-verde dei neon');
	assert.ok(secondary && near(secondary.H, 110, 30), 'il giallo-verde resta come secondario');
});

test('keeps the app colors for a black and white poster (Get Out)', () => {
	const getOut = poster([[[240, 240, 240], 0.5], [[120, 120, 120], 0.3]]);
	assert.deepEqual([posterColors(getOut).accent, posterColors(getOut).secondary], [null, null]);
	assert.deepEqual(themeForPixels('tt5052448', getOut), { v: 1, movieId: 'tt5052448', none: true });
});

test('builds readable day and night palettes, decorations included, for any accent', () => {
	for (const H of [0, 30, 60, 110, 150, 200, 250, 300]) {
		for (const C of [0.05, 0.12, 0.25]) {
			const day = posterPalette({ accent: { H, C } }, 'day');
			const night = posterPalette({ accent: { H, C } }, 'night');
			assert.ok(contrast(day['--rust'], day['--paper']) >= 4.5, `accento giorno H${H} C${C}`);
			assert.ok(contrast(night['--rust'], night['--paper']) >= 4.5, `accento notte H${H} C${C}`);
			assert.ok(contrast(day['--ink'], day['--paper']) >= 12 && contrast(night['--ink'], night['--paper']) >= 12, 'testo');
			assert.ok(contrast(day['--muted'], day['--paper']) >= 4.5 && contrast(night['--muted'], night['--paper']) >= 4.5, 'testo secondario');
		}
	}
	const palette = posterPalette({ accent: { H: 28, C: 0.18 }, secondary: { H: 250, C: 0.1 } }, 'day');
	assert.match(palette['--deco-circles'], /^url\("data:image\/svg\+xml,.*%23[0-9a-f]{6}/);
	assert.equal(decorations({ rust: '#aa2726', apricot: '#83bdf4', clay: '#8c6a6a' })['--deco-wave'].includes('%238c6a6a'), true);
});

test('applies the saved palette before the first paint and follows day and night', () => {
	const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
	assert.match(read('../www/assets/js/boot.js'), /localStorage\.getItem\('mycimmena-poster-theme'\)/);
	assert.match(read('../www/assets/js/theme.js'), /new CustomEvent\('colormodechange'/);
	assert.match(read('../www/style.css'), /background-image:\s*var\(--deco-circles\),\s*var\(--deco-wave\),/);
	assert.match(read('../www/assets/js/views.js'), /data-poster-theme-switch>/);
});

test('binds the settings switch to the button only, never to the page that carries the poster theme', () => {
	const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
	// L'attributo sulla pagina e quello dell'interruttore si chiamavano uguali: il gestore finiva su <html> e ogni
	// tocco, ovunque, riaccendeva i colori (con un toast a raffica e la pagina ridisegnata di continuo).
	const script = read('../www/script.js');
	assert.match(script, /document\.querySelector\('button\[data-poster-theme-switch\]'\)/);
	assert.doesNotMatch(script, /querySelector\('\[data-poster-theme\]'\)/);
	for (const file of ['../www/assets/js/boot.js', '../www/assets/js/poster-theme-ui.js']) {
		assert.doesNotMatch(read(file), /dataset\.posterTheme\b(?!Movie)/, file);
	}
});
