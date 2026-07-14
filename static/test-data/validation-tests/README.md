# Validation Test Datasets

Test files for verifying datareader validation feedback in the UI.

## Files

| File | Tests | Expected Result |
|------|-------|-----------------|
| `duplicates.fna` | Duplicate sequence detection | Should show "Duplicates Removed: 2" (Seq2 and Seq4 match Seq1) |
| `special-chars.fna` | Sequence renaming | Should show "Sequences Renamed: 4" (special chars replaced) |
| `ambiguous.fna` | Ambiguous nucleotides | Should show "Ambiguous Sites: Present" |
| `stop-codons.fna` | Terminal stop codon stripping | Should show "Stop Codons Stripped: 2" (TAG and TAA) |
| `all-issues.fna` | All validation scenarios | Should show all 4 validation messages |

## Usage

Upload these files via the Data tab to verify that validation feedback displays correctly.
