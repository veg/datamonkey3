/**
 * Tests for safeParseJSON() utility
 * Verifies defensive JSON parsing that handles corrupted result files
 * with trailing garbage appended after valid JSON.
 */

import { describe, it, expect, vi } from 'vitest';
import { safeParseJSON } from '../lib/utils/jsonUtils.js';

describe('safeParseJSON', () => {
	it('parses valid JSON normally', () => {
		const obj = { foo: 'bar', nested: { a: 1 } };
		expect(safeParseJSON(JSON.stringify(obj))).toEqual(obj);
	});

	it('parses valid JSON with whitespace after', () => {
		expect(safeParseJSON('{"a": 1}  \n  ')).toEqual({ a: 1 });
	});

	it('recovers from trailing garbage after valid JSON object', () => {
		const valid = JSON.stringify({ result: 'success', data: [1, 2, 3] });
		const corrupted = valid + 'ROKA18_10":"test","extra":"garbage"';

		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const result = safeParseJSON(corrupted);

		expect(result).toEqual({ result: 'success', data: [1, 2, 3] });
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('[safeParseJSON] Truncated')
		);
		consoleSpy.mockRestore();
	});

	it('recovers from the exact FUBAR corruption pattern', () => {
		// Simulates the issue: valid JSON followed by partial duplicate
		const valid = JSON.stringify({
			MLE: { content: {} },
			input: { trees: '(A:0.1,B:0.2);' }
		});
		const corrupted = valid + '}ROKA18_10_Paju":"test"';

		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const result = safeParseJSON(corrupted);

		expect(result).toHaveProperty('MLE');
		expect(result).toHaveProperty('input');
		consoleSpy.mockRestore();
	});

	it('handles nested objects correctly during recovery', () => {
		const valid = '{"a":{"b":{"c":1}},"d":[{"e":2}]}';
		const corrupted = valid + '{"leftover": true}';

		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const result = safeParseJSON(corrupted);

		expect(result).toEqual({ a: { b: { c: 1 } }, d: [{ e: 2 }] });
		consoleSpy.mockRestore();
	});

	it('handles strings containing braces during recovery', () => {
		const valid = '{"key":"value with {braces} inside"}';
		const corrupted = valid + 'garbage';

		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const result = safeParseJSON(corrupted);

		expect(result).toEqual({ key: 'value with {braces} inside' });
		consoleSpy.mockRestore();
	});

	it('handles escaped quotes in strings during recovery', () => {
		const valid = '{"key":"value \\"with\\" quotes"}';
		const corrupted = valid + 'trailing';

		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const result = safeParseJSON(corrupted);

		expect(result).toEqual({ key: 'value "with" quotes' });
		consoleSpy.mockRestore();
	});

	it('throws on completely invalid JSON', () => {
		expect(() => safeParseJSON('not json at all')).toThrow();
	});

	it('throws on truncated/incomplete JSON', () => {
		expect(() => safeParseJSON('{"key": "val')).toThrow();
	});

	it('throws on empty input', () => {
		expect(() => safeParseJSON('')).toThrow();
	});

	it('parses arrays normally', () => {
		expect(safeParseJSON('[1, 2, 3]')).toEqual([1, 2, 3]);
	});

	it('parses primitive values normally', () => {
		expect(safeParseJSON('"hello"')).toBe('hello');
		expect(safeParseJSON('42')).toBe(42);
		expect(safeParseJSON('true')).toBe(true);
		expect(safeParseJSON('null')).toBe(null);
	});

	it('logs warning with byte counts when truncating', () => {
		const valid = '{"a":1}';
		const garbage = 'xxxxxxxxxxxxxxxxxxxx';
		const corrupted = valid + garbage;

		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		safeParseJSON(corrupted);

		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringMatching(/Truncated 20 bytes.*total length: 27.*valid length: 7/)
		);
		consoleSpy.mockRestore();
	});
});
