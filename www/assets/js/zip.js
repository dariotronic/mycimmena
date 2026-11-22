// Lettore minimo di file .zip (PIANO.md, §9): serve solo a prendere watchlist.csv dall'esportazione di Letterboxd.
// Legge l'indice centrale dello zip e decomprime con DecompressionStream('deflate-raw'), già presente nella
// WebView (Chromium 103+) e in Node: niente librerie esterne.

const SIGNATURE_END = 0x06054b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_LOCAL = 0x04034b50;

export const isZip = bytes => bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

// Elenco dei file nello zip: { name, method, compressedSize, size, offset }.
export function zipEntries(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	// Il record finale sta negli ultimi 22 byte, più un eventuale commento (al massimo 65535 byte).
	let end = -1;
	for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i -= 1) {
		if (view.getUint32(i, true) === SIGNATURE_END) { end = i; break; }
	}
	if (end < 0) throw new Error('Il file .zip è rovinato o incompleto.');
	const count = view.getUint16(end + 10, true);
	let pointer = view.getUint32(end + 16, true);
	const decoder = new TextDecoder();
	const entries = [];
	for (let n = 0; n < count; n += 1) {
		if (pointer + 46 > bytes.length || view.getUint32(pointer, true) !== SIGNATURE_CENTRAL) throw new Error('Il file .zip è rovinato o incompleto.');
		const nameLength = view.getUint16(pointer + 28, true);
		const extraLength = view.getUint16(pointer + 30, true);
		const commentLength = view.getUint16(pointer + 32, true);
		entries.push({
			name: decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength)),
			method: view.getUint16(pointer + 10, true),
			compressedSize: view.getUint32(pointer + 20, true),
			size: view.getUint32(pointer + 24, true),
			offset: view.getUint32(pointer + 42, true)
		});
		pointer += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}

// Contenuto di un file dello zip, come byte.
export async function readZipEntry(bytes, entry) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(entry.offset, true) !== SIGNATURE_LOCAL) throw new Error('Il file .zip è rovinato o incompleto.');
	const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
	const data = bytes.subarray(start, start + entry.compressedSize);
	if (entry.method === 0) return data;
	if (entry.method !== 8) throw new Error('Il file .zip usa una compressione che myCimmena non sa leggere.');
	const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}
