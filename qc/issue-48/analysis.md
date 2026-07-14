# QC Analysis: Issue #48 - FASTA Export Implementation

## Current State Analysis

### What the Issue Claims Was Implemented:
- ✅ Added imports for file storage utilities and FASTA parsing functions
- ❌ **MISSING**: Implemented `exportCorrectedFasta` function that:
  - Retrieves the original file content from IndexedDB storage
  - Parses the FASTA content using existing validation utilities
  - Formats the sequences with proper line wrapping (60 characters)
  - Exports the file with an appropriate filename suffix (_exported.fasta)

### Current Implementation Status:
- **File**: `src/lib/BatchExport.svelte:204-231`
- **Function**: `exportCorrectedFasta` exists but is incomplete
- **Line 224**: Contains TODO comment "// TODO: Extract the corrected FASTA content"
- **Return**: Currently returns `true` without actually performing export

### Missing Components:
1. **FASTA Export Format Option**: Not included in `exportFormats` array
2. **UI Integration**: No button or UI element to trigger FASTA export
3. **Function Implementation**: Core export logic missing
4. **Required Imports**: Missing imports for `fileStorage` and `toFastaFormat`

### Expected Implementation Based on Issue:
```javascript
// Missing imports needed at top of file
import { fileStorage } from './utils/indexedDBStorage';
import { parseFasta, toFastaFormat } from './utils/fastaValidation';

// Inside exportCorrectedFasta function (replace TODO)
// 1. Get original file content from IndexedDB
const storedFile = await fileStorage.getFile(analysis.fileId);
const fileContent = new TextDecoder().decode(storedFile.content);

// 2. Parse FASTA content
const { sequences } = parseFasta(fileContent);

// 3. Format with line wrapping (60 chars)
const formattedFasta = toFastaFormat(sequences, { lineLength: 60 });

// 4. Export with appropriate filename
const filename = `${file.filename.replace(/\.[^/.]+$/, '')}_exported.fasta`;
exportData(formattedFasta, filename, 'fasta');
```

### Code Quality Issues:
- Function exists but is non-functional (misleading return value)
- TODO comment indicates incomplete implementation
- No error handling for the actual export process
- Missing integration with the UI export system

## Recommendations:
1. **Complete the implementation** of `exportCorrectedFasta` function
2. **Add FASTA option** to exportFormats array
3. **Update UI** to show FASTA export option when datareader analyses are selected
4. **Add proper error handling** and status feedback
5. **Test the complete flow** from file upload to FASTA export