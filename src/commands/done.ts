import { TAGS, hasRouteForChannel } from '../config';
import { patchThread, postMessage } from '../discord';
import { parseThreadContext, reply, type Command } from './command';

export const done: Command = {
	name: 'done',
	description: 'Marks a request as complete and closes the post.',
	default_member_permissions: '8',
	async handle(interaction, env) {
		const ctx = await parseThreadContext(interaction, 'done');
		if (!ctx) return;

		if (!hasRouteForChannel(ctx.parentId)) {
			await reply(interaction, "This forum isn't managed by the bot.");
			return;
		}

		if (ctx.appliedTags.includes(TAGS.DONE)) {
			await reply(interaction, 'This request is already marked done.');
			return;
		}
		if (ctx.appliedTags.includes(TAGS.NOT_PLANNED)) {
			await reply(interaction, 'This request was already closed.');
			return;
		}

		const newTags = Array.from(
			new Set([...ctx.appliedTags.filter((t) => t !== TAGS.TRACKED), TAGS.DONE])
		);

		try {
			await postMessage(
				env.DISCORD_BOT_TOKEN,
				ctx.threadId,
				'This request has been resolved. Thanks for your contribution!'
			);
			await patchThread(env.DISCORD_BOT_TOKEN, ctx.threadId, {
				archived: true,
				locked: true,
				applied_tags: newTags
			});
			await reply(interaction, '✅ Marked done');
		} catch (err) {
			console.error('done handle error:', err);
			await reply(interaction, `❌ ${(err as Error).message}`);
		}
	}
};
