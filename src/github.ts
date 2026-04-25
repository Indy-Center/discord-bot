import { Hono } from 'hono';
import { MESSAGES, TAGS } from './config';
import { b64urlEncode, encodeText, hexToBytes, pemToDer, sha256Hex } from './crypto';
import { fetchChannel, patchThread, postMessage } from './discord';

type GitHubEnv = {
	GITHUB_APP_ID: string;
	GITHUB_APP_INSTALLATION_ID: string;
	GITHUB_APP_PRIVATE_KEY: string;
	GITHUB_WEBHOOK_SECRET: string;
};

export type IssuesEventPayload = {
	action: string;
	issue: { number: number; state_reason?: string | null };
	repository: { full_name: string };
};

export const githubApp = new Hono<{ Bindings: Env }>();

githubApp.post('/', async (c) => {
	const sig = c.req.header('x-hub-signature-256');
	const event = c.req.header('x-github-event');
	const body = await c.req.text();

	const ok = await verifyWebhook(body, sig, c.env.GITHUB_WEBHOOK_SECRET);
	if (!ok) return c.body(null, 401);

	if (event === 'issues') {
		const payload = JSON.parse(body) as IssuesEventPayload;
		await handleIssuesEvent(payload, c.env);
	}
	return c.body(null, 200);
});

export async function handleIssuesEvent(payload: IssuesEventPayload, env: Env): Promise<void> {
	if (payload.action !== 'closed') return;

	const key = `issue:${payload.repository.full_name}#${payload.issue.number}`;
	const raw = await env.KV.get(key);
	if (!raw) return;

	let mapping: { thread_id: string; channel_id: string };
	try {
		mapping = JSON.parse(raw);
	} catch {
		console.error('KV value parse failed for key:', key, raw);
		return;
	}

	const notPlanned = payload.issue.state_reason === 'not_planned';
	const closeMessage = notPlanned
		? MESSAGES.ISSUE_CLOSED_NOT_PLANNED
		: MESSAGES.ISSUE_CLOSED_RESOLVED;
	const endTag = notPlanned ? TAGS.NOT_PLANNED : TAGS.DONE;

	try {
		await postMessage(env.DISCORD_BOT_TOKEN, mapping.thread_id, closeMessage);
	} catch (err) {
		console.error('postMessage on issue-close failed:', err);
	}

	let nextTags: string[] = [endTag];
	try {
		const channel = await fetchChannel(env.DISCORD_BOT_TOKEN, mapping.thread_id);
		const current = channel.applied_tags ?? [];
		nextTags = Array.from(new Set([...current.filter((t) => t !== TAGS.TRACKED), endTag]));
	} catch (err) {
		console.error('fetchChannel on issue-close failed:', err);
	}

	try {
		await patchThread(env.DISCORD_BOT_TOKEN, mapping.thread_id, {
			archived: true,
			locked: true,
			applied_tags: nextTags
		});
	} catch (err) {
		console.error('patchThread on issue-close failed:', err);
		return;
	}

	await env.KV.delete(key);
}

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
