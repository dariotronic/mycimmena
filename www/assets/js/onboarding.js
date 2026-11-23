// Onboarding del primo avvio (PIANO.md, §4): benvenuto, chi sei, due chiacchiere, schede light o complete, chiave OMDb,
// backup, importazione e saluto. Ogni passaggio ha "Indietro"; il punto raggiunto e le risposte si salvano subito,
// così se l'app si chiude a metà si riparte da lì. Alla fine niente è definitivo: tutto si cambia dalle Impostazioni.
import { escapeHtml } from './domain.js';
import { hydrateIcons, icon } from './icons.js';
import { showErrorToast } from './toasts.js';
import { bindKeySetup, renderKeySetup } from './key-setup.js';
import { bindMoviePicker, renderMoviePicker } from './movie-picker.js';
import { birthdayFields, COMPANY, LANGUAGES, PLACES, POPCORN, profileValues, SPECTATORS } from './profile.js';
import { FILE_ACCEPT, importHowTo } from './import-ui.js';

export const STEPS = ['welcome', 'who', 'chat', 'cards', 'confirm', 'key', 'backup', 'import', 'end'];

// Scheda di esempio, uguale per le due versioni: Alien (1979). La trama è un riassunto nostro.
const SAMPLE = {
	title: 'Alien',
	year: '1979',
	poster: 'https://m.media-amazon.com/images/M/MV5BN2NhMDk2MmEtZDQzOC00MmY5LThhYzAtMDdjZGFjOGZjMjdjXkEyXkFqcGc@._V1_SX400.jpg',
	stars: 'Sigourney Weaver, Tom Skerritt',
	full: [
		['Regia', 'Ridley Scott'],
		['Trama', 'L’equipaggio di un cargo spaziale risponde a un segnale da un pianeta sconosciuto e porta a bordo un ospite letale.'],
		['Durata', '117 min'],
		['Genere', 'Horror, fantascienza'],
		['Voto IMDb', '8,5/10'],
		['Premi', '1 Oscar']
	]
};

const PLANS = {
	light: {
		title: 'Light',
		pros: ['Funziona subito, non serve nient’altro', 'Nessuna registrazione'],
		cons: ['Niente trama, regista, durata e genere', 'Gli episodi delle serie li indichi tu']
	},
	full: {
		title: 'Completa',
		pros: ['Trama, regista, cast, durata, genere, voto IMDb e premi', 'Stagioni ed episodi delle serie caricati da soli'],
		cons: ['Serve una chiave gratuita di OMDb: solo la mail, 2–3 minuti', 'Fino a 1000 schede al giorno (bastano e avanzano)']
	}
};

