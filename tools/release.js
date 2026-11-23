// Dopo `gradlew assembleRelease` (npm run apk:release): controlla la firma dell'APK e lo copia in
// dist/mycimmena-<versione>.apk, il nome da allegare alla Release di GitHub (PIANO.md, §10).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVersions } from './version.js';

const root = fileURLToPath(new URL('../', import.meta.url));
// Impronta SHA-256 del certificato di firma delle release (pubblica: la mostra qualunque APK di myCimmena).
const EXPECTED_CERT = 'ad2a03a1d2338cbf6e694a226625f6f1e92132e93e4fd978dc3d59d35b7b75f9';
const versions = readVersions();
if (new Set([versions.pkg, versions.info, versions.gradleName]).size !== 1) {
	console.error('Le versioni non sono allineate:', versions, '\nUsa node tools/version.js <versione>.');
	process.exit(1);
}
const output = join(root, 'android/app/build/outputs/apk/release');
const apk = join(output, 'app-release.apk');
if (!existsSync(apk)) {
	console.error(existsSync(join(output, 'app-release-unsigned.apk'))
		? 'L’APK non è firmato: manca ~/.mycimmena/keystore.properties (o la variabile MYCIMMENA_SIGNING). Vedi README.'
		: 'APK di release non trovato: esegui prima npm run apk:release.');
	process.exit(1);
}

// apksigner sta negli strumenti di build dell'SDK Android: si usa la versione più recente installata.
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA || '', 'Android/Sdk');
const buildTools = join(sdk, 'build-tools');
const latest = existsSync(buildTools) ? readdirSync(buildTools).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).pop() : null;
if (latest) {
	const apksigner = join(buildTools, latest, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
	const report = execFileSync(apksigner, ['verify', '--print-certs', apk], { encoding: 'utf8', shell: process.platform === 'win32' });
	// L'impronta del certificato deve essere quella della chiave di myCimmena (README, "Firma"): un APK firmato con
	// un'altra chiave non si installerebbe sopra le versioni già installate.
	const digests = [...report.matchAll(/certificate SHA-256 digest: ([0-9a-f]{64})/gi)].map(match => match[1].toLowerCase());
	console.log(report.split(/\r?\n/).filter(line => /certificate (DN|SHA-256 digest)/i.test(line)).join('\n'));
	if (!digests.length || digests.some(digest => digest !== EXPECTED_CERT)) {
		console.error(`Firma inattesa: ${digests.join(', ') || 'nessuna impronta trovata'} invece di ${EXPECTED_CERT}.\n${report}`);
		process.exit(1);
	}
} else {
	console.error('apksigner non trovato: firma non controllata.');
	process.exit(1);
}

mkdirSync(join(root, 'dist'), { recursive: true });
const target = join(root, 'dist', `mycimmena-${versions.pkg}.apk`);
copyFileSync(apk, target);
console.log(`Pronto: ${target}`);
