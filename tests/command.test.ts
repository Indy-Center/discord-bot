import { describe, expect, it } from 'vitest';
import { statusOfThread } from '../src/commands/command';
import { TAGS } from '../src/config';

describe('statusOfThread', () => {
	it('returns accepted message when TRACKED tag is present', () => {
		expect(statusOfThread([TAGS.TRACKED])).toBe('This request has already been accepted.');
	});

	it('returns resolved message when DONE tag is present', () => {
		expect(statusOfThread([TAGS.DONE])).toBe('This request has already been resolved.');
	});

	it('returns closed message when NOT_PLANNED tag is present', () => {
		expect(statusOfThread([TAGS.NOT_PLANNED])).toBe('This request was already closed.');
	});

	it('returns null when no status tag is present', () => {
		expect(statusOfThread([])).toBeNull();
		expect(statusOfThread(['some-other-tag'])).toBeNull();
	});

	it('prefers TRACKED over other tags when multiple are present', () => {
		expect(statusOfThread([TAGS.DONE, TAGS.TRACKED])).toBe(
			'This request has already been accepted.'
		);
	});
});