// openBackup: ripristino di un backup (telefono nuovo), con `onResult` per l'esito; openImport: importazione della
// watchlist, con il file già scelto.
// onProfileSaved: dopo "Chi sei?" con il compleanno, per chiedere il permesso delle notifiche.
export function createOnboarding({ store, details, getData, refresh, onFinish, openBackup = () => {}, openImport = () => {}, onProfileSaved = () => {} }) {
	const root = document.getElementById('onboarding');
	let unbindKey = () => {};

	const state = () => getData().onboarding || {};
	const profile = () => getData().profile || {};
	const step = () => (STEPS.includes(state().step) ? state().step : 'welcome');
	const isActive = () => !state().done;
	const choice = () => state().choice || (getData().settings?.detailMode === 'full' ? 'full' : null);

	// Passaggi da saltare: la chiave serve solo a chi ha scelto la versione completa e non ne ha già una valida
	// (per esempio da un backup). Una volta mostrato, il passaggio resta anche dopo la verifica: senza, "Avanti" e
	// "Indietro" non lo troverebbero più nella lista (e si tornava al benvenuto).
	function stepsFor(plan) {
		return STEPS.filter(id => id !== 'key' || (plan === 'full' && (getData().mode !== 'full' || state().keyShown)));
	}

	async function goTo(id, patch = {}) {
		await store.updateKv('onboarding', { ...patch, ...(id === 'key' ? { keyShown: true } : {}), step: id });
		await refresh();
		render();
		root.scrollTo?.({ top: 0, behavior: 'instant' });
		window.scrollTo({ top: 0, behavior: 'instant' });
		root.querySelector('h1')?.focus({ preventScroll: true });
	}
	const neighbour = delta => {
		const list = stepsFor(choice());
		return list[Math.min(list.length - 1, Math.max(0, list.indexOf(step()) + delta))];
	};
	const next = patch => goTo(neighbour(1), patch);
	const back = () => goTo(neighbour(-1));

	const chips = (name, options, value) => `
		<div class="onboarding-chips" role="radiogroup" aria-label="${escapeHtml(name)}">
			${options.map(option => `
				<label class="onboarding-chip">
					<input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(option.value)}"${option.value === value ? ' checked' : ''}>
					<span>${escapeHtml(option.label)}</span>
				</label>
			`).join('')}
		</div>
	`;

	// Pulsanti in fondo allo schermo, a tutta larghezza e uno sotto l'altro: prima l'azione principale (`main`, HTML
	// già pronto, oppure il pulsante `nextLabel`), poi le altre (`extra`), per ultimo "Indietro".
	const frame = (content, { showBack = true, nextLabel = 'Avanti', nextAttrs = 'data-ob-next', main = '', extra = '' } = {}) => `
		<div class="onboarding-step" data-step="${step()}">
			<div class="onboarding-progress" aria-hidden="true">${stepsFor(choice()).map(id => `<span${id === step() ? ' class="active"' : ''}></span>`).join('')}</div>
			<div class="onboarding-content">
				${content}
				${restoreNotice()}
			</div>
			${state().restore?.ok ? '' : `
				<div class="onboarding-actions">
					${main || (nextLabel ? `<button class="button" type="button" ${nextAttrs}>${nextLabel}</button>` : '')}
					${extra}
					${showBack ? '<button class="button secondary" type="button" data-ob-back>Indietro</button>' : ''}
				</div>
			`}
		</div>
	`;

	// Esito del ripristino di un backup fatto durante l'onboarding: riuscito (si può entrare subito) o no. Se è riuscito
	// restano solo le due scelte dell'avviso, senza i pulsanti del passaggio.
	function restoreNotice() {
		const result = state().restore;
		if (!result) return '';
		if (!result.ok) {
			return `
				<div class="onboarding-notice error" role="alert">
					<p><strong>Ripristino non riuscito.</strong> ${escapeHtml(result.message || '')}</p>
					<p>Puoi riprovare con un altro file, oppure andare avanti senza backup.</p>
				</div>
			`;
		}
		return `
			<div class="onboarding-notice" role="status">
				<p><strong>Backup ripristinato ✓</strong></p>
				${result.text ? `<p>${escapeHtml(result.text)}</p>` : ''}
				<p>Profilo e impostazioni sono quelli del backup: puoi entrare subito, oppure continuare e rivedere le scelte.</p>
				<div class="onboarding-notice-actions">
					<button class="button" type="button" data-ob-finish>Entra nell’app</button>
					<button class="button secondary" type="button" data-ob-dismiss>Continua la configurazione</button>
				</div>
			</div>
		`;
	}

	// Interruttore Light / Completa e, sotto, la scheda di esempio della versione scelta, a tutta larghezza.
	const planSwitch = plan => `
		<div class="onboarding-plan-switch" role="radiogroup" aria-label="Versione delle schede">
			${['light', 'full'].map(id => `<button class="onboarding-plan-option${plan === id ? ' active' : ''}" type="button" role="radio" aria-checked="${plan === id}" data-ob-plan="${id}">${PLANS[id].title}</button>`).join('')}
		</div>
	`;
	const sampleCard = plan => `
		<article class="onboarding-sample">
			<img class="onboarding-sample-poster" src="${SAMPLE.poster}" alt="" loading="lazy">
			<div class="onboarding-sample-body">
				<span class="onboarding-sample-title">${SAMPLE.title} (${SAMPLE.year})</span>
				<dl>
					<div><dt>Tipo</dt><dd>Film</dd></div>
					<div><dt>Attori</dt><dd>${escapeHtml(SAMPLE.stars)}</dd></div>
					${plan === 'full' ? SAMPLE.full.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('') : ''}
				</dl>
			</div>
			<p class="onboarding-sample-note">${plan === 'light' ? 'Funziona subito, non serve nient’altro.' : 'Serve una chiave gratuita di OMDb: ti registri solo con la mail, in 2–3 minuti.'}</p>
		</article>
	`;

	const VIEWS = {
		welcome: () => frame(`
			<img class="onboarding-logo" src="assets/logo.svg" alt="" width="120" height="120">
			<h1 tabindex="-1">Benvenuto in myCimmena</h1>
			<p class="onboarding-lead">Tieni traccia dei film e delle serie che vuoi vedere e di quelli che hai visto, con i tuoi voti. Tutto resta sul tuo telefono.</p>
		`, { showBack: false, nextLabel: 'Iniziamo', extra: '<button class="button secondary" type="button" data-ob-restore>Ho un backup: ripristinalo</button>' }),
		who: () => frame(`
			<h1 tabindex="-1">Chi sei?</h1>
			<form class="form-grid onboarding-form" data-ob-form>
				<div class="field full"><label for="ob-name">Come ti chiami?</label><input id="ob-name" name="name" type="text" maxlength="60" autocomplete="given-name" value="${escapeHtml(profile().name || '')}" placeholder="Il nome con cui ti saluto"></div>
				<div class="field full"><label for="ob-birthday-day">Quando compi gli anni? <span>(facoltativo, per farti gli auguri)</span></label>${birthdayFields('ob-birthday', profile().birthday)}</div>
			</form>
		`),
		chat: () => frame(`
			<h1 tabindex="-1">Due chiacchiere</h1>
			<p class="onboarding-lead">Tutto facoltativo. Le risposte su dove e con chi guardi riempiono già il diario.</p>
			<form class="onboarding-form onboarding-chat" data-ob-form>
				<div class="field full">
					<span class="field-label">Il tuo film del cuore</span>
					${renderMoviePicker(getData().favorite)}
				</div>
				<fieldset><legend>Dove guardi i film di solito?</legend>${chips('place', PLACES, profile().place)}</fieldset>
				<fieldset><legend>Con chi?</legend>${chips('company', COMPANY, profile().company)}</fieldset>
				<fieldset><legend>Popcorn: dolci o salati?</legend>${chips('popcorn', POPCORN, profile().popcorn)}</fieldset>
				<fieldset><legend>Doppiato o sottotitoli?</legend>${chips('language', LANGUAGES, profile().language)}</fieldset>
				<fieldset><legend>Che spettatore sei?</legend>${chips('spectator', SPECTATORS, profile().spectator)}</fieldset>
				<div class="field full"><label for="ob-director">Il regista che non sbaglia mai</label><input id="ob-director" name="director" type="text" maxlength="80" value="${escapeHtml(profile().director || '')}"></div>
			</form>
		`, { extra: '<button class="button secondary" type="button" data-ob-skip>Salta</button>' }),
		cards: () => frame(`
			<h1 tabindex="-1">Quanto dettagliate vuoi le schede?</h1>
			<p class="onboarding-lead">Lo stesso film nelle due versioni: scegli quella che preferisci. Si cambia quando vuoi dalle Impostazioni.</p>
			${planSwitch(choice() || 'light')}
			${sampleCard(choice() || 'light')}
		`, { nextAttrs: 'data-ob-cards-next' }),
		confirm: () => {
			const plan = PLANS[choice() || 'light'];
			const other = PLANS[choice() === 'full' ? 'light' : 'full'];
			return frame(`
				<h1 tabindex="-1">Versione ${plan.title}</h1>
				<div class="onboarding-compare">
					${[plan, other].map((item, index) => `
						<section class="onboarding-plan${index === 0 ? ' chosen' : ''}">
							<h2>${item.title}${index === 0 ? ' <small>la tua scelta</small>' : ''}</h2>
							<ul class="pros">${item.pros.map(text => `<li>${escapeHtml(text)}</li>`).join('')}</ul>
							<ul class="cons">${item.cons.map(text => `<li>${escapeHtml(text)}</li>`).join('')}</ul>
						</section>
					`).join('')}
				</div>
			`, { nextLabel: `Confermo ${plan.title}`, nextAttrs: 'data-ob-confirm', extra: '<button class="button secondary" type="button" data-ob-back>Torna al confronto</button>', showBack: false });
		},
		key: () => frame(`
			<h1 tabindex="-1">La chiave di OMDb</h1>
			<p class="onboarding-lead">È gratuita e personale: con questa l'app scarica i dettagli dei titoli direttamente da OMDb, senza passare da altri server.</p>
			${renderKeySetup({ later: false, verified: getData().mode === 'full' })}
		`, getData().mode === 'full'
			? {}
			: { nextLabel: '', extra: '<button class="button secondary" type="button" data-ob-key-later>La inserisco più tardi</button>' }),
		backup: () => frame(`
			<h1 tabindex="-1">I tuoi dati stanno qui</h1>
			<p class="onboarding-lead">Watchlist, diario e voti vivono solo su questo telefono: niente account, niente server.</p>
			<p>Per questo, se disinstalli l'app o ne cancelli i dati, si perdono. Con <strong>Esporta backup</strong> nelle Impostazioni salvi tutto in un file da tenere su Drive, in una mail o dove preferisci: serve anche per cambiare telefono.</p>
		`),
		import: () => frame(`
			<h1 tabindex="-1">Hai già una watchlist altrove?</h1>
			<p class="onboarding-lead">Puoi portare in myCimmena i film da vedere salvati su Letterboxd o IMDb. Ecco come scaricare il file:</p>
			${importHowTo()}
			<section class="onboarding-import-backup">
				<h2>Da un altro telefono con myCimmena</h2>
				<p>Hai esportato un backup sul telefono vecchio? Ripristinalo: tornano watchlist, diario, voti e impostazioni.</p>
				<button class="button secondary" type="button" data-ob-restore>Ripristina un backup di myCimmena</button>
			</section>
			<p class="help-text">Non hai il file adesso? Nessun problema: puoi importare quando vuoi da Impostazioni → Importa da Letterboxd o IMDb.</p>
		`, {
			main: `<label class="button file-button">Scegli il file (.zip o .csv)<input type="file" accept="${FILE_ACCEPT}" data-ob-import-file></label>`,
			extra: '<button class="button secondary" type="button" data-ob-next>Salta</button>'
		}),
		end: () => frame(`
			<img class="onboarding-logo" src="assets/logo.svg" alt="" width="120" height="120">
			<h1 tabindex="-1">Ciao${profile().name ? `, ${escapeHtml(profile().name)}` : ''}!</h1>
			<p class="onboarding-lead">È tutto pronto. Cerca il primo film da aggiungere alla watchlist con il ${icon('add')} in alto.</p>
		`, { nextLabel: 'Entra', nextAttrs: 'data-ob-finish' })
	};

	// Risposte del modulo del passaggio corrente (nome e compleanno, o due chiacchiere).
	function formValues() {
		const form = root.querySelector('[data-ob-form]');
		if (!form) return null;
		const values = {};
		for (const element of form.elements) {
			if (!element.name || (element.type === 'radio' && !element.checked)) continue;
			values[element.name] = element.value.trim();
		}
		return profileValues(values);
	}

	function render() {
		const active = isActive();
		document.documentElement.dataset.onboarding = String(active);
		root.hidden = !active;
		unbindKey();
		if (!active) {
			root.innerHTML = '';
			return;
		}
		root.innerHTML = VIEWS[step()]();
		hydrateIcons(root);
		if (step() === 'chat') {
			// Il film scelto entra nel catalogo; nel profilo va con "Avanti", insieme alle altre risposte.
			bindMoviePicker(root, { onPick: movie => store.saveMovie(movie) });
		}
		if (step() === 'key') {
			// Chiave valida: si resta qui con l'esito e il pulsante "Avanti"; si prosegue quando lo decide l'utente.
			unbindKey = bindKeySetup(root, {
				useKey: details.useKey,
				onDone: async () => {
					await refresh();
					render();
				}
			});
		}
	}

	root.addEventListener('click', async event => {
		try {
			if (event.target.closest('[data-ob-back]')) return void await back();
			const plan = event.target.closest('[data-ob-plan]');
			if (plan) return void await goTo('cards', { choice: plan.dataset.obPlan });
			if (event.target.closest('[data-ob-cards-next]')) return void await goTo('confirm', { choice: choice() || 'light' });
			if (event.target.closest('[data-ob-skip]')) return void await next();
			if (event.target.closest('[data-ob-restore]')) return void openBackup({ onResult: saveRestoreResult });
			if (event.target.closest('[data-ob-dismiss]')) return void await goTo(step(), { restore: null });
			if (event.target.closest('[data-ob-key-later]')) {
				await store.updateKv('settings', { detailMode: 'full', omdbKeyStatus: getData().settings?.omdbKeyStatus || 'missing' });
				return void await next();
			}
			if (event.target.closest('[data-ob-confirm]')) {
				const full = choice() === 'full';
				const settings = getData().settings || {};
				await store.updateKv('settings', full
					? { detailMode: 'full', omdbKeyStatus: settings.omdbKey && settings.omdbKeyStatus === 'valid' ? 'valid' : (settings.omdbKeyStatus || 'missing') }
					: { detailMode: 'light' });
				return void await next();
			}
			if (event.target.closest('[data-ob-finish]')) {
				await store.updateKv('onboarding', { done: true, restore: null, finishedAt: new Date().toISOString() });
				await refresh();
				render();
				onFinish();
				return;
			}
			if (event.target.closest('[data-ob-next]')) {
				const values = formValues();
				if (values) await store.updateKv('profile', values);
				await next();
				if (values?.birthday) onProfileSaved();
			}
		} catch (error) {
			showErrorToast(error);
		}
	});

	// Il file della watchlist scelto direttamente dal pulsante: la finestra dell'importazione parte già con quello.
	root.addEventListener('change', event => {
		const input = event.target.closest('[data-ob-import-file]');
		const file = input?.files?.[0];
		if (!file) return;
		input.value = '';
		openImport({ file, afterImport: () => next() });
	});

	// Esito del ripristino (backup-ui.js), salvato prima che l'app si ridisegni. Il backup può contenere un onboarding
	// già finito: qui resta aperto, con l'avviso, finché l'utente non sceglie se entrare subito o continuare.
	async function saveRestoreResult(result) {
		await store.updateKv('onboarding', { done: false, step: step(), restore: result });
	}

	// Tasto Indietro di Android durante l'onboarding: passaggio precedente (dal primo non si fa niente).
	function handleBack() {
		if (!isActive()) return false;
		if (step() !== 'welcome') back();
		return true;
	}

	return { render, isActive, handleBack };
}
