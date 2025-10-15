## 1. Update Semantic Release Configuration

- [x] 1.1 Modify `.releaserc` to add second `@semantic-release/npm` plugin instance for GitHub Packages
- [x] 1.2 Configure package name and registry URL for GitHub Packages
- [x] 1.3 Keep existing NPM registry configuration intact

## 2. Update GitHub Actions Workflow

- [x] 2.1 Add second Node.js setup step with GitHub Packages registry URL
- [x] 2.2 Configure GITHUB_TOKEN for GitHub Packages authentication
- [x] 2.3 Ensure pnpm commands work with both registries
- [x] 2.4 Verify workflow maintains existing behavior for NPM registry

## 3. Validation

- [x] 3.1 Review configuration changes for correctness
- [x] 3.2 Ensure no breaking changes to existing functionality
- [x] 3.3 Verify workflow file syntax is valid
- [x] 3.4 Commit and push changes
