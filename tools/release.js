// Dopo `gradlew assembleRelease` (npm run apk:release): controlla la firma dell'APK e lo copia in
// dist/mycimmena-<versione>.apk, il nome da allegare alla Release di GitHub (PIANO.md, §10).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVersions } from './version.js';

const root = fileURLToPath(new URL('../', import.meta.url));
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
	console.log(report.split('\n').filter(line => /Signer #1 certificate (DN|SHA-256)/.test(line)).join('\n'));
} else {
	console.warn('apksigner non trovato: firma non controllata.');
}

mkdirSync(join(root, 'dist'), { recursive: true });
const target = join(root, 'dist', `mycimmena-${versions.pkg}.apk`);
copyFileSync(apk, target);
console.log(`Pronto: ${target}`);
