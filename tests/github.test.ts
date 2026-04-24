import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIssue, verifyWebhook } from '../src/github';

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
	return bytesToHex(sig);
}

async function generateRsaPem(): Promise<string> {
	const keyPair = (await crypto.subtle.generateKey(
		{
			name: 'RSASSA-PKCS1-v1_5',
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: 'SHA-256'
		},
		true,
		['sign', 'verify']
	)) as CryptoKeyPair;
	const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
	let binary = '';
	for (const b of pkcs8) binary += String.fromCharCode(b);
	const b64 = btoa(binary);
	const wrapped = b64.match(/.{1,64}/g)!.join('\n');
	return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

describe('verifyWebhook', () => {
	it('returns true for a valid sha256= signature', async () => {
		const secret = 'my-secret';
		const body = '{"action":"closed"}';
		const sigHex = await hmacSha256Hex(secret, body);

		expect(await verifyWebhook(body, `sha256=${sigHex}`, secret)).toBe(true);
	});

	it('returns false for a tampered body', async () => {
		const secret = 'my-secret';
		const sigHex = await hmacSha256Hex(secret, '{"action":"closed"}');

		expect(await verifyWebhook('{"action":"opened"}', `sha256=${sigHex}`, secret)).toBe(false);
	});

	it('returns false for a missing header', async () => {
		expect(await verifyWebhook('body', null, 'secret')).toBe(false);
		expect(await verifyWebhook('body', undefined, 'secret')).toBe(false);
	});

	it('returns false for a non-sha256 prefix', async () => {
		expect(await verifyWebhook('body', 'sha1=abc123', 'secret')).toBe(false);
	});
});

describe('createIssue', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('fetches an installation token then creates the issue', async () => {
		const pem = await generateRsaPem();
		const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

		vi.mocked(fetch).mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/access_tokens')) {
				return new Response(JSON.stringify({ token: 'install-token', expires_at: expiresAt }), {
					status: 200
				});
			}
			if (url.endsWith('/issues')) {
				return new Response(
					JSON.stringify({ number: 42, html_url: 'https://github.com/foo/bar/issues/42' }),
					{ status: 201 }
				);
			}
			throw new Error(`unexpected url: ${url}`);
		});

		const issue = await createIssue(
			{
				GITHUB_APP_ID: 'test-app',
				GITHUB_APP_INSTALLATION_ID: 'test-install',
				GITHUB_APP_PRIVATE_KEY: pem,
				GITHUB_WEBHOOK_SECRET: 'unused'
			},
			{
				owner: 'foo',
				repo: 'bar',
				title: 'Hi',
				body: 'the body',
				assignees: ['alice']
			}
		);

		expect(issue).toEqual({ number: 42, html_url: 'https://github.com/foo/bar/issues/42' });

		const issueCall = vi
			.mocked(fetch)
			.mock.calls.find(([u]) => (typeof u === 'string' ? u : u.toString()).endsWith('/issues'));
		expect(issueCall).toBeDefined();
		const [, init] = issueCall as [string, RequestInit];
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer install-token');
		expect(JSON.parse(init.body as string)).toEqual({
			title: 'Hi',
			body: 'the body',
			assignees: ['alice']
		});
	});
});
