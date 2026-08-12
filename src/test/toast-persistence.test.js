/**
 * Regression tests for issue #187 — error toasts erased themselves after 8 seconds.
 *
 * The bug that matters here is not the duration, it is that `duration: options.duration || 8000`
 * coerced a caller-supplied 0 back to 8000, so NO caller could opt into a persistent error even
 * deliberately. That is invisible in review — the expression looks like an ordinary default — and
 * the symptom (a failure notice nobody was present to read) never throws. Only a test catches it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { toastStore } from '../stores/toast.js';

describe('#187 error toasts persist until dismissed', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		toastStore.dismissAll();
	});
	afterEach(() => {
		toastStore.dismissAll();
		vi.useRealTimers();
	});

	it('does not auto-dismiss an error, however long we wait', () => {
		toastStore.error('BUSTED analysis failed: no such file');
		expect(get(toastStore)).toHaveLength(1);

		// Comfortably past the old 8s window, and past any plausible replacement.
		vi.advanceTimersByTime(10 * 60 * 1000);
		expect(get(toastStore), 'the error vanished on a timer').toHaveLength(1);
	});

	it('honours an explicitly requested duration of 0', () => {
		// The exact case `||` broke: 0 is falsy, so the old code substituted 8000.
		toastStore.error('boom', { duration: 0 });
		vi.advanceTimersByTime(60_000);
		expect(get(toastStore)).toHaveLength(1);
	});

	it('still honours a caller that explicitly asks for a finite duration', () => {
		toastStore.error('transient', { duration: 3000 });
		expect(get(toastStore)).toHaveLength(1);
		vi.advanceTimersByTime(3001);
		expect(get(toastStore), 'an explicit duration was ignored').toHaveLength(0);
	});

	it('leaves non-error toasts on their existing 5s default', () => {
		// The fix must not turn every toast into a permanent one.
		toastStore.success('FEL analysis complete!');
		vi.advanceTimersByTime(5001);
		expect(get(toastStore)).toHaveLength(0);
	});

	it('can still be dismissed by hand', () => {
		const id = toastStore.error('boom');
		toastStore.dismiss(id);
		expect(get(toastStore)).toHaveLength(0);
	});
});

describe('#187 hovering or focusing a toast stops its dismiss clock', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		toastStore.dismissAll();
	});
	afterEach(() => {
		toastStore.dismissAll();
		vi.useRealTimers();
	});

	it('does not dismiss while paused', () => {
		const id = toastStore.info('long message the user is still reading');
		vi.advanceTimersByTime(1000);
		toastStore.pause(id);
		vi.advanceTimersByTime(60_000);
		expect(get(toastStore), 'a paused toast expired anyway').toHaveLength(1);
	});

	it('resumes with the time that was left, not a fresh full duration', () => {
		const id = toastStore.info('x'); // 5000ms default
		vi.advanceTimersByTime(4000); // 1000ms left
		toastStore.pause(id);
		vi.advanceTimersByTime(30_000); // paused: no time passes for the toast
		toastStore.resume(id);

		vi.advanceTimersByTime(900);
		expect(get(toastStore), 'resumed toast died early').toHaveLength(1);
		vi.advanceTimersByTime(200); // now past the remaining 1000ms
		expect(get(toastStore), 'resumed toast outlived its remaining time').toHaveLength(0);
	});

	it('pause is a no-op for a toast that never had a clock', () => {
		const id = toastStore.error('permanent');
		expect(() => {
			toastStore.pause(id);
			toastStore.resume(id);
		}).not.toThrow();
		vi.advanceTimersByTime(60_000);
		expect(get(toastStore)).toHaveLength(1);
	});
});

/**
 * Issue #205 — the regression that persistent errors introduced.
 *
 * Making errors permanent was right, but it moved a responsibility onto the caller that nothing was
 * discharging: a message describing one file must not outlive the moment the user moves to another
 * file. Before #187 the 8-second timer hid this; after it, a validation error naming file A sat on
 * screen while the user looked at file B, describing sequences that were no longer loaded.
 */
describe('#205 stale errors do not follow the user to the next file', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		toastStore.dismissAll();
	});
	afterEach(() => {
		toastStore.dismissAll();
		vi.useRealTimers();
	});

	it('dismisses errors and warnings but keeps successes', () => {
		toastStore.error('In-frame stop codons found in 4 of 8 sequences');
		toastStore.warning('Short alignment');
		toastStore.success('FEL analysis complete!');

		const removed = toastStore.dismissWhere((t) => t.type === 'error' || t.type === 'warning');

		expect(removed).toBe(2);
		const left = get(toastStore);
		expect(left).toHaveLength(1);
		// The success toast links to an analysis that still exists, so it is not stale.
		expect(left[0].type).toBe('success');
	});

	it('is a no-op when nothing matches', () => {
		toastStore.success('done');
		expect(toastStore.dismissWhere((t) => t.type === 'error')).toBe(0);
		expect(get(toastStore)).toHaveLength(1);
	});

	it('clears the timer of a dismissed toast, not just the entry', () => {
		toastStore.warning('short alignment'); // 5s default
		toastStore.dismissWhere((t) => t.type === 'warning');
		expect(get(toastStore)).toHaveLength(0);
		// If the handle leaked, this would fire against a removed id.
		expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
		expect(get(toastStore)).toHaveLength(0);
	});

	it('survives a predicate that throws', () => {
		toastStore.error('boom');
		expect(() =>
			toastStore.dismissWhere(() => {
				throw new Error('bad predicate');
			})
		).not.toThrow();
		expect(get(toastStore)).toHaveLength(1);
	});
});
