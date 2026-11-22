// Strato dati provvisorio della Fase 0. Sul sito qui c'erano le chiamate al server (api/*.php) e i token del login;
// nell'app non c'è né server né account. Nella Fase 1 questo modulo sparisce: i dati stanno sul telefono e i
// moduli chiamano le funzioni di store.js (PIANO.md, §2 "Dati sul telefono").
// Per ora l'app parte con dati vuoti e ogni modifica risponde con un errore chiaro, così le viste si possono già
// provare sul telefono.

export const OFFLINE_MESSAGE = 'Sei offline: questa funzione ha bisogno della connessione.';
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export const NOT_YET_AVAILABLE_MESSAGE = 'Non ancora disponibile: il salvataggio dei dati sul telefono arriva con la prossima versione.';

export async function apiRequest() {
	throw new Error(NOT_YET_AVAILABLE_MESSAGE);
}

export const emptyAppData = () => ({ upcoming: null, archive: [], movies: [] });

export async function fetchAppData() {
	return emptyAppData();
}
