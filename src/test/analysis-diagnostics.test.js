/**
 * Tests for issue #186 — a failed analysis rendered "No results available" and nothing else.
 *
 * These pin the formatting of records that come back from IndexedDB, which are NOT uniform:
 * `arguments` is sometimes a string and sometimes an object, and `logs` entries are sometimes
 * strings and sometimes `{message}`. The failure view is the one screen that must never throw —
 * replacing a useless error screen with a broken one is strictly worse than leaving it alone.
 */
import { describe, it, expect } from 'vitest';
import {
	formatArguments,
	formatLogTail,
	buildDiagnostics
} from '../lib/utils/analysisDiagnostics.js';

describe('#186 formatArguments tolerates every shape IndexedDB returns', () => {
	it('passes a stored string through unchanged', () => {
		expect(formatArguments('--branches All --pvalue 0.1')).toBe('--branches All --pvalue 0.1');
	});

	it('pretty-prints an object', () => {
		expect(formatArguments({ branches: 'All' })).toBe('{\n  "branches": "All"\n}');
	});

	it('is empty for a record that never stored arguments', () => {
		expect(formatArguments(null)).toBe('');
		expect(formatArguments(undefined)).toBe('');
	});

	it('does not throw on a circular object', () => {
		const circular = { a: 1 };
		circular.self = circular;
		expect(() => formatArguments(circular)).not.toThrow();
	});
});

describe('#186 formatLogTail', () => {
	it('renders string entries', () => {
		expect(formatLogTail(['one', 'two'])).toBe('one\ntwo');
	});

	it('renders {message} entries, which is what the store actually writes', () => {
		// analyses.js pushes `{ time, message, status }`.
		const logs = [
			{ time: 't1', message: 'Mounting user.nex', status: 'mounting' },
			{ time: 't2', message: 'HyPhy error: could not read tree', status: 'error' }
		];
		expect(formatLogTail(logs)).toBe('Mounting user.nex\nHyPhy error: could not read tree');
	});

	it('keeps the LAST lines, not the first', () => {
		// The line that explains a failure is rarely the first one.
		const logs = Array.from({ length: 50 }, (_, i) => `line ${i}`);
		const out = formatLogTail(logs, 3);
		expect(out).toBe('line 47\nline 48\nline 49');
	});

	it('is empty for a record with no logs', () => {
		expect(formatLogTail(undefined)).toBe('');
		expect(formatLogTail([])).toBe('');
	});

	it('does not throw on entries of an unexpected shape', () => {
		expect(() => formatLogTail([null, 42, { odd: true }])).not.toThrow();
	});
});

describe('#186 buildDiagnostics produces something worth pasting into an issue', () => {
	const failed = {
		method: 'busted',
		status: 'error',
		error: 'HyPhy error: "Custom" is not a valid value for parameter "branches"',
		arguments: '--branches Custom',
		logs: [{ message: 'Starting BUSTED' }, { message: 'Fitting model' }],
		metadata: { executionMode: 'wasm' }
	};

	it('leads with the method and status', () => {
		expect(buildDiagnostics(failed, { filename: 'hiv.fasta' })).toMatch(/^BUSTED — error/);
	});

	it('includes the error, the settings and the log tail', () => {
		const out = buildDiagnostics(failed, { filename: 'hiv.fasta' });
		expect(out).toContain('is not a valid value for parameter');
		expect(out).toContain('--branches Custom');
		expect(out).toContain('Fitting model');
		expect(out).toContain('hiv.fasta');
	});

	it('omits sections that have nothing in them rather than leaving empty headings', () => {
		const bare = { method: 'fel', status: 'error' };
		const out = buildDiagnostics(bare);
		expect(out).not.toContain('Run settings:');
		expect(out).not.toContain('Last log lines:');
		expect(out).not.toContain('Error:');
	});

	it('returns empty for no analysis rather than throwing', () => {
		expect(buildDiagnostics(null)).toBe('');
	});
});
