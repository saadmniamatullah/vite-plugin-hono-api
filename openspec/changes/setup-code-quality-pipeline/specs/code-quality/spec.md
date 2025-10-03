## ADDED Requirements

### Requirement: Code Formatting

The project SHALL automatically format code using Prettier to maintain consistent style across all files.

#### Scenario: Format verification in CI

- **WHEN** code is pushed to the repository
- **THEN** the CI pipeline verifies all files are properly formatted
- **AND** fails the build if formatting issues are detected

### Requirement: Pre-commit Quality Gates

The project SHALL enforce code quality standards before allowing commits to be made.

#### Scenario: Lint-staged execution

- **WHEN** a developer attempts to commit changes
- **THEN** lint-staged runs ESLint and Prettier only on staged files
- **AND** blocks the commit if any quality checks fail
- **AND** shows clear error messages for any issues found

#### Scenario: Automatic formatting and fixes

- **WHEN** lint-staged detects fixable issues
- **THEN** it automatically applies Prettier formatting and ESLint fixes before the commit
- **AND** proceeds with the commit if all issues are resolved

### Requirement: Continuous Integration Pipeline

The project SHALL run comprehensive quality checks in GitHub Actions for every pull request and push.

#### Scenario: Multi-version testing

- **WHEN** code is pushed or a PR is opened
- **THEN** the pipeline tests against Node.js versions 18, 20, and 22
- **AND** runs all linting, formatting, and test checks
- **AND** fails the pipeline if any check fails

#### Scenario: Coverage reporting

- **WHEN** tests run in CI
- **THEN** Vitest generates coverage reports
- **AND** enforces minimum coverage thresholds (80% overall)
- **AND** publishes coverage results to GitHub PR checks

### Requirement: Test Coverage Enforcement

The project SHALL maintain minimum test coverage thresholds to ensure code quality.

#### Scenario: Coverage threshold validation

- **WHEN** tests run locally or in CI
- **THEN** Vitest verifies coverage meets minimum thresholds
- **AND** fails if any metric falls below 80%
- **AND** provides detailed coverage breakdown by file

#### Scenario: Coverage reporting integration

- **WHEN** coverage reports are generated
- **THEN** they are displayed in GitHub PR checks
- **AND** coverage badge is updated in README
- **AND** historical coverage trends are tracked

### Requirement: Development Workflow Integration

The project SHALL provide convenient npm scripts for all quality-related tasks.

#### Scenario: Local quality checks

- **WHEN** a developer runs `pnpm lint`
- **THEN** ESLint checks all files for code quality issues
- **WHEN** a developer runs `pnpm format`
- **THEN** Prettier formats all files according to style rules
- **WHEN** a developer runs `pnpm test:coverage`
- **THEN** Vitest runs tests with coverage reporting

#### Scenario: Pre-commit automation

- **WHEN** Husky is installed (via `pnpm prepare`)
- **THEN** Git hooks are automatically configured
- **AND** pre-commit hook runs lint-staged
- **AND** commit-msg hook validates conventional commit format

### Requirement: Conventional Commit Enforcement

The project SHALL enforce conventional commit message format using commitlint to maintain consistent commit history.

#### Scenario: Commit message validation

- **WHEN** a developer creates a commit
- **THEN** commit-msg hook validates the message using commitlint
- **AND** blocks the commit if format is invalid
- **AND** shows clear error message with format examples

#### Scenario: Commitlint configuration

- **WHEN** commitlint is configured
- **THEN** it uses conventional-commits preset
- **AND** enforces types: feat, fix, docs, style, refactor, test, chore
- **AND** requires proper scope and subject format
