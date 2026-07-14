# Color Standardization Plan for Datamonkey 3

## Overview

This plan addresses the inconsistent color usage across the codebase. Currently, 44 Svelte components mix custom design tokens with default Tailwind colors, creating visual inconsistency.

## Current State Analysis

### Design System Tokens (tailwind.config.ts)
- **Brand**: `brand-royal`, `brand-deep`, `brand-muted`, `brand-whisper`, `brand-ghost`
- **Accent**: `accent-copper`, `accent-warm`, `accent-soft`, `accent-cream`, `accent-pearl`
- **Text**: `text-rich`, `text-slate`, `text-silver`
- **Border**: `border-platinum`

### Problem Areas

| Default Tailwind | Occurrences | Should Be |
|-----------------|-------------|-----------|
| `gray-*` | 172 | `text-*`, `brand-*`, `border-*` |
| `blue-*` | 51 | `brand-royal`, `brand-deep` |
| `red-*` | 47 | New `status-error-*` tokens |
| `green-*` | 36 | New `status-success-*` tokens |
| `yellow-*` | ~10 | New `status-warning-*` tokens |

---

## Implementation Plan

### Phase 1: Extend Design System

**File:** `tailwind.config.ts`

Add semantic status colors that align with the existing premium aesthetic:

```typescript
colors: {
  // ... existing colors ...

  // Semantic Status Colors
  status: {
    // Error family (warm red, softer than pure red)
    error: {
      DEFAULT: '#dc2626',      // Primary error color
      light: '#fef2f2',        // Error backgrounds
      border: '#fecaca',       // Error borders
      text: '#991b1b',         // Error text
    },
    // Success family (teal-green, professional)
    success: {
      DEFAULT: '#059669',      // Primary success
      light: '#ecfdf5',        // Success backgrounds
      border: '#a7f3d0',       // Success borders
      text: '#065f46',         // Success text
    },
    // Warning family (amber, warm)
    warning: {
      DEFAULT: '#d97706',      // Primary warning
      light: '#fffbeb',        // Warning backgrounds
      border: '#fde68a',       // Warning borders
      text: '#92400e',         // Warning text
    },
    // Info family (uses brand purple for consistency)
    info: {
      DEFAULT: '#7c3aed',      // Same as brand-royal
      light: '#faf9fc',        // Same as brand-ghost
      border: '#ddd6fe',       // Light purple border
      text: '#5b21b6',         // Dark purple text
    },
  },

  // Surface colors (for bg-white replacements)
  surface: {
    DEFAULT: '#ffffff',        // Primary surface (cards, modals)
    elevated: '#ffffff',       // Elevated surfaces with shadow
    muted: '#f8fafc',          // Muted backgrounds
  },
}
```

### Phase 2: Create Color Mapping Reference

Create a migration reference for developers:

| Old Class | New Class | Context |
|-----------|-----------|---------|
| `bg-white` | `bg-surface` | Card/panel backgrounds |
| `bg-gray-50` | `bg-brand-ghost` | Page backgrounds |
| `bg-gray-100` | `bg-brand-whisper` | Subtle backgrounds |
| `bg-gray-200` | `bg-border-platinum` | Hover states |
| `text-gray-500` | `text-text-silver` | Secondary text |
| `text-gray-600` | `text-text-slate` | Body text |
| `text-gray-700` | `text-text-slate` | Body text |
| `text-gray-800` | `text-text-rich` | Headings |
| `text-gray-900` | `text-text-rich` | Primary text |
| `border-gray-200` | `border-border-platinum` | Default borders |
| `border-gray-300` | `border-border-platinum` | Input borders |
| `bg-blue-500` | `bg-brand-royal` | Primary buttons |
| `bg-blue-600` | `bg-brand-deep` | Primary hover |
| `hover:bg-blue-600` | `hover:bg-brand-deep` | Button hover |
| `text-blue-500` | `text-brand-royal` | Links |
| `text-blue-600` | `text-brand-royal` | Active links |
| `bg-red-50` | `bg-status-error-light` | Error backgrounds |
| `bg-red-100` | `bg-status-error-light` | Error backgrounds |
| `text-red-600` | `text-status-error` | Error text |
| `text-red-700` | `text-status-error-text` | Error text |
| `text-red-800` | `text-status-error-text` | Error headings |
| `border-red-200` | `border-status-error-border` | Error borders |
| `bg-green-500` | `bg-status-success` | Success buttons |
| `bg-green-600` | `bg-status-success` | Success hover |
| `text-green-600` | `text-status-success` | Success text |
| `bg-yellow-100` | `bg-status-warning-light` | Warning backgrounds |
| `text-yellow-700` | `text-status-warning-text` | Warning text |

