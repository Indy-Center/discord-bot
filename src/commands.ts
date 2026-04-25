import {
	PermissionFlagsBits,
	type APIApplicationCommandInteraction,
	type APIMessage
} from 'discord-api-types/v10';
import {
	DEFAULT_ASSIGNEES,
	MESSAGES,
	TAGS,
	fmt,
	hasRouteForChannel,
	matchRoute,
	statusOfThread
} from './config';
import {
	fetchMessage,
	fetchMessagesAfter,
	parseThreadContext,
	patchThread,
	postMessage,
	reply
} from './discord';
import { createIssue } from './github';

export type Command = {
	name: string;
	description: string;
	default_member_permissions: string;
	handle: (interaction: APIApplicationCommandInteraction, env: Env) => Promise<void>;
};

type GuildMessage = APIMessage & { member?: { nick?: string | null } };

export const accept: Command = {
	name: 'accept',
	description: 'Accepts a request and routes it to the appropriate platform.',
	default_member_permissions: PermissionFlagsBits.Administrator.toString(),
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
			await reply(interaction, MESSAGES.NO_ROUTE);
			return;
		}

		let starter: APIMessage;
		try {
			starter = await fetchMessage(env.DISCORD_BOT_TOKEN, ctx.threadId, ctx.threadId);
		} catch (err) {
			console.error('fetchMessage error:', err);
			await reply(interaction, MESSAGES.READ_POST_FAIL);
			return;
		}

		let replies: APIMessage[] = [];
		try {
			const raw = await fetchMessagesAfter(env.DISCORD_BOT_TOKEN, ctx.threadId, ctx.threadId, 10);
			replies = raw.filter((m) => !m.author.bot && m.content.trim() !== '');
		} catch (err) {
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
			await reply(interaction, fmt(MESSAGES.GITHUB_ERROR, { message: (err as Error).message }));
			return;
		}

		const kvKey = `issue:${route.owner}/${route.repo}#${issue.number}`;
		try {
			await env.KV.put(
				kvKey,
				JSON.stringify({ thread_id: ctx.threadId, channel_id: ctx.parentId })
			);
		} catch (err) {
			console.error('KV put error:', err);
		}

		const publicMessage = route.private
			? MESSAGES.ACCEPT_PUBLIC_PRIVATE
			: fmt(MESSAGES.ACCEPT_PUBLIC_OPEN, { issueUrl: issue.html_url });

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

		const adminMessage = route.private
			? fmt(MESSAGES.ACCEPT_ADMIN_PRIVATE, { issueUrl: issue.html_url })
			: MESSAGES.ACCEPT_ADMIN_OPEN;
		await reply(interaction, adminMessage);
	}
};

export const deny: Command = {
	name: 'deny',
	description: 'Denies a request and closes the post.',
	default_member_permissions: PermissionFlagsBits.Administrator.toString(),
	async handle(interaction, env) {
		const ctx = await parseThreadContext(interaction, 'deny');
		if (!ctx) return;

		const existingState = statusOfThread(ctx.appliedTags);
		if (existingState) {
			await reply(interaction, existingState);
			return;
		}

		if (!hasRouteForChannel(ctx.parentId)) {
			await reply(interaction, MESSAGES.NOT_MANAGED);
			return;
		}

		const newTags = Array.from(new Set([...ctx.appliedTags, TAGS.NOT_PLANNED]));

		try {
			await postMessage(env.DISCORD_BOT_TOKEN, ctx.threadId, MESSAGES.DENY_PUBLIC);
			await patchThread(env.DISCORD_BOT_TOKEN, ctx.threadId, {
				archived: true,
				locked: true,
				applied_tags: newTags
			});
			await reply(interaction, MESSAGES.DENY_ADMIN);
		} catch (err) {
			console.error('deny handle error:', err);
			await reply(interaction, fmt(MESSAGES.GENERIC_ERROR, { message: (err as Error).message }));
		}
	}
};

export const done: Command = {
	name: 'done',
	description: 'Marks a request as complete and closes the post.',
	default_member_permissions: PermissionFlagsBits.Administrator.toString(),
	async handle(interaction, env) {
		const ctx = await parseThreadContext(interaction, 'done');
		if (!ctx) return;

		if (!hasRouteForChannel(ctx.parentId)) {
			await reply(interaction, MESSAGES.NOT_MANAGED);
			return;
		}

		if (ctx.appliedTags.includes(TAGS.DONE)) {
			await reply(interaction, MESSAGES.ALREADY_DONE);
			return;
		}
		if (ctx.appliedTags.includes(TAGS.NOT_PLANNED)) {
			await reply(interaction, MESSAGES.ALREADY_CLOSED);
			return;
		}

		const newTags = Array.from(
			new Set([...ctx.appliedTags.filter((t) => t !== TAGS.TRACKED), TAGS.DONE])
		);

		try {
			await postMessage(env.DISCORD_BOT_TOKEN, ctx.threadId, MESSAGES.DONE_PUBLIC);
			await patchThread(env.DISCORD_BOT_TOKEN, ctx.threadId, {
				archived: true,
				locked: true,
				applied_tags: newTags
			});
			await reply(interaction, MESSAGES.DONE_ADMIN);
		} catch (err) {
			console.error('done handle error:', err);
			await reply(interaction, fmt(MESSAGES.GENERIC_ERROR, { message: (err as Error).message }));
		}
	}
};

export const COMMANDS: Record<string, Command> = { accept, deny, done };

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
