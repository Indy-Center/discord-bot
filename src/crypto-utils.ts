export function encodeText(s: string): Uint8Array<ArrayBuffer> {
	return new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
	}
	return bytes;
}

export function b64urlEncode(input: Uint8Array | string): string {
	const bytes = typeof input === 'string' ? encodeText(input) : input;
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(input: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', encodeText(input));
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
	const cleaned = pem
		.replace(/-----BEGIN [^-]+-----/g, '')
		.replace(/-----END [^-]+-----/g, '')
		.replace(/\s+/g, '');
	const binary = atob(cleaned);
	const der = new Uint8Array(new ArrayBuffer(binary.length));
	for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i);
	return der;
}
