# Umami Analytics Implementation

Datamonkey 3 uses [Umami](https://umami.is/) for privacy-focused analytics. This document describes the implementation details.

## Configuration

### Environment Variables

Set both variables in your `.env` file to enable analytics:

```bash
PUBLIC_UMAMI_URL=https://your-umami-instance.com/script.js
PUBLIC_UMAMI_WEBSITE_ID=your-website-id
```

Analytics only loads when **both** variables are configured. If either is missing, no tracking occurs.

### Script Loading

The Umami script is conditionally loaded in `src/routes/+layout.svelte`:

```svelte
<script>
  import { env } from '$env/dynamic/public';

  const umamiUrl = env.PUBLIC_UMAMI_URL;
  const umamiWebsiteId = env.PUBLIC_UMAMI_WEBSITE_ID;
  const umamiEnabled = umamiUrl && umamiWebsiteId;
</script>

<svelte:head>
  {#if umamiEnabled}
    <script defer src={umamiUrl} data-website-id={umamiWebsiteId}></script>
  {/if}
</svelte:head>
```

## Analytics Utility

**File:** `src/lib/utils/analytics.js`

```javascript
import { browser } from '$app/environment';

/**
 * Track an event with Umami analytics (if enabled)
 * @param {string} eventName - Name of the event to track
 * @param {object} eventData - Optional data to include with the event
 */
export function trackEvent(eventName, eventData = {}) {
  if (browser && typeof window.umami !== 'undefined') {
    window.umami.track(eventName, eventData);
  }
}
```

**Features:**
- Only executes in browser environment
- Safely checks if `window.umami` exists
- No-op when Umami isn't loaded (graceful degradation)

## Tracked Events

### File Operations

| Event | File | Data |
|-------|------|------|
| `file-uploaded` | `stores/fileInfo.js` | `{ fileSize }` |
| `file-validated` | `lib/FastaValidator.svelte` | `{ isValid, errorCount, warningCount }` |
| `file-deleted` | `lib/FileManager.svelte` | `{ fileCount }` |
| `demo-file-loaded` | `lib/DemoFileSelector.svelte` | `{ filename }` |

### Tree Operations

| Event | File | Data |
|-------|------|------|
| `tree-uploaded` | `lib/TreeSourceSelector.svelte` | `{ source }` |

### Analysis Lifecycle

| Event | File | Data |
|-------|------|------|
| `analysis-started` | `lib/AnalyzeTab.svelte` | `{ method }` |
| `analysis-completed` | `routes/+page.svelte` | `{ method, executionMode, durationMs }` |
| `analysis-failed` | `routes/+page.svelte` | `{ method, executionMode, errorType }` |
| `analysis-cancelled` | `lib/AnalysisHistory.svelte` | Analysis metadata |
| `analysis-deleted` | `lib/AnalysisHistory.svelte` | Analysis metadata |

### Export Operations

| Event | File | Data |
|-------|------|------|
| `results-exported` | `lib/ExportPanel.svelte` | `{ method, format }` |
| `batch-export-started` | `lib/BatchExport.svelte` | `{ analysisCount }` |

### UI Interactions

| Event | File | Data |
|-------|------|------|
| `tab-changed` | `routes/+page.svelte` | `{ from, to }` |
| `console-toggled` | `lib/AnalyzeTab.svelte` | `{ visible }` |

## Usage Example

```javascript
import { trackEvent } from '$lib/utils/analytics.js';

// Simple event
trackEvent('button-clicked');

// Event with data
trackEvent('analysis-started', {
  method: 'FEL',
  sequenceCount: 25,
  siteCount: 500
});
```

## Privacy Considerations

- Umami is privacy-focused and GDPR-compliant
- No personal data is collected
- No cookies are used for tracking
- All data stays on your Umami instance
- Users can be excluded via browser settings or ad blockers

## Adding New Events

1. Import the utility:
   ```javascript
   import { trackEvent } from '$lib/utils/analytics.js';
   ```

2. Call `trackEvent()` at the appropriate point:
   ```javascript
   trackEvent('event-name', { key: 'value' });
   ```

3. Document the event in this file

## Debugging

To verify events are being tracked:

1. Open browser DevTools
2. Go to Network tab
3. Filter by your Umami domain
4. Perform an action
5. Check for POST requests to the Umami endpoint

Or check your Umami dashboard for real-time events.
