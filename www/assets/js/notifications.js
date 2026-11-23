// Notifiche locali (PIANO.md, §12): auguri alle 9 del giorno del compleanno e promemoria alle 9 del giorno della
// serata in programma. Niente server: le programma Android con @capacitor/local-notifications.
//
// Ogni volta che i dati cambiano si ricalcola cosa programmare (plannedNotifications) e, se è diverso da prima,
// si cancellano le due notifiche e si riprogrammano. Il compleanno si programma per la prossima data precisa:
// all'apertura successiva dell'app si passa all'anno dopo. Il permesso (Android 13+) si chiede solo dopo
// un'azione dell'utente: compleanno salvato, serata salvata, interruttore acceso.
import { movieName } from './domain.js';
import { birthdayMonthDay } from './profile.js';

export const NOTIFICATION_IDS = Object.freeze({ birthday: 1001, evening: 1002 });
const HOUR = 9;

// Data e ora locali "AAAA-MM-GG" alle 9:00.
const nineOn = date => {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(year, month - 1, day, HOUR, 0, 0, 0);
};

// Prossimo compleanno alle 9 (oggi se non sono ancora le 9). Il 29 febbraio, negli anni non bisestili, è il 28.
export function nextBirthday(birthday, now = new Date()) {
	const monthDay = birthdayMonthDay(birthday);
	if (!monthDay) return null;
	const [month, day] = monthDay.split('-').map(Number);
	for (let year = now.getFullYear(); year <= now.getFullYear() + 1; year += 1) {
		const lastDay = new Date(year, month, 0).getDate();
		const at = new Date(year, month - 1, Math.min(day, lastDay), HOUR, 0, 0, 0);
		if (at > now) return at;
	}
	return null;
}

// Le notifiche da programmare con i dati attuali (app-data.js): [{ id, title, body, at }].
export function plannedNotifications(data, now = new Date()) {
	const settings = data?.settings || {};
	const list = [];
	const name = data?.profile?.name;
	const birthday = settings.notifyBirthday === false ? null : nextBirthday(data?.profile?.birthday, now);
	if (birthday) {
		list.push({
			id: NOTIFICATION_IDS.birthday,
			title: `🎂 Buon compleanno${name ? `, ${name}` : ''}!`,
			body: data.favorite ? `Per festeggiare: ${movieName(data.favorite)}?` : 'Tanti auguri da myCimmena.',
			at: birthday
		});
	}
	const evening = data?.upcoming;
	if (settings.notifyEvening !== false && evening?.date && evening.movies?.length) {
		const at = nineOn(evening.date);
		if (at > now) {
			const titles = evening.movies.map(movie => movie.title);
			list.push({
				id: NOTIFICATION_IDS.evening,
				title: `🍿 Stasera: ${titles.length > 2 ? `${titles.slice(0, 2).join(', ')} e altri ${titles.length - 2}` : titles.join(' e ')}`,
				body: evening.place ? `Serata in programma: ${evening.place}.` : 'C’è una serata in programma.',
				at
			});
		}
	}
	return list;
}

// Stato del permesso: 'granted' | 'denied' | 'prompt' | 'unavailable' (fuori dall'app Android).
export function createNotifications({ getData, plugin = () => globalThis.Capacitor?.isNativePlatform?.() ? globalThis.Capacitor.Plugins.LocalNotifications : null, now = () => new Date() }) {
	let lastSignature = null;
	let running = Promise.resolve();

	async function permission() {
		const api = plugin();
		if (!api) return 'unavailable';
		const { display } = await api.checkPermissions();
		return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
	}

	async function apply({ ask }) {
		const api = plugin();
		if (!api) return 'unavailable';
		const list = plannedNotifications(getData(), now());
		const signature = JSON.stringify(list);
		let state = await permission();
		if (state !== 'granted' && ask && list.length) {
			const { display } = await api.requestPermissions();
			state = display === 'granted' ? 'granted' : 'denied';
		}
		if (state !== 'granted') {
			lastSignature = null;
			return state;
		}
		if (signature === lastSignature) return state;
		await api.cancel({ notifications: Object.values(NOTIFICATION_IDS).map(id => ({ id })) });
		if (list.length) {
			await api.schedule({
				notifications: list.map(item => ({
					id: item.id,
					title: item.title,
					body: item.body,
					schedule: { at: item.at, allowWhileIdle: true },
					// Non serve l'ora esatta al secondo: senza, Android non chiede il permesso delle sveglie esatte.
					isExactNotification: false,
					smallIcon: 'ic_stat_mycimmena',
					iconColor: '#8a1f2d'
				}))
			});
		}
		lastSignature = signature;
		return state;
	}

	// ask: true solo dopo un'azione dell'utente. Le chiamate si mettono in fila.
	function sync({ ask = false } = {}) {
		running = running.catch(() => {}).then(() => apply({ ask }));
		return running.catch(error => {
			console.warn('Notifiche non programmate.', error);
			return 'error';
		});
	}

	return { sync, permission };
}
