/**
 * Tests for tree string validation
 * Ensures proper handling of tree strings from DATAFILE_TREE variable
 *
 * Issue: When files don't contain trees, DATAFILE_TREE can be set to "{}"
 * which HyPhy parses as an AssociativeList (not a String). This caused
 * "Incompatible operands" errors when trying to use the $ regex operator.
 *
 * Fix in datareader.bf:
 *   if (Type(treeS) == "String" && Abs(treeS) > 0 && (treeS $ "\\(")[0] >= 0)
 *
 * This checks:
 * 1. Type is String (not AssociativeList from "{}")
 * 2. String has content (Abs > 0)
 * 3. String contains opening paren (valid Newick)
 */

import { describe, it, expect } from 'vitest';

/**
 * Validates if a tree string appears to be valid Newick format
 * Mirrors the logic in datareader.bf:
 *   Type(treeS) == "String" && (treeS $ "\\(")[0] >= 0
 *
 * @param {string} treeString - The tree string to validate
 * @returns {boolean} - True if the string looks like valid Newick
 */
function isValidNewickString(treeString) {
	// In HyPhy, Type(treeS) == "String" check comes first
	// In JS, typeof check serves the same purpose
	if (!treeString || typeof treeString !== 'string') {
		return false;
	}
	// Check if string contains '(' (opening paren for Newick)
	// HyPhy uses: (treeS $ "\\(")[0] >= 0
	return treeString.includes('(');
}

/**
 * Checks if a tree string should be parsed
 * Mirrors the HyPhy logic:
 *   if (Type(treeS) == "String" && Abs(treeS) > 0 && (treeS $ "\\(")[0] >= 0)
 *
 * @param {string} treeString - The tree string to check
 * @returns {boolean} - True if the tree should be parsed
 */
function shouldParseTree(treeString) {
	// 1. Type check (in HyPhy: Type(treeS) == "String")
	if (typeof treeString !== 'string') {
		return false;
	}
	// 2. Length check (in HyPhy: Abs(treeS) > 0)
	if (treeString.length === 0) {
		return false;
	}
	// 3. Newick format check (in HyPhy: (treeS $ "\\(")[0] >= 0)
	return isValidNewickString(treeString);
}

