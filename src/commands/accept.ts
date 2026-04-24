import type { APIMessage } from 'discord-api-types/v10';
import { DEFAULT_ASSIGNEES, TAGS, matchRoute } from '../config';
import { fetchMessage, fetchMessagesAfter, patchThread, postMessage } from '../discord';
import { createIssue } from '../github';
import { parseThreadContext, reply, statusOfThread, type Command } from './command';

// REST fetches in guild channels return message.member, but APIMessage doesn't type it.
type GuildMessage = APIMessage & { member?: { nick?: string | null } };

export const accept: Command = {
	name: 'accept',
	description: 'Accepts a request and routes it to the appropriate platform.',
	default_member_permissions: '8',
	async handle(interaction, env) {
		const ctx = await parseThreadContext(interaction, 'accept');
		if (!ctx) return;

		const existingState = statusOfThread(ctx.appliedTags);
		if (existingState) {
			await reply(interaction, existingState);
			return;
		}

		const route = matchRoute(ctx.parentId, ctx.appliedTags);
		if (!route) {
			await reply(interaction, 'No route configured for this channel/tags.');
			return;
		}

		let starter: APIMessage;
		try {
			// In forum threads the starter message ID equals the thread ID.
			starter = await fetchMessage(env.DISCORD_BOT_TOKEN, ctx.threadId, ctx.threadId);
		} catch (err) {
			console.error('fetchMessage error:', err);
			await reply(interaction, "❌ Couldn't read post");
			return;
		}

		let replies: APIMessage[] = [];
		try {
			const raw = await fetchMessagesAfter(env.DISCORD_BOT_TOKEN, ctx.threadId, ctx.threadId, 10);
			replies = raw.filter((m) => !m.author.bot && m.content.trim() !== '');
		} catch (err) {
			// Non-fatal — we can still file the issue without replies.
			console.error('fetchMessagesAfter error:', err);
		}

		const threadUrl = `https://discord.com/channels/${ctx.guildId}/${ctx.threadId}`;
		const issueBody = buildIssueBody({ starter, replies, threadUrl });

		let issue: { number: number; html_url: string };
		try {
			issue = await createIssue(env, {
				owner: route.owner,
				repo: route.repo,
				title: ctx.threadName,
				body: issueBody,
				assignees: DEFAULT_ASSIGNEES
			});
		} catch (err) {
			console.error('createIssue error:', err);
			await reply(interaction, `❌ GitHub error: ${(err as Error).message}`);
			return;
		}

		const kvKey = `issue:${route.owner}/${route.repo}#${issue.number}`;
		try {
			await env.KV.put(
				kvKey,
				JSON.stringify({ thread_id: ctx.threadId, channel_id: ctx.parentId })
			);
		} catch (err) {
			// Log and continue — issue is live; we lose auto-close for this one.
			console.error('KV put error:', err);
		}

		const publicMessage = route.private
			? "Thanks for the report! We've accepted this request and it's being tracked internally. This thread will automatically close when the work is complete."
			: `Thanks for the report! We've accepted this request and it's being tracked at ${issue.html_url}. This thread will automatically close when the issue is resolved.`;

		try {
			await postMessage(env.DISCORD_BOT_TOKEN, ctx.threadId, publicMessage);
		} catch (err) {
			console.error('postMessage error:', err);
		}

		const newTags = Array.from(new Set([...ctx.appliedTags, TAGS.TRACKED]));
		try {
			await patchThread(env.DISCORD_BOT_TOKEN, ctx.threadId, {
				applied_tags: newTags
			});
		} catch (err) {
			console.error('patchThread (tracked tag) error:', err);
		}

		await reply(interaction, `✅ Created ${issue.html_url}`);
	}
};

function buildIssueBody(params: {
	starter: APIMessage;
	replies: APIMessage[];
	threadUrl: string;
}): string {
	const parts: string[] = [];

	parts.push(`## Request from ${displayName(params.starter)}`);
	parts.push('');
	parts.push(quote(params.starter.content || '_(no message content)_'));

	if (params.replies.length) {
		parts.push('');
		parts.push('## Replies');
		for (const msg of params.replies) {
			parts.push('');
			parts.push(`**${displayName(msg)}:**`);
			parts.push(quote(msg.content));
		}
	}

	parts.push('');
	parts.push('---');
	parts.push(`Submitted via [Discord](${params.threadUrl})`);

	return parts.join('\n');
}

function displayName(msg: GuildMessage): string {
	return msg.member?.nick || msg.author.global_name || msg.author.username;
}

function quote(text: string): string {
	return text
		.split('\n')
		.map((l) => `> ${l}`)
		.join('\n');
}
