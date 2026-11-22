// Onboarding del primo avvio (PIANO.md, §4): benvenuto, chi sei, due chiacchiere, schede light o complete, chiave OMDb,
// backup, importazione e saluto. Ogni passaggio ha "Indietro"; il punto raggiunto e le risposte si salvano subito,
// così se l'app si chiude a metà si riparte da lì. Alla fine niente è definitivo: tutto si cambia dalle Impostazioni.
import { escapeHtml } from './domain.js';
import { hydrateIcons, icon } from './icons.js';
import { showErrorToast } from './toasts.js';
import { bindKeySetup, renderKeySetup } from './key-setup.js';
import { bindMoviePicker } from './movie-picker.js';
import { COMPANY, LANGUAGES, PLACES, POPCORN, SPECTATORS } from './profile.js';

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

export function createOnboarding({ store, details, getData, refresh, onFinish }) {
	const root = document.getElementById('onboarding');
	let unbindKey = () => {};

	const state = () => getData().onboarding || {};
	const profile = () => getData().profile || {};
	const step = () => (STEPS.includes(state().step) ? state().step : 'welcome');
	const isActive = () => !state().done;
	const choice = () => state().choice || (getData().settings?.detailMode === 'full' ? 'full' : null);

	// Passaggi da saltare: la chiave serve solo a chi ha scelto la versione completa (e non ne ha già una valida).
	function stepsFor(plan) {
		return STEPS.filter(id => id !== 'key' || (plan === 'full' && getData().mode !== 'full'));
	}

	async function goTo(id, patch = {}) {
		await store.updateKv('onboarding', { ...patch, step: id });
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

	const frame = (content, { showBack = true, nextLabel = 'Avanti', nextAttrs = 'data-ob-next', extra = '' } = {}) => `
		<div class="onboarding-step" data-step="${step()}">
			<div class="onboarding-progress" aria-hidden="true">${stepsFor(choice()).map(id => `<span${id === step() ? ' class="active"' : ''}></span>`).join('')}</div>
			${content}
			<div class="onboarding-actions">
				${showBack ? '<button class="button secondary" type="button" data-ob-back>Indietro</button>' : ''}
				${extra}
				${nextLabel ? `<button class="button" type="button" ${nextAttrs}>${nextLabel}</button>` : ''}
			</div>
		</div>
	`;

	const sampleCard = plan => `
		<article class="onboarding-sample${choice() === plan ? ' selected' : ''}">
			<button class="onboarding-sample-pick" type="button" data-ob-plan="${plan}" aria-pressed="${choice() === plan}">
				<span class="onboarding-sample-name">${PLANS[plan].title}</span>
				<img class="onboarding-sample-poster" src="${SAMPLE.poster}" alt="" loading="lazy">
				<span class="onboarding-sample-title">${SAMPLE.title} (${SAMPLE.year})</span>
				<dl>
					<div><dt>Tipo</dt><dd>Film</dd></div>
					<div><dt>Attori</dt><dd>${escapeHtml(SAMPLE.stars)}</dd></div>
					${plan === 'full' ? SAMPLE.full.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('') : ''}
				</dl>
				<span class="onboarding-sample-note">${plan === 'light' ? 'Funziona subito, non serve nient’altro.' : 'Serve una chiave gratuita di OMDb: ti registri solo con la mail, in 2–3 minuti.'}</span>
			</button>
		</article>
	`;

	const VIEWS = {
		welcome: () => frame(`
			<img class="onboarding-logo" src="assets/logo.svg" alt="" width="120" height="120">
			<h1 tabindex="-1">Benvenuto in myCimmena</h1>
			<p class="onboarding-lead">Tieni traccia dei film e delle serie che vuoi vedere e di quelli che hai visto, con i tuoi voti. Tutto resta sul tuo telefono.</p>
		`, { showBack: false, nextLabel: 'Iniziamo' }),
		who: () => frame(`
			<h1 tabindex="-1">Chi sei?</h1>
			<form class="form-grid onboarding-form" data-ob-form>
				<div class="field full"><label for="ob-name">Come ti chiami?</label><input id="ob-name" name="name" type="text" maxlength="60" autocomplete="given-name" value="${escapeHtml(profile().name || '')}" placeholder="Il nome con cui ti saluto"></div>
				<div class="field full"><label for="ob-birthday">Quando compi gli anni? <span>(facoltativo, per farti gli auguri)</span></label><input id="ob-birthday" name="birthday" type="date" value="${escapeHtml(profile().birthday || '')}"></div>
			</form>
		`),
		chat: () => frame(`
			<h1 tabindex="-1">Due chiacchiere</h1>
			<p class="onboarding-lead">Tutto facoltativo. Le risposte su dove e con chi guardi riempiono già il diario.</p>
			<form class="onboarding-form onboarding-chat" data-ob-form>
				<div class="field full">
					<span class="field-label">Il tuo film del cuore</span>
					${getData().favorite ? `<p class="help-text">Scelto: ${escapeHtml(getData().favorite.title)}</p>` : ''}
					<div class="movie-picker" data-movie-picker>
						<input type="search" placeholder="Cerca un titolo" aria-label="Cerca il tuo film del cuore" data-movie-picker-input>
						<div class="movie-picker-results" data-movie-picker-results></div>
					</div>
				</div>
				<fieldset><legend>Dove guardi i film di solito?</legend>${chips('place', PLACES, profile().place)}</fieldset>
				<fieldset><legend>Con chi?</legend>${chips('company', COMPANY, profile().company)}</fieldset>
				<fieldset><legend>Popcorn: dolci o salati?</legend>${chips('popcorn', POPCORN, profile().popcorn)}</fieldset>
				<fieldset><legend>Doppiato o sottotitoli?</legend>${chips('language', LANGUAGES, profile().language)}</fieldset>
				<fieldset><legend>Che spettatore sei?</legend>${chips('spectator', SPECTATORS, profile().spectator)}</fieldset>
				<div class="field full"><label for="ob-director">Il regista che non sbaglia mai</label><input id="ob-director" name="director" type="text" maxlength="80" value="${escapeHtml(profile().director || '')}"></div>
			</form>
		`, { extra: '<button class="text-button" type="button" data-ob-skip>Salta</button>' }),
		cards: () => frame(`
			<h1 tabindex="-1">Quanto dettagliate vuoi le schede?</h1>
			<p class="onboarding-lead">Lo stesso film nelle due versioni. Tocca quella che preferisci: si cambia quando vuoi dalle Impostazioni.</p>
			<div class="onboarding-samples">${sampleCard('light')}${sampleCard('full')}</div>
		`, { nextLabel: choice() ? 'Avanti' : '', nextAttrs: 'data-ob-next' }),
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
			`, { nextLabel: `Confermo ${plan.title}`, nextAttrs: 'data-ob-confirm', extra: '<button class="text-button" type="button" data-ob-back>Torna al confronto</button>', showBack: false });
		},
		key: () => frame(`
			<h1 tabindex="-1">La chiave di OMDb</h1>
			<p class="onboarding-lead">È gratuita e personale: con questa l'app scarica i dettagli dei titoli direttamente da OMDb, senza passare da altri server.</p>
			${renderKeySetup()}
		`, { nextLabel: '' }),
		backup: () => frame(`
			<h1 tabindex="-1">I tuoi dati stanno qui</h1>
			<p class="onboarding-lead">Watchlist, diario e voti vivono solo su questo telefono: niente account, niente server.</p>
			<p>Per questo, se disinstalli l'app o ne cancelli i dati, si perdono. Con <strong>Esporta backup</strong> nelle Impostazioni salvi tutto in un file da tenere su Drive, in una mail o dove preferisci: serve anche per cambiare telefono.</p>
			<p class="help-text">L'esportazione arriva con il prossimo aggiornamento dell'app.</p>
		`),
		import: () => frame(`
			<h1 tabindex="-1">Hai già una watchlist altrove?</h1>
			<p class="onboarding-lead">Puoi portare in myCimmena i film da vedere salvati su Letterboxd o IMDb. Ecco come scaricare il file:</p>
			<div class="onboarding-import">
				<section>
					<h2>Letterboxd</h2>
					<ol>
						<li>Apri letterboxd.com dal browser (nell'app di Letterboxd l'esportazione non c'è).</li>
						<li>Impostazioni → scheda <strong>Data</strong> → <strong>Export your data</strong>.</li>
						<li>Si scarica un file <code>.zip</code>: myCimmena lo legge così com'è.</li>
					</ol>
				</section>
				<section>
					<h2>IMDb</h2>
					<ol>
						<li>Apri imdb.com e la tua <strong>Watchlist</strong>.</li>
						<li>Menu <strong>⋯</strong> → <strong>Export</strong>.</li>
						<li>Dalla pagina <strong>Your exports</strong> scarica il file <code>.csv</code> quando è pronto.</li>
					</ol>
				</section>
			</div>
			<p class="help-text">L'importazione arriva con il prossimo aggiornamento: la troverai in Impostazioni → Importa watchlist.</p>
		`, { nextLabel: 'Più tardi' }),
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
		return values;
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
			bindMoviePicker(root, {
				onPick: async movie => {
					await store.saveMovie(movie);
					await store.updateKv('profile', { favoriteMovieId: movie.id });
					await refresh();
				}
			});
		}
		if (step() === 'key') {
			unbindKey = bindKeySetup(root, {
				useKey: details.useKey,
				onDone: () => next(),
				onLater: async () => {
					await store.updateKv('settings', { detailMode: 'full', omdbKeyStatus: getData().settings?.omdbKeyStatus || 'missing' });
					await next();
				}
			});
		}
	}

	root.addEventListener('click', async event => {
		try {
			if (event.target.closest('[data-ob-back]')) return void await back();
			const plan = event.target.closest('[data-ob-plan]');
			if (plan) return void await goTo('cards', { choice: plan.dataset.obPlan });
			if (event.target.closest('[data-ob-skip]')) return void await next();
			if (event.target.closest('[data-ob-confirm]')) {
				const full = choice() === 'full';
				const settings = getData().settings || {};
				await store.updateKv('settings', full
					? { detailMode: 'full', omdbKeyStatus: settings.omdbKey && settings.omdbKeyStatus === 'valid' ? 'valid' : (settings.omdbKeyStatus || 'missing') }
					: { detailMode: 'light' });
				return void await next();
			}
			if (event.target.closest('[data-ob-finish]')) {
				await store.updateKv('onboarding', { done: true, finishedAt: new Date().toISOString() });
				await refresh();
				render();
				onFinish();
				return;
			}
			if (event.target.closest('[data-ob-next]')) {
				const values = formValues();
				if (values) await store.updateKv('profile', values);
				await next();
			}
		} catch (error) {
			showErrorToast(error);
		}
	});

	// Tasto Indietro di Android durante l'onboarding: passaggio precedente (dal primo non si fa niente).
	function handleBack() {
		if (!isActive()) return false;
		if (step() !== 'welcome') back();
		return true;
	}

	return { render, isActive, handleBack };
}
