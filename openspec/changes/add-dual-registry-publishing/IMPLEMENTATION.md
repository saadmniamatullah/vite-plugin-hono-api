# Dual NPM Registry Publishing Implementation

## Overview

This change enables the package to be published to both the public NPM registry and GitHub Packages registry simultaneously.

## Implementation Details

### Changes Made

1. **Updated `.github/workflows/release.yml`**:
   - Added `packages: write` permission for GitHub Packages access
   - Renamed first Node.js setup step to "Setup Node.js for NPM" for clarity
   - Added second Node.js setup step configured for GitHub Packages registry
   - Added conditional publish step that only publishes to GitHub Packages if semantic-release created a new version

### How It Works

1. **Semantic-release publishes to NPM** (existing behavior):
   - Runs conventional commit analysis
   - Determines if a new version is needed
   - Publishes to NPM registry using `NPM_TOKEN` secret
   - Creates git tag for the new version
   - Updates package.json and CHANGELOG.md

2. **Conditional GitHub Packages publish** (new):
   - After semantic-release completes, checks if a new tag was created
   - If tag exists: publishes to GitHub Packages using `GITHUB_TOKEN`
   - If no tag: skips GitHub Packages publish (no new version to publish)

### Key Design Decisions (KISS & YAGNI)

1. **Sequential Publishing**: Simple two-step process instead of complex multi-registry configuration
2. **Tag-based Detection**: Uses git tag to determine if publish is needed (already created by semantic-release)
3. **Separate Setup Steps**: Each registry gets its own Node.js setup for clean isolation
4. **No Additional Config**: No changes to `.releaserc` or package.json needed
5. **Idempotent**: Safe to re-run - only publishes when semantic-release creates a version

### Registry Access

Once published, users can install from either registry:

```bash
# From NPM (default)
npm install @saadmniamatullah/vite-plugin-hono-api

# From GitHub Packages (requires .npmrc configuration)
npm install @saadmniamatullah/vite-plugin-hono-api --registry=https://npm.pkg.github.com
```

## Security & Permissions

- **NPM Registry**: Uses `NPM_TOKEN` repository secret (must be configured in GitHub)
- **GitHub Packages**: Uses built-in `GITHUB_TOKEN` (automatically available)
- **Workflow Permission**: Added `packages: write` to allow GitHub Packages publishing

## Testing

The workflow will be tested on the next release to the main branch. To verify:

1. Merge this PR to main
2. Make a commit with conventional commit format (e.g., `feat: add new feature`)
3. Watch the Release workflow in Actions tab
4. Verify package appears in both:
   - https://www.npmjs.com/package/@saadmniamatullah/vite-plugin-hono-api
   - https://github.com/saadmniamatullah/vite-plugin-hono-api/packages

## Rollback Plan

If issues occur, simply revert this PR to restore single-registry publishing to NPM only.
