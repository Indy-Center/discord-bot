import { describe, expect, it } from 'vitest';
import { b64urlEncode, encodeText, hexToBytes } from '../src/crypto';

describe('hexToBytes', () => {
	it('decodes a lowercase hex string', () => {
		const bytes = hexToBytes('deadbeef');
		expect(Array.from(bytes)).toEqual([0xde, 0xad, 0xbe, 0xef]);
	});

	it('produces an empty array for an empty string', () => {
		expect(hexToBytes('').length).toBe(0);
	});
});

describe('b64urlEncode', () => {
	it('encodes a string with URL-safe characters and no padding', () => {
		// Standard base64 of '???' is "Pz8/" — URL-safe replaces "/" with "_" and strips "=".
		expect(b64urlEncode('???')).toBe('Pz8_');
	});

	it('replaces + with - in URL-safe output', () => {
		// Bytes [0xfb, 0xff] encode to "+/8=" in standard base64.
		expect(b64urlEncode(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
	});

	it('round-trips with encodeText', () => {
		expect(b64urlEncode(encodeText('hello'))).toBe('aGVsbG8');
	});
});
