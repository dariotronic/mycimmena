// Copia server/feedback.php e server/.htaccess nella repo del sito (../CLUBDELCIMMENA/mycimmena/), da cui il
// deploy del sito li carica su IONOS (https://www.clubdelcimmena.it/mycimmena/feedback.php).
// Con --check controlla soltanto che le due copie siano uguali.
//   node tools/copy-server.js [--check] [percorso della repo del sito]
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const check = args.includes('--check');
const site = resolve(args.find(arg => !arg.startsWith('--')) || join(root, '../CLUBDELCIMMENA'));
if (!existsSync(join(site, 'index.php'))) {
	console.error(`Non trovo la repo del sito in ${site}.`);
	process.exit(1);
}
const target = join(site, 'mycimmena');
let different = 0;
for (const name of ['feedback.php', '.htaccess']) {
	const from = join(root, 'server', name);
	const to = join(target, name);
	const same = existsSync(to) && readFileSync(from).equals(readFileSync(to));
	if (check) {
		if (!same) different += 1;
		console.log(`${same ? 'uguale' : 'DIVERSO'}: mycimmena/${name}`);
	} else if (!same) {
		mkdirSync(target, { recursive: true });
		copyFileSync(from, to);
		console.log(`copiato: mycimmena/${name}`);
	}
}
if (check && different) process.exit(1);
