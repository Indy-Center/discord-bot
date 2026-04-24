import { encodeText, hexToBytes, b64urlEncode, sha256Hex, pemToDer } from './crypto-utils';

type GitHubEnv = {
	GITHUB_APP_ID: string;
	GITHUB_APP_INSTALLATION_ID: string;
	GITHUB_APP_PRIVATE_KEY: string;
	GITHUB_WEBHOOK_SECRET: string;
};

export async function createIssue(
	env: GitHubEnv,
	args: {
		owner: string;
		repo: string;
		title: string;
		body: string;
		assignees?: string[];
	}
): Promise<{ number: number; html_url: string }> {
	const token = await getInstallationToken(env);
	const issueBody: Record<string, unknown> = {
		title: args.title,
		body: args.body
	};
	if (args.assignees?.length) issueBody.assignees = args.assignees;

	const res = await fetch(`https://api.github.com/repos/${args.owner}/${args.repo}/issues`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'Content-Type': 'application/json',
			'User-Agent': 'indy-center-discord-bot'
		},
		body: JSON.stringify(issueBody)
	});
	if (!res.ok) {
		throw new Error(`createIssue failed: ${res.status} ${await res.text()}`);
	}
	const body = (await res.json()) as { number: number; html_url: string };
	return { number: body.number, html_url: body.html_url };
}

export async function verifyWebhook(
	rawBody: string,
	headerValue: string | null | undefined,
	secret: string
): Promise<boolean> {
	if (!headerValue || !headerValue.startsWith('sha256=')) return false;

	const key = await crypto.subtle.importKey(
		'raw',
		encodeText(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify']
	);

	return crypto.subtle.verify(
		{ name: 'HMAC' },
		key,
		hexToBytes(headerValue.slice('sha256='.length)),
		encodeText(rawBody)
	);
}

// ---- private helpers ----

type CachedToken = { token: string; expiresAt: number };
let cachedInstallationToken: CachedToken | null = null;

type CachedKey = { key: CryptoKey; pemHash: string };
let cachedPrivateKey: CachedKey | null = null;

async function getInstallationToken(env: GitHubEnv): Promise<string> {
	const nowMs = Date.now();
	if (cachedInstallationToken && cachedInstallationToken.expiresAt > nowMs + 60_000) {
		return cachedInstallationToken.token;
	}

	const jwt = await buildAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
	const res = await fetch(
		`https://api.github.com/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${jwt}`,
				Accept: 'application/vnd.github+json',
				'User-Agent': 'indy-center-discord-bot'
			}
		}
	);
	if (!res.ok) {
		throw new Error(`installation token failed: ${res.status} ${await res.text()}`);
	}
	const body = (await res.json()) as { token: string; expires_at: string };
	cachedInstallationToken = {
		token: body.token,
		expiresAt: Date.parse(body.expires_at)
	};
	return body.token;
}

async function buildAppJwt(appId: string, privateKeyPem: string): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const header = { alg: 'RS256', typ: 'JWT' };
	const payload = { iat: now - 60, exp: now + 540, iss: appId };
	const signingInput = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(
		JSON.stringify(payload)
	)}`;
	const key = await importPrivateKey(privateKeyPem);
	const sig = await crypto.subtle.sign(
		{ name: 'RSASSA-PKCS1-v1_5' },
		key,
		encodeText(signingInput)
	);
	return `${signingInput}.${b64urlEncode(new Uint8Array(sig))}`;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
	const pemHash = await sha256Hex(pem);
	if (cachedPrivateKey && cachedPrivateKey.pemHash === pemHash) {
		return cachedPrivateKey.key;
	}

	const key = await crypto.subtle.importKey(
		'pkcs8',
		pemToDer(pem),
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign']
	);
	cachedPrivateKey = { key, pemHash };
	return key;
}
