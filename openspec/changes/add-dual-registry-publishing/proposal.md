## Why

The package is currently published only to the NPM registry. To improve discoverability and provide alternative distribution channels, the package should be published to both the public NPM registry and the GitHub NPM registry (GitHub Packages) simultaneously.

## What Changes

- Configure semantic-release to publish to both NPM and GitHub Packages registries
- Update GitHub Actions release workflow to authenticate with both registries
- Maintain existing package name (`@saadmniamatullah/vite-plugin-hono-api`) and access level (public)
- Use PNPM as the package manager throughout the workflow

## Impact

- Affected specs: ci-cd capability (publishing pipeline)
- Affected code: `.releaserc`, `.github/workflows/release.yml`
- Breaking changes: None - this is additive only
- Users can install from either registry: `npm install @saadmniamatullah/vite-plugin-hono-api` or from GitHub Packages
