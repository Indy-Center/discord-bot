import {
	InteractionResponseType,
	MessageFlags,
	Routes,
	type APIInteractionResponseDeferredChannelMessageWithSource,
	type APIMessage,
	type APIThreadChannel,
	type RESTPatchAPIChannelJSONBody,
	type RESTPatchAPIWebhookWithTokenMessageJSONBody,
	type RESTPostAPIChannelMessageJSONBody
} from 'discord-api-types/v10';
import { encodeText, hexToBytes } from './crypto-utils';

const DISCORD_API = 'https://discord.com/api/v10';

export function deferredEphemeralResponse(): APIInteractionResponseDeferredChannelMessageWithSource {
	return {
		type: InteractionResponseType.DeferredChannelMessageWithSource,
		data: { flags: MessageFlags.Ephemeral }
	};
}

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
