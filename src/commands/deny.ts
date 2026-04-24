import { TAGS, hasRouteForChannel } from '../config';
import { patchThread, postMessage } from '../discord';
import { parseThreadContext, reply, statusOfThread, type Command } from './command';

export const deny: Command = {
	name: 'deny',
	description: 'Denies a request and closes the post.',
	default_member_permissions: '8',
	async handle(interaction, env) {
		const ctx = await parseThreadContext(interaction, 'deny');
		if (!ctx) return;

		const existingState = statusOfThread(ctx.appliedTags);
		if (existingState) {
			await reply(interaction, existingState);
			return;
		}

		if (!hasRouteForChannel(ctx.parentId)) {
			await reply(interaction, "This forum isn't managed by the bot.");
			return;
		}

		const newTags = Array.from(new Set([...ctx.appliedTags, TAGS.NOT_PLANNED]));

		try {
			await postMessage(
				env.DISCORD_BOT_TOKEN,
				ctx.threadId,
				"Sorry, but it doesn't look like your request will be accepted at this time. Feel free to reach out to a member of the Indy Center Tech Team."
			);
			await patchThread(env.DISCORD_BOT_TOKEN, ctx.threadId, {
				archived: true,
				locked: true,
				applied_tags: newTags
			});
			await reply(interaction, '✅ Denied');
		} catch (err) {
			console.error('deny handle error:', err);
			await reply(interaction, `❌ ${(err as Error).message}`);
		}
	}
};
