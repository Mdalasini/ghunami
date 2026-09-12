import { deflateSync } from 'node:zlib';

function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of data) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) {
			const mask = -(crc & 1);
			crc = (crc >>> 1) ^ (0xedb88320 & mask);
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const checksum = Buffer.alloc(4);
	checksum.writeUInt32BE(crc32(typeAndData));
	return Buffer.concat([length, typeAndData, checksum]);
}

export function pngFromPixels(
	width: number,
	height: number,
	colorAt: (x: number, y: number) => readonly [number, number, number]
): Buffer {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;

	const stride = 1 + width * 3;
	const raw = Buffer.alloc(stride * height);
	for (let y = 0; y < height; y += 1) {
		const row = y * stride;
		raw[row] = 0;
		for (let x = 0; x < width; x += 1) {
			const pixel = row + 1 + x * 3;
			const rgb = colorAt(x, y);
			raw[pixel] = rgb[0];
			raw[pixel + 1] = rgb[1];
			raw[pixel + 2] = rgb[2];
		}
	}

	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	return Buffer.concat([
		signature,
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0))
	]);
}

export function solidPng(
	width: number,
	height: number,
	rgb: readonly [number, number, number] = [21, 128, 61]
): Buffer {
	return pngFromPixels(width, height, () => rgb);
}

export function bandedPng(
	width: number,
	height: number,
	top: readonly [number, number, number],
	bottom: readonly [number, number, number]
): Buffer {
	const split = Math.floor(height / 2);
	return pngFromPixels(width, height, (_x, y) => (y < split ? top : bottom));
}
