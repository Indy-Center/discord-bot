export type Route = {
	// Parent forum channel ID. Routes are scoped to a forum channel.
	channel_id: string;
	// Optional tag filter. If set, ALL listed tag IDs must be applied to the post.
	// Omitted or empty = match any post in the channel.
	tags?: string[];
	owner: string;
	repo: string;
	// When true, the visible Discord message omits the issue URL — users in the
	// thread can't access the repo anyway. Admin ephemeral still includes it.
	private?: boolean;
};

// tech-feedback forum: 1419149970556194907
const TECH_FEEDBACK = '1419149970556194907';

// Default assignees applied to every issue the bot creates.
export const DEFAULT_ASSIGNEES = ['cr0wst'];

// Status tags (moderator-only) applied to forum threads as they progress.
export const TAGS = {
	TRACKED: '1497077028267102300',
	DONE: '1462956741569286431',
	NOT_PLANNED: '1497077455058632816'
} as const;

// User-facing copy. Tweak here. {placeholder}s are filled by fmt().
export const MESSAGES = {
	NOT_IN_FORUM: '❌ /{commandName} must be run inside a forum thread.',
	NOT_MANAGED: "This forum isn't managed by the bot.",
	NO_ROUTE: 'No route configured for this channel/tags.',
	READ_POST_FAIL: "❌ Couldn't read post",
	GITHUB_ERROR: '❌ GitHub error: {message}',
	GENERIC_ERROR: '❌ {message}',

	ALREADY_TRACKED: 'This request has already been accepted.',
	ALREADY_DONE: 'This request has already been resolved.',
	ALREADY_CLOSED: 'This request was already closed.',

	ACCEPT_PUBLIC_PRIVATE:
		"Thanks for the report! We've accepted this request and it's being tracked internally. This thread will automatically close when the work is complete.",
	ACCEPT_PUBLIC_OPEN:
		"Thanks for the report! We've accepted this request and it's being tracked at {issueUrl}. This thread will automatically close when the issue is resolved.",
	ACCEPT_ADMIN_OPEN: '✅ Accepted',
	ACCEPT_ADMIN_PRIVATE: '✅ Created {issueUrl}',

	DENY_PUBLIC:
		"Sorry, but it doesn't look like your request will be accepted at this time. Feel free to reach out to a member of the Indy Center Tech Team.",
	DENY_ADMIN: '✅ Denied',

	DONE_PUBLIC: 'This request has been resolved. Thanks for your contribution!',
	DONE_ADMIN: '✅ Marked done',

	ISSUE_CLOSED_NOT_PLANNED:
		"This request was closed as not planned. Feel free to reach out to a member of the Indy Center Tech Team if you'd like to discuss.",
	ISSUE_CLOSED_RESOLVED: 'This request has been resolved. Thanks for your contribution!'
} as const;

export const CONFIG: { routes: Route[] } = {
	routes: [
		{
			channel_id: TECH_FEEDBACK,
			tags: ['1420498770852057140'], // controller-tools
			owner: 'Indy-Center',
			repo: 'controller-tools'
		},
		{
			channel_id: TECH_FEEDBACK,
			tags: ['1419150565497114814'], // website
			owner: 'Indy-Center',
			repo: 'community-website'
		},
		// Fallback — MUST stay last. Matches any post in tech-feedback without a more
		// specific tag-based route above.
		{
			channel_id: TECH_FEEDBACK,
			owner: 'Indy-Center',
			repo: 'triage',
			private: true
		}
	]
};

export function matchRoute(parentChannelId: string, appliedTags: string[]): Route | null {
	for (const route of CONFIG.routes) {
		if (route.channel_id !== parentChannelId) continue;
		if (!route.tags || route.tags.length === 0) return route;
		if (route.tags.every((t) => appliedTags.includes(t))) return route;
	}
	return null;
}

export function hasRouteForChannel(parentChannelId: string): boolean {
	return CONFIG.routes.some((r) => r.channel_id === parentChannelId);
}

export function statusOfThread(appliedTags: string[]): string | null {
	if (appliedTags.includes(TAGS.TRACKED)) return MESSAGES.ALREADY_TRACKED;
	if (appliedTags.includes(TAGS.DONE)) return MESSAGES.ALREADY_DONE;
	if (appliedTags.includes(TAGS.NOT_PLANNED)) return MESSAGES.ALREADY_CLOSED;
	return null;
}

export function fmt(template: string, ctx: Record<string, string | number> = {}): string {
	return template.replace(/\{(\w+)\}/g, (_, k) => String(ctx[k] ?? ''));
}
