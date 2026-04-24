import { describe, expect, it } from 'vitest';
import { CONFIG, hasRouteForChannel, matchRoute } from '../src/config';

const TECH_FEEDBACK = CONFIG.routes[0].channel_id;
const CONTROLLER_TOOLS_TAG = '1420498770852057140';
const WEBSITE_TAG = '1419150565497114814';

describe('matchRoute', () => {
	it('returns the controller-tools route when its tag is applied', () => {
		const route = matchRoute(TECH_FEEDBACK, [CONTROLLER_TOOLS_TAG]);
		expect(route?.repo).toBe('controller-tools');
	});

	it('returns the website route when its tag is applied', () => {
		const route = matchRoute(TECH_FEEDBACK, [WEBSITE_TAG]);
		expect(route?.repo).toBe('community-website');
	});

	it('falls back to the private triage route when no specific tag matches', () => {
		const route = matchRoute(TECH_FEEDBACK, []);
		expect(route?.repo).toBe('triage');
		expect(route?.private).toBe(true);
	});

	it('falls back to triage when an unknown tag is applied', () => {
		const route = matchRoute(TECH_FEEDBACK, ['unknown-tag-id']);
		expect(route?.repo).toBe('triage');
	});

	it('returns null for an unmanaged channel', () => {
		expect(matchRoute('some-unrelated-channel', [])).toBeNull();
	});
});

describe('hasRouteForChannel', () => {
	it('returns true for a channel with at least one route', () => {
		expect(hasRouteForChannel(TECH_FEEDBACK)).toBe(true);
	});

	it('returns false for an unmanaged channel', () => {
		expect(hasRouteForChannel('some-unrelated-channel')).toBe(false);
	});
});
