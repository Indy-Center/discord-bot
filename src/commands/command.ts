import type {
	APIApplicationCommandInteraction,
	APIInteractionGuildMember
} from 'discord-api-types/v10';
import { TAGS } from '../config';
import { editOriginalResponse } from '../discord';

export type Command = {
	name: string;
	description: string;
	default_member_permissions: string;
	handle: (interaction: APIApplicationCommandInteraction, env: Env) => Promise<void>;
};

export type ThreadContext = {
	threadId: string;
	parentId: string;
	guildId: string;
	threadName: string;
	appliedTags: string[];
	member: APIInteractionGuildMember | undefined;
};

export async function reply(
	interaction: APIApplicationCommandInteraction,
	content: string
): Promise<void> {
	await editOriginalResponse(interaction.application_id, interaction.token, content);
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
		await reply(interaction, `❌ /${commandName} must be run inside a forum thread.`);
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

export function statusOfThread(appliedTags: string[]): string | null {
	if (appliedTags.includes(TAGS.TRACKED)) {
		return 'This request has already been accepted.';
	}
	if (appliedTags.includes(TAGS.DONE)) {
		return 'This request has already been resolved.';
	}
	if (appliedTags.includes(TAGS.NOT_PLANNED)) {
		return 'This request was already closed.';
	}
	return null;
}
