# Datamonkey 3 Component Library

This directory contains the core UI components for the Datamonkey 3 application.

## Recent Updates

### Analysis Status Monitor Redesign

The floating dropdown monitor has been replaced with a streamlined status counter in the navigation bar. This new approach follows Dieter Rams design principles, prioritizing clarity, simplicity, and usefulness.

#### Implementation

- `AnalysisStatusIndicator.svelte`: A minimal status indicator that displays counters for running, completed, and failed analyses
- Counters are displayed in a consistent format: `⚡ X • ✓ Y • ⚠ Z`
- Only relevant counters are shown (zero values are hidden)
- Clicking the indicator navigates to the Results tab

#### Benefits

- **Always Visible**: Status is always visible in the navigation bar
- **Minimal Interface**: Shows only counts, not detailed information
- **Direct Navigation**: Clicking navigates to the Results tab for details
- **Clear Indicators**: Uses color and icons to differentiate status types
- **Adaptive Display**: Only shows relevant counters, hides zeros

## Component List

- `AnalysisCard.svelte`: Display card for individual analyses
- `AnalysisCompare.svelte`: Side-by-side comparison of analysis results
- `AnalysisErrorHandler.svelte`: Handles and displays analysis errors
- `AnalysisHistory.svelte`: Shows history of analyses for a file
- `AnalysisProgress.svelte`: Progress indicator for running analyses
- `AnalysisProgressRams.svelte`: Redesigned progress indicator using Dieter Rams principles
- `AnalysisResultViewer.svelte`: Displays analysis results
- `AnalysisStatusIndicator.svelte`: New streamlined status indicator for navigation bar
- `AnalysisTabs.svelte`: Tab navigation for analysis views
- `AnalyzeTab.svelte`: Tab content for analyze view
- `BatchExport.svelte`: Export multiple analysis results
- `DataTab.svelte`: Tab content for data view
- `DemoFileSelector.svelte`: UI for selecting demo files
- `DesignSystem.svelte`: Design system documentation
- `EnhancedAnalysisProgress.svelte`: Enhanced progress display
- `ErrorHandler.svelte`: Generic error handling component
- `ExportPanel.svelte`: Export panel for analysis results with filename customization, metadata toggle, and preview
- `FastaExport.svelte`: Export functionality for FASTA files
- `FastaValidator.svelte`: Validates FASTA file structure
- `FileCard.svelte`: Display card for individual files
- `FileIndicator.svelte`: Indicator for file selection
- `FileList.svelte`: List of available files
- `FileManager.svelte`: File management interface
- `FormGenerator.svelte`: Dynamic form generation
- `MethodSelector.svelte`: Selection UI for analysis methods
- `MultiAnalysisMonitor.svelte`: Monitor for multiple analyses (deprecated)
- `PremiumTabNavigation.svelte`: Premium tab navigation component
- `ResultsTab.svelte`: Tab content for results view
- `SequenceWarnings.svelte`: Display warnings for sequence issues
- `SmartTabNavigation.svelte`: Intelligent tab navigation
- `StepNavigation.svelte`: Step-by-step navigation
- `TabNavButton.svelte`: Tab navigation button
- `TabNavigation.svelte`: Tab navigation component
- `TreeInferenceSection.svelte`: UI for tree inference
- `TreePrompt.svelte`: Prompt for tree selection/creation
- `TreeSelector.svelte`: Selection UI for trees
- `UnifiedAnalysisView.svelte`: Unified view of analyses

## Design Principles

The component library follows these design principles:

1. **Good Design Is Unobtrusive**: UI elements stay out of the way until needed
2. **Good Design Is Honest**: Clear representation of system state
3. **Good Design Is Useful**: Every interface element serves a purpose
4. **Good Design Is As Little Design As Possible**: Focus on essentials, remove distractions
