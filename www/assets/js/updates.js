// Controllo degli aggiornamenti (PIANO.md, §10): l'ultima Release della repo GitHub, a ogni apertura dell'app,
// ogni ora e quando l'utente preme "Controlla aggiornamenti".
//
// Limiti di GitHub: 60 richieste l'ora per indirizzo IP senza login. Ogni richiesta manda l'ETag dell'ultima
// risposta (se non c'è niente di nuovo GitHub risponde 304); i controlli automatici si fermano quando ne restano
// meno di 5, fino all'ora indicata da GitHub. Lo stato sta in meta.updateCheck:
// { lastAt, etag, latest: { version, notes, url, apkUrl, sha256, size, publishedAt } | null, remaining, resetAt, dismissedVersion, dismissedUntil }
export const RELEASES_URL = 'https://api.github.com/repos/dariotronic/mycimmena/releases/latest';
export const HOUR_MS = 60 * 60 * 1000;
const MANUAL_REPEAT_MS = 30 * 1000;
const MIN_REMAINING = 5;

// "1.2.0" contro "1.10.0": confronto numero per numero. Positivo se a è più nuova di b.
export function compareVersions(a, b) {
	const parts = value => String(value || '').replace(/^v/i, '').split(/[.-]/).slice(0, 3).map(part => Number.parseInt(part, 10) || 0);
	const [x, y] = [parts(a), parts(b)];
	for (let i = 0; i < 3; i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
	return 0;
}

// Dalla risposta di GitHub ai soli dati che servono. L'APK è il primo file .apk allegato alla Release.
export function parseRelease(release) {
	const version = String(release?.tag_name || '').replace(/^v/i, '');
	if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
	const apk = (Array.isArray(release.assets) ? release.assets : []).find(asset => /\.apk$/i.test(asset?.name || ''));
	const https = value => (/^https:\/\/github\.com\//.test(String(value || '')) ? String(value) : '');
	return {
		version,
		notes: String(release.body || '').slice(0, 4000),
		url: https(release.html_url),
		apkUrl: https(apk?.browser_download_url),
		// Impronta che GitHub calcola per ogni file allegato ("sha256:…"): il plugin Updater la confronta col download.
		sha256: /^sha256:[0-9a-f]{64}$/i.test(String(apk?.digest || '')) ? apk.digest.slice(7).toLowerCase() : '',
		size: Number.isInteger(apk?.size) ? apk.size : 0,
		publishedAt: String(release.published_at || '')
	};
}

// C'è una versione più nuova di quella installata?
export const isNewer = (latest, currentVersion) => Boolean(latest) && compareVersions(latest.version, currentVersion) > 0;

// L'avviso per questa versione è stato rimandato con "Più tardi" meno di 24 ore fa?
export const isSnoozed = (check, now = Date.now()) => Boolean(check?.latest) && check.dismissedVersion === check.latest.version && Number(check.dismissedUntil || 0) > now;

// Ora di Roma in cui GitHub rimette a disposizione le richieste: "15:40".
export const formatResetTime = resetAt => new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(new Date(Number(resetAt) * 1000));

// Esito di un controllo in parole, per il pulsante manuale.
export function describeResult(result, currentVersion) {
	switch (result.kind) {
		case 'available': return `È disponibile myCimmena ${result.latest.version}.`;
		case 'current': return `Hai già l’ultima versione (${currentVersion}).`;
		case 'offline': return 'Sei offline: riprova quando torna la connessione.';
		case 'limited': return `GitHub ha ricevuto troppe richieste da questa rete: riprova dopo le ${formatResetTime(result.resetAt)}.`;
		default: return 'Non riesco a controllare gli aggiornamenti in questo momento. Riprova più tardi.';
	}
}

// getCheck() legge meta.updateCheck, saveCheck(patch) lo aggiorna.
export function createUpdateChecker({ getCheck, saveCheck, currentVersion, fetchImpl = (...args) => globalThis.fetch(...args), now = () => Date.now(), isOnline = () => globalThis.navigator?.onLine !== false }) {
	let lastManual = null;
	let running = null;

	const resultFor = latest => ({ kind: isNewer(latest, currentVersion) ? 'available' : 'current', latest: latest || null });

	async function request(check) {
		let response;
		try {
			response = await fetchImpl(RELEASES_URL, {
				cache: 'no-store',
				headers: { Accept: 'application/vnd.github+json', ...(check.etag ? { 'If-None-Match': check.etag } : {}) }
			});
		} catch {
			return { kind: isOnline() ? 'error' : 'offline' };
		}
		const header = name => response.headers?.get?.(name);
		const remaining = header('X-RateLimit-Remaining');
		const resetAt = header('X-RateLimit-Reset');
		const limits = {
			...(remaining !== null && remaining !== undefined && remaining !== '' ? { remaining: Number(remaining) } : {}),
			...(resetAt ? { resetAt: Number(resetAt) } : {})
		};
		const stamp = new Date(now()).toISOString();
		if (response.status === 304) {
			await saveCheck({ lastAt: stamp, ...limits });
			return resultFor(check.latest);
		}
		if (response.status === 404) {
			// Nessuna Release pubblicata.
			await saveCheck({ lastAt: stamp, etag: null, latest: null, ...limits });
			return resultFor(null);
		}
		if (response.status === 403 || response.status === 429) {
			await saveCheck({ ...limits, remaining: 0 });
			return { kind: 'limited', resetAt: limits.resetAt || Math.ceil((now() + HOUR_MS) / 1000) };
		}
		if (!response.ok) return { kind: 'error' };
		let latest;
		try {
			latest = parseRelease(await response.json());
		} catch {
			return { kind: 'error' };
		}
		await saveCheck({ lastAt: stamp, etag: header('ETag') || null, latest, ...limits });
		return resultFor(latest);
	}

	// manual: dal pulsante. Gli automatici rispettano i limiti in silenzio; il manuale risponde sempre.
	async function check({ manual = false } = {}) {
		const current = getCheck() || {};
		const time = now();
		if (manual && lastManual && time - lastManual.at < MANUAL_REPEAT_MS) return lastManual.result;
		const limited = Number.isFinite(current.remaining) && Number(current.resetAt) * 1000 > time
			&& (manual ? current.remaining <= 0 : current.remaining < MIN_REMAINING);
		let result;
		if (limited) result = { kind: 'limited', resetAt: current.resetAt };
		else if (!isOnline()) result = { kind: 'offline' };
		else {
			running ||= request(current).finally(() => { running = null; });
			result = await running;
		}
		if (manual) lastManual = { at: time, result };
		return result;
	}

	// Serve un controllo automatico? (ritorno in primo piano: solo se l'ultimo ha più di un'ora)
	const isDue = () => {
		const lastAt = Date.parse(getCheck()?.lastAt || '');
		return !Number.isFinite(lastAt) || now() - lastAt >= HOUR_MS;
	};

	return { check, isDue };
}
