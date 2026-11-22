// Suoni da slot machine per il Randomizer, sintetizzati con Web Audio (nessun file da scaricare):
// leva tirata alla partenza, un clic meccanico a ogni scatto dei rulli, il colpo del rullo che si ferma e il jingle
// della vincita con le monete. Si possono spegnere dal pulsante con l'altoparlante (scelta salvata sul dispositivo).
const SOUND_KEY = 'mycimmena-randomizer-sound';

let context = null;
let master = null;

// L'AudioContext nasce al primo uso, che è sempre il tocco su "Scegli": i browser lo consentono solo dopo un gesto.
function audio() {
	const AudioContextClass = window.AudioContext || window.webkitAudioContext;
	if (!AudioContextClass) return null;
	if (!context) {
		context = new AudioContextClass();
		master = context.createGain();
		master.gain.value = 0.5;
		master.connect(context.destination);
	}
	if (context.state === 'suspended') context.resume();
	return context;
}

export function soundEnabled() {
	try {
		return localStorage.getItem(SOUND_KEY) !== 'off';
	} catch {
		return true;
	}
}
export function setSoundEnabled(enabled) {
	try {
		localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
	} catch {
		// Storage non disponibile: la scelta non si può salvare e i suoni restano accesi.
	}
}

// Nota con inviluppo: attacco rapido e decadimento esponenziale.
function tone(ctx, { type = 'sine', frequency, start = 0, duration = 0.2, volume = 0.3, slideTo = null }) {
	const time = ctx.currentTime + start;
	const oscillator = ctx.createOscillator();
	const gain = ctx.createGain();
	oscillator.type = type;
	oscillator.frequency.setValueAtTime(frequency, time);
	if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, time + duration);
	gain.gain.setValueAtTime(0.0001, time);
	gain.gain.exponentialRampToValueAtTime(volume, time + 0.005);
	gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
	oscillator.connect(gain).connect(master);
	oscillator.start(time);
	oscillator.stop(time + duration + 0.02);
}

// Rumore filtrato: la parte "meccanica" di clic e colpi.
function noise(ctx, { start = 0, duration = 0.03, volume = 0.3, frequency = 2500, q = 1.5 }) {
	const time = ctx.currentTime + start;
	const length = Math.ceil(ctx.sampleRate * duration);
	const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
	const samples = buffer.getChannelData(0);
	for (let index = 0; index < length; index++) samples[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 2;
	const source = ctx.createBufferSource();
	const filter = ctx.createBiquadFilter();
	const gain = ctx.createGain();
	source.buffer = buffer;
	filter.type = 'bandpass';
	filter.frequency.value = frequency;
	filter.Q.value = q;
	gain.gain.value = volume;
	source.connect(filter).connect(gain).connect(master);
	source.start(time);
}

function play(sound) {
	if (!soundEnabled()) return;
	const ctx = audio();
	if (ctx) sound(ctx);
}

// Leva tirata: cricchetto che scende e un tonfo.
export const playLever = () => play(ctx => {
	for (let index = 0; index < 5; index++) noise(ctx, { start: index * 0.035, duration: 0.02, volume: 0.25, frequency: 1800 - index * 200 });
	tone(ctx, { type: 'sine', frequency: 140, slideTo: 60, start: 0.18, duration: 0.18, volume: 0.5 });
	noise(ctx, { start: 0.18, duration: 0.06, volume: 0.3, frequency: 400, q: 0.8 });
});

// Scatto dei rulli: clic secco con un accenno di tono, leggermente diverso ogni volta.
export const playTick = () => play(ctx => {
	noise(ctx, { duration: 0.025, volume: 0.35, frequency: 2600 + Math.random() * 800, q: 2 });
	tone(ctx, { type: 'square', frequency: 900 + Math.random() * 200, duration: 0.03, volume: 0.04 });
});

// Il rullo si blocca sul film estratto.
export const playStop = () => play(ctx => {
	tone(ctx, { type: 'sine', frequency: 180, slideTo: 70, duration: 0.22, volume: 0.6 });
	noise(ctx, { duration: 0.08, volume: 0.4, frequency: 700, q: 0.7 });
});

// Vincita: arpeggio in Do maggiore, accordo finale e pioggia di monete.
export const playWin = () => play(ctx => {
	const arpeggio = [523.25, 659.25, 783.99, 1046.5, 1318.5];
	arpeggio.forEach((frequency, index) => {
		tone(ctx, { type: 'square', frequency, start: 0.12 + index * 0.09, duration: 0.18, volume: 0.07 });
		tone(ctx, { type: 'triangle', frequency, start: 0.12 + index * 0.09, duration: 0.3, volume: 0.15 });
	});
	[1046.5, 1318.5, 1568].forEach(frequency => tone(ctx, { type: 'triangle', frequency, start: 0.6, duration: 0.8, volume: 0.12 }));
	for (let index = 0; index < 9; index++) {
		const start = 0.65 + index * 0.07 + Math.random() * 0.03;
		const frequency = 2400 + Math.random() * 1600;
		tone(ctx, { type: 'sine', frequency, start, duration: 0.12, volume: 0.06 });
		tone(ctx, { type: 'sine', frequency: frequency * 1.5, start, duration: 0.08, volume: 0.03 });
	}
});
