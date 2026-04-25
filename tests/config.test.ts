import { describe, expect, it } from 'vitest';
import {
	CONFIG,
	MESSAGES,
	TAGS,
	fmt,
	hasRouteForChannel,
	matchRoute,
	statusOfThread
} from '../src/config';

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

describe('statusOfThread', () => {
	it('returns the tracked message when TRACKED tag is present', () => {
		expect(statusOfThread([TAGS.TRACKED])).toBe(MESSAGES.ALREADY_TRACKED);
	});

	it('returns the done message when DONE tag is present', () => {
		expect(statusOfThread([TAGS.DONE])).toBe(MESSAGES.ALREADY_DONE);
	});

	it('returns the closed message when NOT_PLANNED tag is present', () => {
		expect(statusOfThread([TAGS.NOT_PLANNED])).toBe(MESSAGES.ALREADY_CLOSED);
	});

	it('returns null when no status tag is present', () => {
		expect(statusOfThread([])).toBeNull();
		expect(statusOfThread(['some-other-tag'])).toBeNull();
	});

	it('prefers TRACKED over other tags when multiple are present', () => {
		expect(statusOfThread([TAGS.DONE, TAGS.TRACKED])).toBe(MESSAGES.ALREADY_TRACKED);
	});
});

describe('fmt', () => {
	it('replaces a placeholder with its ctx value', () => {
		expect(fmt('hi {name}', { name: 'world' })).toBe('hi world');
	});

	it('replaces multiple placeholders', () => {
		expect(fmt('a {x} b {y}', { x: '1', y: '2' })).toBe('a 1 b 2');
	});

	it('coerces number values to strings', () => {
		expect(fmt('{count} items', { count: 5 })).toBe('5 items');
	});

	it('returns the template unchanged when there are no placeholders', () => {
		expect(fmt('plain text')).toBe('plain text');
	});

	it('replaces missing keys with an empty string', () => {
		expect(fmt('{missing}', {})).toBe('');
	});
});
