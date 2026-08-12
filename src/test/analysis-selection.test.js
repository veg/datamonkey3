/**
 * Regression tests for issue #188 — "View Results" opened the wrong analysis.
 *
 * The failure mode is a contradiction, not an exception: the history list highlights the new run
 * while the detail pane beside it renders a different one, usually the invisible `datareader` job
 * from the upload. Nothing throws, nothing is logged, and the screen is internally inconsistent at
 * the exact moment the product exists for. Only a test catches a reintroduction.
 */
import { describe, it, expect } from 'vitest';
import { resolveSelectedAnalysis } from '../lib/utils/analysisSelection.js';

const reader = (id, fileId, createdAt) => ({
	id,
	fileId,
	method: 'datareader',
	createdAt
});
const run = (id, fileId, method, createdAt) => ({ id, fileId, method, createdAt });

describe('#188 the detail pane resolves to a real analysis', () => {
	it('passes a normal selection straight through', () => {
		const analyses = [run('a1', 'f1', 'meme', 200)];
		expect(resolveSelectedAnalysis('a1', analyses)).toBe('a1');
	});

	it('redirects away from the invisible datareader job to the newest real run', () => {
		// The bug in one line. On a fresh upload the current selection is the reader job, which is
		// filtered out of the history list — so the user sees "DATAREADER Analysis" with file
		// statistics, beside their own MEME card highlighted blue, and no card to click to escape.
		const analyses = [reader('r1', 'f1', 100), run('a1', 'f1', 'meme', 200)];
		expect(resolveSelectedAnalysis('r1', analyses)).toBe('a1');
	});

	it('picks the most recent real analysis, not the first', () => {
		const analyses = [
			reader('r1', 'f1', 100),
			run('old', 'f1', 'fel', 200),
			run('new', 'f1', 'meme', 300)
		];
		expect(resolveSelectedAnalysis('r1', analyses)).toBe('new');
	});

	it('does not cross files when redirecting', () => {
		// A different file's analysis is not an answer to "show me this file's results".
		const analyses = [reader('r1', 'f1', 100), run('other', 'f2', 'meme', 500)];
		expect(resolveSelectedAnalysis('r1', analyses)).toBe('r1');
	});

	it('keeps the reader job when the file genuinely has no real analysis yet', () => {
		// Honest answer: file statistics are the only thing there is to show. Blanking the pane
		// would be worse than showing the one record that exists.
		const analyses = [reader('r1', 'f1', 100)];
		expect(resolveSelectedAnalysis('r1', analyses)).toBe('r1');
	});

	it('returns null when nothing is selected', () => {
		expect(resolveSelectedAnalysis(null, [run('a1', 'f1', 'meme', 1)])).toBeNull();
		expect(resolveSelectedAnalysis(undefined, [])).toBeNull();
	});

	it('passes an unknown id through rather than blanking the pane', () => {
		// The record may not have loaded yet. Nulling here would produce a flicker to an empty pane
		// on every fresh selection, trading one bug for another.
		expect(resolveSelectedAnalysis('not-loaded-yet', [])).toBe('not-loaded-yet');
	});

	it('tolerates a missing analyses array', () => {
		expect(() => resolveSelectedAnalysis('a1', undefined)).not.toThrow();
		expect(resolveSelectedAnalysis('a1', undefined)).toBe('a1');
	});
});