describe('Tree String Validation', () => {
	describe('isValidNewickString', () => {
		it('should accept valid Newick trees', () => {
			// Simple tree
			expect(isValidNewickString('(A,B);')).toBe(true);

			// Tree with branch lengths
			expect(isValidNewickString('(A:0.1,B:0.2);')).toBe(true);

			// Nested tree
			expect(isValidNewickString('((A:0.1,B:0.1):0.1,(C:0.1,D:0.1):0.1);')).toBe(true);

			// Tree with internal labels
			expect(isValidNewickString('((A,B)AB,(C,D)CD)root;')).toBe(true);

			// Tree with foreground labels (HyPhy style)
			expect(isValidNewickString('((A{FG}:0.1,B:0.1):0.1,(C:0.1,D:0.1):0.1);')).toBe(true);
		});

		it('should accept trees with leading whitespace', () => {
			expect(isValidNewickString('  (A,B);')).toBe(true);
			expect(isValidNewickString('\t(A,B);')).toBe(true);
			expect(isValidNewickString('\n(A,B);')).toBe(true);
			expect(isValidNewickString('   \t\n  (A:0.1,B:0.2);')).toBe(true);
		});

		it('should reject empty JSON object (the bug case)', () => {
			// This is the actual bug - DATAFILE_TREE can be "{}" for files without trees
			expect(isValidNewickString('{}')).toBe(false);
			expect(isValidNewickString('{ }')).toBe(false);
		});

		it('should reject empty or null strings', () => {
			expect(isValidNewickString('')).toBe(false);
			expect(isValidNewickString(null)).toBe(false);
			expect(isValidNewickString(undefined)).toBe(false);
		});

		it('should reject whitespace-only strings', () => {
			expect(isValidNewickString('   ')).toBe(false);
			expect(isValidNewickString('\t\t')).toBe(false);
			expect(isValidNewickString('\n\n')).toBe(false);
		});

		it('should reject invalid tree formats', () => {
			// Just text (no parens)
			expect(isValidNewickString('not a tree')).toBe(false);

			// Array notation (no parens)
			expect(isValidNewickString('[A,B,C]')).toBe(false);

			// Missing opening paren
			expect(isValidNewickString('A,B);')).toBe(false);

			// Note: JSON like '{"tree": "(A,B);"}' would pass our simple JS check
			// because it contains '('. In HyPhy, this is handled by Type() check
			// since HyPhy parses such strings as AssociativeList, not String.
		});
	});

	describe('shouldParseTree', () => {
		it('should parse valid Newick trees', () => {
			expect(shouldParseTree('(A,B);')).toBe(true);
			expect(shouldParseTree('((A:0.1,B:0.1):0.1,(C:0.1,D:0.1):0.1);')).toBe(true);
		});

		it('should NOT parse empty JSON object', () => {
			// This is the critical fix - "{}" should not be parsed
			expect(shouldParseTree('{}')).toBe(false);
		});

		it('should NOT parse empty strings', () => {
			expect(shouldParseTree('')).toBeFalsy();
			expect(shouldParseTree(null)).toBeFalsy();
			expect(shouldParseTree(undefined)).toBeFalsy();
		});

		it('should NOT parse invalid formats', () => {
			expect(shouldParseTree('invalid')).toBe(false);
			expect(shouldParseTree('{"key": "value"}')).toBe(false);
		});
	});

	describe('Edge Cases from Real Usage', () => {
		it('should handle DATAFILE_TREE values correctly', () => {
			// When file has no tree, HyPhy may set DATAFILE_TREE to "{}"
			const noTreeCase = '{}';
			expect(shouldParseTree(noTreeCase)).toBe(false);

			// When file has embedded tree
			const withTreeCase = '((Human:0.1,Chimp:0.1):0.05,Mouse:0.2);';
			expect(shouldParseTree(withTreeCase)).toBe(true);
		});

		it('should handle complex HyPhy tree strings', () => {
			// Tree with node labels and foreground markers
			const complexTree = '((Human{Foreground}:0.067,Chimp:0.073)Node1:0.017,Mouse:0.238)';
			expect(shouldParseTree(complexTree)).toBe(true);

			// Tree with quotes around labels
			const quotedTree = "(('Human seq':0.1,'Chimp seq':0.1):0.05,'Mouse seq':0.2);";
			expect(shouldParseTree(quotedTree)).toBe(true);
		});

		it('should handle multiline tree strings', () => {
			const multilineTree = `((A:0.1,
				B:0.1):0.05,
				C:0.2);`;
			expect(shouldParseTree(multilineTree)).toBe(true);
		});
	});
});

describe('Integration Scenario: File Upload Without Tree', () => {
	it('should describe the expected behavior when uploading FASTA without tree', () => {
		/**
		 * Scenario: User uploads a FASTA file (no embedded tree)
		 *
		 * Before fix:
		 * 1. datareader.bf runs, DATAFILE_TREE = "{}"
		 * 2. "{}" is parsed as AssociativeList by HyPhy (not a String!)
		 * 3. Attempts: (treeS $ "pattern") -> "Incompatible operands" error
		 *    OR: Topology t = "{}" -> "Illegal right hand side in call to Topology"
		 *
		 * After fix:
		 * 1. datareader.bf runs, DATAFILE_TREE = "{}" (AssociativeList)
		 * 2. Type(treeS) == "String" -> false (it's AssociativeList)
		 * 3. Condition fails, skip tree parsing entirely
		 * 4. Returns empty string, NJ tree will be inferred
		 * 5. User sees: "Valid for analysis" + "Using inferred NJ tree"
		 *
		 * HyPhy fix:
		 *   if (Type(treeS) == "String" && Abs(treeS) > 0 && (treeS $ "\\(")[0] >= 0)
		 */

		// The fix ensures "{}" is detected as invalid (no opening paren)
		expect(isValidNewickString('{}')).toBe(false);
		expect(shouldParseTree('{}')).toBe(false);

		// But valid Newick is still processed
		expect(shouldParseTree('(A:0.1,B:0.2);')).toBe(true);
	});
});
