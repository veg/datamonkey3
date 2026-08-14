# PRIME Backend Implementation Guide for datamonkey-js-server

## Overview

PRIME (PRoperty Informed Models of Evolution) needs to be added as a new analysis method in `datamonkey-js-server`. It follows the same Socket.IO pattern as all other methods (FEL, MEME, BUSTED, etc.).

The frontend (datamonkey3) is already wired up and will emit `prime:spawn` events with the payload described below.

## Socket.IO Events to Implement

### `prime:spawn` — Start analysis

The server must listen for this event and launch `hyphy prime` with the provided parameters.

**Incoming payload:**
```json
{
  "alignment": "<FASTA or NEXUS alignment data>",
  "tree": "<Newick tree string, possibly with {FG} branch tags>",
  "job": {
    "id": "job-prime-1739856000000-abc123",
    "analysis_type": "prime",
    "gencodeid": 0,
    "branches": "All",
    "property-set": "5PROP",
    "pvalue": 0.1,
    "impute-states": "No"
  }
}
```

**Parameter details:**

| Parameter | Type | Default | Values | Maps to HyPhy CLI |
|-----------|------|---------|--------|-------------------|
| `gencodeid` | number | `0` | 0-11 | `--code Universal` (mapped from numeric ID) |
| `branches` | string | `"All"` | `All`, `Internal`, `Leaves`, `Unlabeled`, `FG` | `--branches` |
| `property-set` | string | `"5PROP"` | `5PROP`, `4PROP`, `3PROP`, `2PROP`, `Atchley`, `LCAP` | `--property-set` |
| `pvalue` | number | `0.1` | 0.001-1.0 | `--pvalue` |
| `impute-states` | string | `"No"` | `Yes`, `No` | `--impute-states` |

When `branches` is `"FG"`, the tree string will contain `{FG}` tags on selected branches (e.g., `Human{FG}:0.004`). The server should pass the tagged tree as-is and use `--branches FG`.

### `prime:check` — Validate parameters (optional)

**Incoming payload:**
```json
{
  "job": {
    "analysis_type": "prime",
    "gencodeid": 0,
    "branches": "All",
    "property-set": "5PROP",
    "pvalue": 0.1,
    "impute-states": "No"
  }
}
```

**Response:** Emit `validated` event:
```json
{ "valid": true }
```
or
```json
{ "valid": false, "errors": ["property-set must be one of: 5PROP, 4PROP, 3PROP, 2PROP, Atchley, LCAP"] }
```

### `prime:resubscribe` — Reconnect to running job

**Incoming payload:**
```json
{ "id": "job-prime-1739856000000-abc123" }
```

Re-attach the socket to an existing running job so the client receives `status update` and `completed` events again. This supports page refresh recovery.

## Events the Server Must Emit

These are the same events used by all other methods:

### `status update` — Progress updates
```json
{
  "jobId": "job-prime-1739856000000-abc123",
  "progress": 45,
  "msg": "Fitting PRIME model to site 120/300",
  "phase": "running"
}
```

### `completed` — Analysis finished
```json
{
  "jobId": "job-prime-1739856000000-abc123",
  "results": { /* parsed contents of .PRIME.json */ }
}
```

The results object should be the parsed JSON from HyPhy's output file (`*.PRIME.json`).

### `script error` — Analysis failed
```json
{
  "message": "Error description here"
}
```

## HyPhy Command Construction

The server should build and execute a command like:

```bash
hyphy prime \
  --alignment /path/to/input.fasta \
  --tree /path/to/input.tree \
  --code Universal \
  --branches All \
  --property-set 5PROP \
  --pvalue 0.1 \
  --impute-states No
```

**Genetic code mapping** (numeric ID to HyPhy string):

| ID | Value |
|----|-------|
| 0 | `Universal` |
| 1 | `Vertebrate mtDNA` |
| 2 | `Yeast mtDNA` |
| 3 | `Mold/Protozoan mtDNA` |
| 4 | `Invertebrate mtDNA` |
| 5 | `Ciliate Nuclear` |
| 6 | `Echinoderm mtDNA` |
| 7 | `Euplotid Nuclear` |
| 8 | `Alt. Yeast Nuclear` |
| 9 | `Ascidian mtDNA` |
| 10 | `Flatworm mtDNA` |
| 11 | `Blepharisma Nuclear` |

**Result file:** HyPhy writes results to `<input>.PRIME.json` (e.g., `input.fasta.PRIME.json`).

## Implementation Pattern

Follow the same pattern as existing methods. For reference, here is how a typical method is structured in the server (using FEL as an example):

### 1. Create the method handler module

Create a file like `app/prime/prime.js` (or wherever your method handlers live). It should:

- Accept the socket connection and job parameters
- Write the alignment and tree to temporary files
- Build the HyPhy CLI command
- Spawn the HyPhy process
- Parse stdout for progress updates and emit `status update` events
- Read the `.PRIME.json` result file when the process completes
- Emit `completed` with the parsed JSON results
- Emit `script error` if the process fails

### 2. Register socket events

In your main socket handler (e.g., `app/routes/socket.js` or equivalent):

```javascript
socket.on('prime:spawn', function(data) {
  prime.spawn(socket, data);
});

socket.on('prime:check', function(data) {
  // Optional: validate parameters
  socket.emit('validated', { valid: true });
});

socket.on('prime:resubscribe', function(data) {
  // Re-attach socket to running job by data.id
  prime.resubscribe(socket, data.id);
});
```

### 3. Parameter validation checklist

- `property-set` must be one of: `5PROP`, `4PROP`, `3PROP`, `2PROP`, `Atchley`, `LCAP`
- `branches` must be one of: `All`, `Internal`, `Leaves`, `Unlabeled`, `FG`
- `pvalue` must be a number between 0.001 and 1.0
- `impute-states` must be `Yes` or `No`
- `gencodeid` must be 0-11
- Alignment data must be valid FASTA or NEXUS
- Tree data should be valid Newick (if `branches` is `FG`, tree must contain `{FG}` tags)

## Testing

The frontend includes a test pattern you can adapt. Create `src/test/prime-backend.test.js`:

```javascript
const PRIME_PARAMS = {
  analysis_type: 'prime',
  genetic_code: 'Universal',
  branches: 'All',
  'property-set': '5PROP',
  pvalue: 0.1,
  'impute-states': 'No'
};

// Submit via socket
socket.emit('prime:spawn', {
  alignment: TEST_FASTA,
  tree: TEST_TREE,
  job: PRIME_PARAMS
});

// Listen for results
socket.on('completed', (data) => {
  console.log('PRIME results:', data.results);
});
```

## Quick Reference: Existing Method Patterns

| Frontend method key | Backend socket event | HyPhy command |
|---------------------|---------------------|---------------|
| `fel` | `fel:spawn` | `hyphy fel` |
| `meme` | `meme:spawn` | `hyphy meme` |
| `busted` | `busted:spawn` | `hyphy busted` |
| `absrel` | `absrel:spawn` | `hyphy absrel` |
| `contrast-fel` | `cfel:spawn` | `hyphy contrast-fel` |
| `multi-hit` | `multihit:spawn` | `hyphy fmm` |
| `relax` | `relax:spawn` | `hyphy relax` |
| **`prime`** | **`prime:spawn`** | **`hyphy prime`** |
