## Why
The project currently has basic ESLint and Vitest setup but lacks a comprehensive code quality pipeline. A proper pipeline ensures consistent code formatting, prevents bugs, maintains high test coverage, and automates quality checks across the development workflow.

## What Changes
- Add Prettier configuration for consistent code formatting
- Configure lint-staged with Husky for pre-commit hooks
- Set up GitHub Actions workflows for CI/CD
- Configure Vitest coverage reporting and thresholds
- Add code quality checks to pull request process
- **BREAKING**: Enforce stricter linting rules that may require code adjustments

## Impact
- Affected specs: N/A (tooling-only change)
- Affected code: All source files will need to comply with new formatting and linting rules
- Development workflow: Pre-commit hooks will enforce quality standards automatically