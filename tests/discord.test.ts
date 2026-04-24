import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	deferredEphemeralResponse,
	editOriginalResponse,
	patchThread,
	postMessage,
	verifySignature
} from '../src/discord';

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

describe('deferredEphemeralResponse', () => {
	it('returns type 5 with ephemeral flag', () => {
		expect(deferredEphemeralResponse()).toEqual({ type: 5, data: { flags: 64 } });
	});
});

describe('verifySignature', () => {
	it('returns true for a signature made with the matching key', async () => {
		const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
			'sign',
			'verify'
		])) as CryptoKeyPair;
		const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
		const timestamp = '1234567890';
		const body = '{"type":1}';
		const sig = new Uint8Array(
			await crypto.subtle.sign(
				{ name: 'Ed25519' },
				keyPair.privateKey,
				new TextEncoder().encode(timestamp + body)
			)
		);

		expect(await verifySignature(body, bytesToHex(sig), timestamp, bytesToHex(publicKeyRaw))).toBe(
			true
		);
	});

	it('returns false when the body has been tampered with', async () => {
		const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
			'sign',
			'verify'
		])) as CryptoKeyPair;
		const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
		const timestamp = '1234567890';
		const sig = new Uint8Array(
			await crypto.subtle.sign(
				{ name: 'Ed25519' },
				keyPair.privateKey,
				new TextEncoder().encode(timestamp + '{"type":1}')
			)
		);

		expect(
			await verifySignature('{"type":2}', bytesToHex(sig), timestamp, bytesToHex(publicKeyRaw))
		).toBe(false);
	});
});

describe('fetch-based helpers', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('postMessage sends a POST with bot auth and JSON body', async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
		await postMessage('token', '123', 'hello');

		expect(fetch).toHaveBeenCalledOnce();
		const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://discord.com/api/v10/channels/123/messages');
		expect(init.method).toBe('POST');
		expect((init.headers as Record<string, string>).Authorization).toBe('Bot token');
		expect(JSON.parse(init.body as string)).toEqual({ content: 'hello' });
	});

	it('postMessage throws on non-ok response', async () => {
		vi.mocked(fetch).mockResolvedValue(new Response('boom', { status: 500 }));
		await expect(postMessage('token', '123', 'hi')).rejects.toThrow(/postMessage failed: 500 boom/);
	});

	it('patchThread truncates name to 100 characters', async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
		await patchThread('token', '123', { name: 'x'.repeat(150) });

		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.name).toHaveLength(100);
	});

	it('editOriginalResponse swallows non-ok responses', async () => {
		vi.mocked(fetch).mockResolvedValue(new Response('err', { status: 404 }));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(editOriginalResponse('app', 'token', 'content')).resolves.toBeUndefined();
		expect(consoleError).toHaveBeenCalled();

		consoleError.mockRestore();
	});
});
