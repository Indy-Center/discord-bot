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
