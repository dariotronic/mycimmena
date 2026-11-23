// Pagina "Statistiche" (#statistiche): riquadri con i numeri, colonne per mesi, anni e voti, barre per generi
// e registi. Un solo colore (l'accento del tema): ogni grafico è una serie sola, il titolo dice cosa mostra.
// Ogni barra è un pulsante con il valore nel suggerimento (passandoci sopra o toccandola) e ogni grafico ha
// "Vedi come tabella". Il filtro dell'anno sta in alto, sopra tutti i grafici.
import { escapeHtml, formatSpipe, movieName } from './domain.js';
import { computeStats, MONTHS, statsYears } from './stats.js';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const visioni = count => plural(count, 'visione', 'visioni');

function tile(value, label, note = '') {
	return `<div class="stat-tile"><span class="stat-value">${escapeHtml(String(value))}</span><span class="stat-label">${escapeHtml(label)}</span>${note ? `<span class="stat-note">${escapeHtml(note)}</span>` : ''}</div>`;
}

const table = (head, rows) => `
	<details class="chart-table">
		<summary>Vedi come tabella</summary>
		<table>
			<thead><tr>${head.map(cell => `<th scope="col">${escapeHtml(cell)}</th>`).join('')}</tr></thead>
			<tbody>${rows.map(row => `<tr>${row.map((cell, index) => (index ? `<td>${escapeHtml(String(cell))}</td>` : `<th scope="row">${escapeHtml(String(cell))}</th>`)).join('')}</tr>`).join('')}</tbody>
		</table>
	</details>
`;

// Colonne dal basso: l'altezza segue il valore; il numero si scrive solo sulla colonna più alta (le altre nel
// suggerimento e nella tabella).
function columns({ id, title, subtitle, items, describe }) {
	const max = Math.max(1, ...items.map(item => item.count));
	const top = items.reduce((best, item) => (item.count > (best?.count ?? 0) ? item : best), null);
	return `
		<section class="stats-card" aria-labelledby="${id}-title">
			<h2 id="${id}-title" class="stats-card-title">${escapeHtml(title)}</h2>
			${subtitle ? `<p class="help-text">${escapeHtml(subtitle)}</p>` : ''}
			<div class="column-chart" style="--columns: ${items.length}">
				${items.map(item => `
					<div class="column">
						<span class="column-value">${item === top ? item.count : ''}</span>
						<button class="column-bar${item.count ? '' : ' empty'}" type="button" style="--size: ${(item.count / max) * 100}%" data-tip="${escapeHtml(describe(item))}" aria-label="${escapeHtml(describe(item))}"></button>
						<span class="column-label">${escapeHtml(item.label)}</span>
					</div>
				`).join('')}
			</div>
			${table(['', 'Visioni'], items.map(item => [item.tableLabel || item.label, item.count]))}
		</section>
	`;
}

// Barre orizzontali con il nome sopra e il numero in fondo alla barra.
function bars({ id, title, subtitle, items, empty }) {
	const max = Math.max(1, ...items.map(item => item.count));
	return `
		<section class="stats-card" aria-labelledby="${id}-title">
			<h2 id="${id}-title" class="stats-card-title">${escapeHtml(title)}</h2>
			${subtitle ? `<p class="help-text">${escapeHtml(subtitle)}</p>` : ''}
			${items.length ? `
				<ol class="bar-chart">
					${items.map(item => `
						<li>
							<span class="bar-name">${escapeHtml(item.name)}</span>
							<span class="bar-track">
								<button class="bar-fill" type="button" style="--size: ${(item.count / max) * 100}%" data-tip="${escapeHtml(`${item.name}: ${visioni(item.count)}${item.average !== null ? `, media ${formatSpipe(item.average)}` : ''}`)}" aria-label="${escapeHtml(`${item.name}: ${visioni(item.count)}`)}"></button>
								<span class="bar-value">${item.count}</span>
							</span>
						</li>
					`).join('')}
				</ol>
				${table(['', 'Visioni', 'Voto medio'], items.map(item => [item.name, item.count, item.average !== null ? formatSpipe(item.average) : '—']))}
			` : `<p class="help-text">${escapeHtml(empty)}</p>`}
		</section>
	`;
}

