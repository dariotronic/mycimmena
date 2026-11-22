// Profilo dell'utente (PIANO.md, §4 e §18): nome, compleanno e le risposte di "Due chiacchiere".
// Le scelte stanno qui, così onboarding, Impostazioni e diario usano le stesse parole.

export const PLACES = Object.freeze([
	{ value: 'divano', label: 'Divano', diary: 'Divano' },
	{ value: 'letto', label: 'Letto', diary: 'Letto' },
	{ value: 'cinema', label: 'Cinema', diary: 'Cinema' },
	{ value: 'computer', label: 'Computer', diary: 'Computer' },
	{ value: 'telefono', label: 'In giro col telefono', diary: 'Telefono' }
]);
export const COMPANY = Object.freeze([
	{ value: 'solo', label: 'Da solo', diary: '' },
	{ value: 'coppia', label: 'In coppia', diary: 'la mia metà' },
	{ value: 'amici', label: 'Con gli amici', diary: 'gli amici' },
	{ value: 'famiglia', label: 'In famiglia', diary: 'la famiglia' },
	{ value: 'dipende', label: 'Dipende', diary: '' }
]);
export const POPCORN = Object.freeze([
	{ value: 'dolci', label: 'Dolci', emoji: '🍬' },
	{ value: 'salati', label: 'Salati', emoji: '🍿' },
	{ value: 'misti', label: 'Misti', emoji: '🍿🍬' },
	{ value: 'niente', label: 'Niente popcorn', emoji: '🚫' }
]);
export const LANGUAGES = Object.freeze([
	{ value: 'doppiato', label: 'Doppiato', title: 'fan del doppiaggio' },
	{ value: 'sottotitoli', label: 'Sottotitoli', title: 'amante dei sottotitoli' },
	{ value: 'originale', label: 'Lingua originale pura', title: 'purista della lingua originale' }
]);
export const SPECTATORS = Object.freeze([
	{ value: 'titoli', label: 'Arrivo ai titoli di coda' },
	{ value: 'sonno', label: 'Mi addormento al secondo tempo' },
	{ value: 'commento', label: 'Commento tutto' },
	{ value: 'silenzio', label: 'Guai a chi parla' }
]);

const find = (list, value) => list.find(item => item.value === value) || null;
export const optionLabel = (list, value) => find(list, value)?.label || '';

// Valori proposti nel modulo di una visione nuova ("Dove" e "Con chi"), dalle risposte dell'onboarding.
// "Con chi" si legge dopo "con" nel diario: "Divano · con la mia metà".
export const diaryDefaults = profile => ({
	place: find(PLACES, profile?.place)?.diary || '',
	withWhom: find(COMPANY, profile?.company)?.diary || ''
});

// Riga sotto il nome nelle Impostazioni: "Purista della lingua originale · Commento tutto · 🍿".
export function flavourLine(profile) {
	const parts = [
		find(LANGUAGES, profile?.language)?.title,
		optionLabel(SPECTATORS, profile?.spectator),
		find(POPCORN, profile?.popcorn)?.emoji
	].filter(Boolean);
	const line = parts.join(' · ');
	return line ? line[0].toUpperCase() + line.slice(1) : '';
}

// Oggi è il compleanno? `birthday` è "AAAA-MM-GG" (l'anno conta solo per l'età, che l'app non mostra).
export const isBirthday = (birthday, todayDate) => Boolean(birthday) && birthday.slice(5) === String(todayDate).slice(5);
