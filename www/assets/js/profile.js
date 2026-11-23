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

// Compleanno: si chiedono solo giorno e mese ("MM-GG"); i profili salvati prima hanno ancora "AAAA-MM-GG".
// L'anno non serve: l'app fa gli auguri, non conta gli anni.
export const MONTHS = Object.freeze(['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']);
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// "MM-GG" da un compleanno salvato in uno dei due formati, o '' se manca o non è valido.
export function birthdayMonthDay(value) {
	const match = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(String(value || ''));
	if (!match) return '';
	const month = Number(match[1]);
	const day = Number(match[2]);
	return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1] ? `${match[1]}-${match[2]}` : '';
}

// Dai due menu "Giorno" e "Mese" al valore da salvare: "MM-GG", o '' se ne manca uno (o il giorno non esiste).
export function birthdayFromParts(day, month) {
	const d = Number(day);
	const m = Number(month);
	if (!(m >= 1 && m <= 12 && d >= 1)) return '';
	return birthdayMonthDay(`${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
}

// I due menu del compleanno (onboarding e Impostazioni). `id` è il prefisso degli id dei campi.
export function birthdayFields(id, value) {
	const monthDay = birthdayMonthDay(value);
	const [month, day] = monthDay ? monthDay.split('-').map(Number) : [0, 0];
	return `
		<div class="birthday-fields">
			<select id="${id}-day" name="birthdayDay" aria-label="Giorno del compleanno">
				<option value="">Giorno</option>
				${Array.from({ length: 31 }, (_, index) => `<option value="${index + 1}"${index + 1 === day ? ' selected' : ''}>${index + 1}</option>`).join('')}
			</select>
			<select id="${id}-month" name="birthdayMonth" aria-label="Mese del compleanno">
				<option value="">Mese</option>
				${MONTHS.map((name, index) => `<option value="${index + 1}"${index + 1 === month ? ' selected' : ''}>${name}</option>`).join('')}
			</select>
		</div>
	`;
}

// Valori di un modulo del profilo: i due menu del compleanno diventano `birthday`.
export function profileValues(values) {
	if (!('birthdayDay' in values) && !('birthdayMonth' in values)) return values;
	const { birthdayDay, birthdayMonth, ...rest } = values;
	return { ...rest, birthday: birthdayFromParts(birthdayDay, birthdayMonth) };
}

// Oggi è il compleanno?
export const isBirthday = (birthday, todayDate) => Boolean(birthdayMonthDay(birthday)) && birthdayMonthDay(birthday) === String(todayDate).slice(5);
