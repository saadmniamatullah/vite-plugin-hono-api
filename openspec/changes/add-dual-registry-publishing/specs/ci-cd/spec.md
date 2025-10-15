## ADDED Requirements

### Requirement: Dual Registry Publishing

The release workflow SHALL publish the package to both the NPM registry and GitHub Packages registry simultaneously.

#### Scenario: Successful dual publication

- **WHEN** code is pushed to the main branch and semantic-release determines a new version should be published
- **THEN** the package is published to the public NPM registry using NPM_TOKEN
- **AND** the package is published to GitHub Packages using GITHUB_TOKEN
- **AND** both publications use the same version number
- **AND** both publications maintain public access

#### Scenario: Authentication with multiple registries

- **WHEN** the release workflow runs
- **THEN** it authenticates with NPM registry using NODE_AUTH_TOKEN (NPM_TOKEN secret)
- **AND** it authenticates with GitHub Packages using GITHUB_TOKEN
- **AND** both authentication methods work without conflicts

#### Scenario: Package manager consistency

- **WHEN** publishing to either registry
- **THEN** the workflow uses PNPM for all package operations
- **AND** maintains consistency with the project's package manager configuration
