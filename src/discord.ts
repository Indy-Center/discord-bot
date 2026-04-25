import { Hono } from 'hono';
import {
	InteractionResponseType,
	InteractionType,
	MessageFlags,
	Routes,
	type APIApplicationCommandInteraction,
	type APIInteraction,
	type APIInteractionGuildMember,
	type APIInteractionResponseDeferredChannelMessageWithSource,
	type APIMessage,
	type APIThreadChannel,
	type RESTPatchAPIChannelJSONBody,
	type RESTPatchAPIWebhookWithTokenMessageJSONBody,
	type RESTPostAPIChannelMessageJSONBody
} from 'discord-api-types/v10';
import { COMMANDS } from './commands';
import { MESSAGES, fmt } from './config';
import { encodeText, hexToBytes } from './crypto';

export type ThreadContext = {
	threadId: string;
	parentId: string;
	guildId: string;
	threadName: string;
	appliedTags: string[];
	member: APIInteractionGuildMember | undefined;
};

const DISCORD_API = 'https://discord.com/api/v10';

export const discordApp = new Hono<{ Bindings: Env }>();

discordApp.post('/', async (c) => {
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

export async function verifySignature(
	rawBody: string,
	signatureHex: string,
	timestamp: string,
	publicKeyHex: string
): Promise<boolean> {
	const message = encodeText(timestamp + rawBody);
	const signature = hexToBytes(signatureHex);
	const publicKey = hexToBytes(publicKeyHex);

	const key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, [
		'verify'
	]);
	return crypto.subtle.verify({ name: 'Ed25519' }, key, signature, message);
}

export function deferredEphemeralResponse(): APIInteractionResponseDeferredChannelMessageWithSource {
	return {
		type: InteractionResponseType.DeferredChannelMessageWithSource,
		data: { flags: MessageFlags.Ephemeral }
	};
}

export async function parseThreadContext(
	interaction: APIApplicationCommandInteraction,
	commandName: string
): Promise<ThreadContext | null> {
	const threadId = interaction.channel?.id;
	const parentId =
		interaction.channel && 'parent_id' in interaction.channel
			? interaction.channel.parent_id
			: undefined;
	const guildId = interaction.guild_id;
	if (!threadId || !parentId || !guildId) {
		await reply(interaction, fmt(MESSAGES.NOT_IN_FORUM, { commandName }));
		return null;
	}
	const channel = interaction.channel;
	const threadName =
		channel && 'name' in channel ? (channel.name ?? 'Untitled request') : 'Untitled request';
	const appliedTags = channel && 'applied_tags' in channel ? (channel.applied_tags ?? []) : [];
	return {
		threadId,
		parentId,
		guildId,
		threadName,
		appliedTags,
		member: interaction.member
	};
}

export async function reply(
	interaction: APIApplicationCommandInteraction,
	content: string
): Promise<void> {
	await editOriginalResponse(interaction.application_id, interaction.token, content);
}

export async function postMessage(
	botToken: string,
	channelId: string,
	content: string
): Promise<void> {
	const body: RESTPostAPIChannelMessageJSONBody = { content };
	const res = await fetch(`${DISCORD_API}${Routes.channelMessages(channelId)}`, {
		method: 'POST',
		headers: {
			Authorization: `Bot ${botToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		throw new Error(`postMessage failed: ${res.status} ${await res.text()}`);
	}
}

export async function patchThread(
	botToken: string,
	threadId: string,
	fields: Pick<RESTPatchAPIChannelJSONBody, 'archived' | 'locked' | 'name' | 'applied_tags'>
): Promise<void> {
	const body: RESTPatchAPIChannelJSONBody = { ...fields };
	if (fields.name) body.name = fields.name.slice(0, 100);

	const res = await fetch(`${DISCORD_API}${Routes.channel(threadId)}`, {
		method: 'PATCH',
		headers: {
			Authorization: `Bot ${botToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		throw new Error(`patchThread failed: ${res.status} ${await res.text()}`);
	}
}

export async function fetchMessage(
	botToken: string,
	channelId: string,
	messageId: string
): Promise<APIMessage> {
	const res = await fetch(`${DISCORD_API}${Routes.channelMessage(channelId, messageId)}`, {
		headers: { Authorization: `Bot ${botToken}` }
	});
	if (!res.ok) {
		throw new Error(`fetchMessage failed: ${res.status} ${await res.text()}`);
	}
	return (await res.json()) as APIMessage;
}

/**
 * Fetches messages after the given message ID (i.e., thread replies).
 * Discord returns newest-first; we reverse to chronological.
 */
export async function fetchMessagesAfter(
	botToken: string,
	channelId: string,
	afterMessageId: string,
	limit: number
): Promise<APIMessage[]> {
	const res = await fetch(
		`${DISCORD_API}${Routes.channelMessages(channelId)}?after=${afterMessageId}&limit=${limit}`,
		{ headers: { Authorization: `Bot ${botToken}` } }
	);
	if (!res.ok) {
		throw new Error(`fetchMessagesAfter failed: ${res.status} ${await res.text()}`);
	}
	const messages = (await res.json()) as APIMessage[];
	return messages.reverse();
}

export async function fetchChannel(botToken: string, channelId: string): Promise<APIThreadChannel> {
	const res = await fetch(`${DISCORD_API}${Routes.channel(channelId)}`, {
		headers: { Authorization: `Bot ${botToken}` }
	});
	if (!res.ok) {
		throw new Error(`fetchChannel failed: ${res.status} ${await res.text()}`);
	}
	return (await res.json()) as APIThreadChannel;
}

export async function editOriginalResponse(
	applicationId: string,
	interactionToken: string,
	content: string
): Promise<void> {
	const body: RESTPatchAPIWebhookWithTokenMessageJSONBody = { content };
	const res = await fetch(
		`${DISCORD_API}${Routes.webhookMessage(applicationId, interactionToken, '@original')}`,
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}
	);
	if (!res.ok) {
		console.error(`editOriginalResponse failed: ${res.status} ${await res.text()}`);
	}
}
