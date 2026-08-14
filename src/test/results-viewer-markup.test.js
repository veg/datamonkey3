/**
 * Source-level guards on the results viewer (UX audit items 4.2 and 4.3).
 *
 * These are grep tests, deliberately. Both properties they pin are ABSENCES, and an absence is
 * cheap to reintroduce and expensive to notice: the e2e pins that cover them need a production
 * build and, for AxoMEME, a 17 MB model download. This file fails in under a second when someone
 * pastes the markup back, which is the point at which it is cheapest to fix.
 *
 * 4.3: hyphy-eye's "automatic data sharing" only ever worked behind a Vite dev proxy. In any
 * deployed build the results are written to localStorage on the DataMonkey origin and the tab that
 * opens is vision.hyphy.org, which cannot read them. The verdict was to remove the link, so the
 * viewer must not reference hyphy-eye at all. Note 'hyphy-scope' — the visualisation library — does
 * not match this pattern and is unaffected.
 *
 * 4.2: the aBSREL debug panel serialised the entire result document into a <details> above the
 * visualisation for every aBSREL run, on every user's machine.
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

	it('carries no aBSREL debug panel', () => {
		expect(source).not.toMatch(/Debug: aBSREL/);
	});

	it('gates the raw JSON dump on the absence of a visualisation, not a method name list', () => {
		// The old condition was a hardcoded, case-sensitive array of method names; it missed every
		// method whose stored name is uppercase-but-absent (AXOMEME, BGM, PRIME, B-STILL) and so
		// rendered a visualisation AND a megabyte <pre> under it.
		expect(source).toContain('{:else if !hyphyScopeComponent}');
		expect(source).not.toMatch(/\[\s*'FEL',\s*'CONTRAST-FEL'/);
	});
});