export function renderStats(data, { year = '', today, formatDate = value => value }) {
	const stats = computeStats(data, { year, today });
	const years = statsYears(data?.viewings);
	const period = year ? `nel ${year}` : 'in tutto';
	const filter = `
		<div class="stats-filter">
			<label for="stats-year">Periodo</label>
			<select id="stats-year" data-stats-year>
				<option value="">Tutto il diario</option>
				${years.map(value => `<option value="${value}"${value === year ? ' selected' : ''}>${value}</option>`).join('')}
			</select>
		</div>
	`;
	if (!stats.watches && !stats.rated) {
		return `${filter}<div class="empty-state"><p>${year ? `Nel ${escapeHtml(year)} non ci sono visioni nel diario.` : 'Il diario è vuoto: le statistiche arrivano con le prime visioni.'}</p></div>`;
	}
	const monthsSubtitle = year ? '' : 'Gli ultimi 12 mesi.';
	const needsDetails = stats.detailsShare < 1;
	const favourite = stats.favourite;
	return `
		${filter}
		<div class="stat-tiles">
			${tile(stats.watches, `visioni ${period}`, stats.rewatches ? plural(stats.rewatches, 'film rivisto', 'film rivisti') : '')}
			${tile(stats.films, stats.films === 1 ? 'film diverso' : 'film diversi')}
			${stats.series ? tile(stats.episodes, stats.episodes === 1 ? 'episodio' : 'episodi', plural(stats.series, 'serie', 'serie')) : ''}
			${stats.average !== null ? tile(`${Math.floor(stats.average)}${stats.average % 1 ? '½' : ''}`, 'voto medio, in spipe', plural(stats.rated, 'voto', 'voti')) : ''}
			${stats.hours ? tile(`${stats.hours} h`, 'davanti allo schermo', stats.timedWatches < stats.watches ? `contate ${stats.timedWatches} visioni su ${stats.watches}, quelle con la durata` : '') : ''}
		</div>
		${columns({
			id: 'stats-months',
			title: year ? `Visioni per mese, ${year}` : 'Visioni per mese',
			subtitle: monthsSubtitle,
			items: stats.perMonth.map(item => ({ ...item, tableLabel: `${MONTHS[Number(item.key.slice(5)) - 1]} ${item.year}` })),
			describe: item => `${MONTHS[Number(item.key.slice(5)) - 1]} ${item.year}: ${visioni(item.count)}`
		})}
		${!year && stats.perYear.length > 1 ? columns({ id: 'stats-years', title: 'Visioni per anno', items: stats.perYear, describe: item => `${item.label}: ${visioni(item.count)}` }) : ''}
		${stats.rated ? columns({ id: 'stats-ratings', title: 'I tuoi voti', subtitle: 'Quante volte hai dato ogni voto, da 1 a 10 spipe (le mezze vanno con l’intero sopra).', items: stats.ratingBuckets.map(item => ({ ...item, tableLabel: `${item.label} spipe` })), describe: item => `${item.label} ${item.label === '1' ? 'spipa' : 'spipe'}: ${plural(item.count, 'voto', 'voti')}` }) : ''}
		${favourite ? `
			<section class="stats-card stats-favourite" aria-labelledby="stats-favourite-title">
				<h2 id="stats-favourite-title" class="stats-card-title">Il regista che non sbaglia mai</h2>
				<p>${favourite.count
					? `Di <strong>${escapeHtml(favourite.name)}</strong> hai visto ${plural(favourite.films, 'film', 'film')}${favourite.count > favourite.films ? ` (${visioni(favourite.count)})` : ''} ${escapeHtml(period)}${favourite.average !== null ? `, con una media di ${escapeHtml(formatSpipe(favourite.average))}` : ''}.${favourite.rank === 1 ? ' È anche il regista che hai visto di più.' : favourite.rank > 1 ? ` Tra i registi che hai visto di più è al ${favourite.rank}° posto.` : ''}`
					: `Hai detto che <strong>${escapeHtml(favourite.name)}</strong> non sbaglia mai, ma nel diario ${escapeHtml(period === 'in tutto' ? 'non c’è ancora' : `${period} non c’è`)} un suo film${needsDetails ? ' (o la scheda completa che lo dice)' : ''}.`}</p>
			</section>
		` : ''}
		${bars({ id: 'stats-genres', title: 'Generi più visti', subtitle: needsDetails ? 'Solo dai titoli con la scheda completa.' : '', items: stats.genres, empty: 'Servono le schede complete (con la chiave OMDb) per sapere i generi.' })}
		${bars({ id: 'stats-directors', title: 'Registi più visti', subtitle: needsDetails ? 'Solo dai film con la scheda completa.' : '', items: stats.directors, empty: 'Servono le schede complete (con la chiave OMDb) per sapere i registi.' })}
		${stats.best.length ? `
			<section class="stats-card" aria-labelledby="stats-best-title">
				<h2 id="stats-best-title" class="stats-card-title">I voti più alti</h2>
				<ol class="stats-best">
					${stats.best.map(viewing => `<li><span>${escapeHtml(movieName(viewing.movie))}${viewing.label ? ` <span class="diary-label">· ${escapeHtml(viewing.label)}</span>` : ''}</span><span>${escapeHtml(formatSpipe(viewing.rating))} · ${escapeHtml(formatDate(viewing.date))}</span></li>`).join('')}
				</ol>
			</section>
		` : ''}
	`;
}
