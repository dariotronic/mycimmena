// Cambia la versione dell'app in tutti i posti dove compare (PIANO.md, §10):
//   node tools/version.js 1.2.0
// - package.json e package-lock.json ("version")
// - www/assets/js/app-info.js (APP_VERSION, quella che l'app confronta con le Release di GitHub)
// - android/app/build.gradle (versionName, e versionCode = major*10000 + minor*100 + patch, sempre crescente)
// Senza argomento mostra la versione attuale e controlla che i tre file siano allineati.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const files = {
	pkg: new URL('package.json', root),
	lock: new URL('package-lock.json', root),
	info: new URL('www/assets/js/app-info.js', root),
	gradle: new URL('android/app/build.gradle', root)
};

export const versionCode = version => {
	const [major, minor, patch] = version.split('.').map(Number);
	return major * 10000 + minor * 100 + patch;
};

export function readVersions() {
	const gradle = readFileSync(files.gradle, 'utf8');
	return {
		pkg: JSON.parse(readFileSync(files.pkg, 'utf8')).version,
		info: readFileSync(files.info, 'utf8').match(/APP_VERSION = '([^']+)'/)?.[1],
		gradleName: gradle.match(/versionName "([^"]+)"/)?.[1],
		gradleCode: Number(gradle.match(/versionCode (\d+)/)?.[1])
	};
}

function setVersion(version) {
	if (!/^\d{1,3}\.\d{1,2}\.\d{1,2}$/.test(version)) throw new Error('Versione non valida: usa MAJOR.MINOR.PATCH, con minor e patch sotto 100 (per esempio 1.2.0).');
	const current = readVersions();
	if (versionCode(version) <= current.gradleCode) throw new Error(`La versione deve crescere: ${version} non è dopo ${current.gradleName}.`);
	const pkg = readFileSync(files.pkg, 'utf8');
	writeFileSync(files.pkg, pkg.replace(/"version": "[^"]+"/, `"version": "${version}"`));
	const info = readFileSync(files.info, 'utf8');
	writeFileSync(files.info, info.replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${version}'`));
	const gradle = readFileSync(files.gradle, 'utf8');
	writeFileSync(files.gradle, gradle.replace(/versionCode \d+/, `versionCode ${versionCode(version)}`).replace(/versionName "[^"]+"/, `versionName "${version}"`));
	const lock = JSON.parse(readFileSync(files.lock, 'utf8'));
	lock.version = version;
	if (lock.packages?.['']) lock.packages[''].version = version;
	writeFileSync(files.lock, `${JSON.stringify(lock, null, 2)}\n`);
	console.log(`Versione ${version} (versionCode ${versionCode(version)}).`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
	const wanted = process.argv[2];
	if (wanted) setVersion(wanted);
	else console.log(readVersions());
}
