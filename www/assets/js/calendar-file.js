// File .ics del prossimo appuntamento, generato nel browser: su iOS e Android apre direttamente il calendario.
// Evento di un giorno intero (DTSTART;VALUE=DATE), perché l'appuntamento non ha un orario.

const escapeIcsText = value => String(value)
	.replace(/\\/g, '\\\\')
	.replace(/;/g, '\\;')
	.replace(/,/g, '\\,')
	.replace(/\r?\n/g, '\\n');

// Le righe più lunghe di 75 byte vanno spezzate, con uno spazio all'inizio della continuazione (RFC 5545).
function foldIcsLine(line) {
	const encoder = new TextEncoder();
	const parts = [];
	let current = '';
	for (const character of line) {
		if (encoder.encode(current + character).length > (parts.length ? 74 : 75)) {
			parts.push(current);
			current = '';
		}
		current += character;
	}
	parts.push(current);
	return parts.join('\r\n ');
}

const compactDate = isoDate => isoDate.replaceAll('-', '');

function nextDay(isoDate) {
	const date = new Date(`${isoDate}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

export function buildMeetingIcs(meeting, movieName, now = new Date()) {
	if (!meeting?.date) return '';
	const titles = (meeting.movies || []).map(movieName);
	const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//myCimmena//Serata//IT',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:serata-${compactDate(meeting.date)}@mycimmena.app`,
		`DTSTAMP:${stamp}`,
		`DTSTART;VALUE=DATE:${compactDate(meeting.date)}`,
		`DTEND;VALUE=DATE:${compactDate(nextDay(meeting.date))}`,
		`SUMMARY:${escapeIcsText('Serata film · myCimmena')}`,
		...(meeting.place ? [`LOCATION:${escapeIcsText(meeting.place)}`] : []),
		...(titles.length ? [`DESCRIPTION:${escapeIcsText(`In programma:\n${titles.join('\n')}`)}`] : []),
		'END:VEVENT',
		'END:VCALENDAR'
	];
	return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

export function downloadMeetingIcs(meeting, movieName) {
	const content = buildMeetingIcs(meeting, movieName);
	if (!content) return false;
	const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
	const link = document.createElement('a');
	link.href = url;
	link.download = `cineforum-${meeting.date}.ics`;
	document.body.append(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
	return true;
}
