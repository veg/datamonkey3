/**
 * Source-level guards on the results viewer (UX audit item 4.3).
 *
 * This is a grep test, deliberately. The property it pins is an ABSENCE, and an absence is cheap to
 * reintroduce and expensive to notice: the e2e pin that covers it needs a production build and a
 * seeded IndexedDB. This file fails in under a second when someone pastes the markup back, which is
 * the point at which it is cheapest to fix.
 *
 * hyphy-eye's "automatic data sharing" only ever worked behind a Vite dev proxy. In any deployed
 * build the results are written to localStorage on the DataMonkey origin and the tab that opens is
 * vision.hyphy.org, which cannot read them. The verdict was to remove the link, so the viewer must
 * not reference hyphy-eye at all. Note that 'hyphy-scope' — the visualisation library the viewer
 * legitimately uses — does not match this pattern.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// import.meta.url is not a file: URL under this vitest environment, so resolve from the repo root.
const source = readFileSync(resolve(process.cwd(), 'src/lib/AnalysisResultViewer.svelte'), 'utf8');

describe('AnalysisResultViewer markup', () => {
	it('does not link to or import hyphy-eye', () => {
		expect(source).not.toMatch(/hyphy-?eye/i);
	});
});