### Phase 3: Component Updates (Priority Order)

#### High Priority (Most visible, frequently used)

1. **ExportPanel.svelte** - 5 color issues
   - `border-gray-200` → `border-border-platinum`
   - `bg-gray-100` → `bg-brand-whisper`
   - `text-gray-500` → `text-text-silver`
   - `bg-blue-500/600` → `bg-brand-royal/deep`
   - `bg-green-500/600` → `bg-status-success`

2. **AnalysisErrorHandler.svelte** - 12 color issues
   - All `red-*` → `status-error-*`
   - All `gray-*` → `text-*` or `border-*`
   - All `blue-*` → `brand-*`

3. **AnalysisCard.svelte** - 5 color issues

4. **AnalysisProgress.svelte** - 17 color issues

5. **EnhancedAnalysisProgress.svelte** - 17 color issues

6. **MultiAnalysisMonitor.svelte** - 16 color issues

7. **BatchExport.svelte** - 15 color issues

#### Medium Priority (Supporting components)

8. **AnalysisCompare.svelte** - 27 color issues
9. **AnalysisResultViewer.svelte** - 22 color issues
10. **AnalysisProgressRams.svelte** - 26 color issues
11. **FormGenerator.svelte** - 5 color issues
12. **TreeSelector.svelte** - 9 color issues
13. **FelOptions.svelte** - 15 color issues
14. **EnhancedExportPanel.svelte** - 16 color issues
15. **FileList.svelte** - 6 color issues

#### Lower Priority (Less visible)

16. **FastaValidator.svelte** - 11 color issues
17. **ErrorHandler.svelte** - 6 color issues
18. **SequenceWarnings.svelte** - 5 color issues
19. **LogDownloader.svelte** - 4 color issues
20. **DemoFileSelector.svelte** - 4 color issues
21. **AnalysisTabs.svelte** - 3 color issues
22. **AnalysisStatusIndicator.svelte** - 5 color issues
23. **dataReaderResults.svelte** - 20 color issues
24. **FelVisualization.svelte** - 4 color issues
25. **MethodOptionsTab.svelte** - 3 color issues
26. **AnalysisHistory.svelte** - 4 color issues

#### Routes

27. **routes/methods/[...method]/+page.svelte** - 8 color issues
28. **routes/analysis/[id]/+page.svelte** - 4 color issues

### Phase 4: Update DesignSystem.svelte Reference

Add status color examples to the design system reference component to document proper usage patterns.

### Phase 5: Update Storybook

Update `src/stories/DesignTokens.svelte` to remove hardcoded hex values and use the design system tokens.

---

## Validation Steps

After each component update:

1. Run `npm run build` to ensure no Tailwind class errors
2. Visual inspection in browser for color consistency
3. Run Storybook: `npm run storybook` for component isolation testing

---

## Estimated Scope

- **1 config file** to update (tailwind.config.ts)
- **26+ components** requiring color updates
- **2 route pages** requiring updates
- **1 Storybook file** to update

---

## Success Criteria

1. Zero occurrences of default Tailwind color classes (`gray-*`, `blue-*`, `red-*`, `green-*`, `yellow-*`) in `.svelte` files
2. All components use design system tokens exclusively
3. Visual consistency across all UI states (default, hover, error, success, warning)
4. DesignSystem.svelte updated with complete status color examples
