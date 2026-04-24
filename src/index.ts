import { Hono } from 'hono';
import {
	InteractionResponseType,
	InteractionType,
	MessageFlags,
	type APIInteraction
} from 'discord-api-types/v10';
import {
	verifySignature,
	patchThread,
	postMessage,
	fetchChannel,
	deferredEphemeralResponse
} from './discord';
import { COMMANDS } from './commands';
import { verifyWebhook } from './github';
import { TAGS } from './config';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('discord-bot ok'));

app.post('/discord', async (c) => {
	const sig = c.req.header('x-signature-ed25519');
	const ts = c.req.header('x-signature-timestamp');
	const body = await c.req.text();

	if (!sig || !ts) return c.body(null, 401);

	const ok = await verifySignature(body, sig, ts, c.env.DISCORD_PUBLIC_KEY);
	if (!ok) return c.body(null, 401);

	const interaction = JSON.parse(body) as APIInteraction;

	if (interaction.type === InteractionType.Ping) {
		return c.json({ type: InteractionResponseType.Pong });
	}

	if (interaction.type === InteractionType.ApplicationCommand) {
		const name = interaction.data?.name;
		const cmd = name ? COMMANDS[name] : undefined;
		if (!cmd) {
			return c.json({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: { content: 'Unknown command', flags: MessageFlags.Ephemeral }
			});
		}
		c.executionCtx.waitUntil(cmd.handle(interaction, c.env));
		return c.json(deferredEphemeralResponse());
	}

	return c.body(null, 400);
});

app.post('/github', async (c) => {
	const sig = c.req.header('x-hub-signature-256');
	const event = c.req.header('x-github-event');
	const body = await c.req.text();

	const ok = await verifyWebhook(body, sig, c.env.GITHUB_WEBHOOK_SECRET);
	if (!ok) return c.body(null, 401);

	if (event !== 'issues') return c.body(null, 200);

	const payload = JSON.parse(body) as {
		action: string;
		issue: { number: number; state_reason?: string | null };
		repository: { full_name: string };
	};

	if (payload.action !== 'closed') return c.body(null, 200);

	const key = `issue:${payload.repository.full_name}#${payload.issue.number}`;
	const raw = await c.env.KV.get(key);
	if (!raw) return c.body(null, 200);

	let mapping: { thread_id: string; channel_id: string };
	try {
		mapping = JSON.parse(raw);
	} catch {
		console.error('KV value parse failed for key:', key, raw);
		return c.body(null, 200);
	}

	const notPlanned = payload.issue.state_reason === 'not_planned';
	const closeMessage = notPlanned
		? "This request was closed as not planned. Feel free to reach out to a member of the Indy Center Tech Team if you'd like to discuss."
		: 'This request has been resolved. Thanks for your contribution!';
	const endTag = notPlanned ? TAGS.NOT_PLANNED : TAGS.DONE;

	try {
		await postMessage(c.env.DISCORD_BOT_TOKEN, mapping.thread_id, closeMessage);
	} catch (err) {
		console.error('postMessage on issue-close failed:', err);
	}

	let nextTags: string[] = [endTag];
	try {
		const channel = await fetchChannel(c.env.DISCORD_BOT_TOKEN, mapping.thread_id);
		const current = channel.applied_tags ?? [];
		nextTags = Array.from(new Set([...current.filter((t) => t !== TAGS.TRACKED), endTag]));
	} catch (err) {
		console.error('fetchChannel on issue-close failed:', err);
	}

	try {
		await patchThread(c.env.DISCORD_BOT_TOKEN, mapping.thread_id, {
			archived: true,
			locked: true,
			applied_tags: nextTags
		});
	} catch (err) {
		console.error('patchThread on issue-close failed:', err);
		return c.body(null, 200);
	}

	await c.env.KV.delete(key);
	return c.body(null, 200);
});

export default app;
