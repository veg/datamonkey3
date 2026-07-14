# Datamonkey 3

![License](https://img.shields.io/github/license/stevenweaver/datamonkey3)
![Version](https://img.shields.io/badge/version-0.1.0--beta.13-blue)

A modern, browser-based tool for sequence analysis and molecular evolution studies.

## Purpose

Datamonkey 3 is designed to provide researchers with an intuitive interface to validate, analyze, and visualize sequence data without requiring server-side computation. It brings powerful sequence analysis methods directly to your browser, with a workflow built around clarity and efficiency.

## Core Principles

- **Intuitive Workflow**: Progress logically from data preparation to analysis to results
- **Progressive Disclosure**: View only what you need when you need it
- **Browser-First**: No installation required, works across platforms
- **Local Privacy**: Your data stays on your machine using browser storage

## Features

- **Sequence Validation**: Identify and repair issues in FASTA and NEXUS files
- **Phylogenetic Analysis**: Run methods including FEL, SLAC, MEME, BUSTED, and more
- **Tree Selection**: Choose from inferred or user-provided trees for analysis
- **Interactive Visualization**: Explore results with embedded interactive visualizations
- **Batch Export**: Export multiple analysis results as a ZIP archive
- **Local Data Storage**: Secure, browser-based storage for files and analyses

## Getting Started

### For Users

Visit the hosted version: [https://v3.datamonkey.org](https://v3.datamonkey.org)

### For Developers

```bash
# Clone the repository
git clone https://github.com/stevenweaver/datamonkey3.git
cd datamonkey3

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Workflow

1. **Data**: Upload and validate sequence files
2. **Analyze**: Select and configure analysis methods
3. **Results**: View, compare, and export findings

## Environment Configuration

| Variable                  | Purpose                              | Default                        |
| ------------------------- | ------------------------------------ | ------------------------------ |
| `VITE_HYPHY_EYE_URL`      | URL for visualization service        | `//vision.hyphy.org`           |
| `VITE_PAGES_URL`          | URL for embedded visualization pages | `//localhost:3000/pages` (dev) |
| `PUBLIC_UMAMI_URL`        | Umami analytics script URL           | *(disabled if not set)*        |
| `PUBLIC_UMAMI_WEBSITE_ID` | Umami website tracking ID            | *(disabled if not set)*        |

### Analytics (Optional)

Datamonkey 3 supports [Umami](https://umami.is/) for privacy-focused analytics. To enable:

```bash
# Add to your .env file
PUBLIC_UMAMI_URL=https://your-umami-instance.com/script.js
PUBLIC_UMAMI_WEBSITE_ID=your-website-id
```

Analytics only loads when both variables are set.

## Technical Architecture

- **Frontend**: Svelte with TailwindCSS
- **Analysis**: WebAssembly (HyPhy)
- **Storage**: IndexedDB for browser-based persistence
- **Visualization**: Embedded iframes with postMessage communication

## Adding New Methods

1. Update the method configuration in the codebase
2. Ensure visualization components are available at the correct endpoint
3. Update documentation for the new method

## License

[MIT License](LICENSE)

---

Designed with clarity, utility, and restraint.
