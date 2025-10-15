# GitHub Copilot Instructions

This file provides guidance to GitHub Copilot when working with code in this repository.

## Project Overview

This is a Vite plugin that provides low-config integration of Hono APIs. The plugin automatically mounts a Hono API at `/api` (or custom basePath) during development and builds both frontend and server bundles for production.

**Core Architecture:**

- **Plugin Entry**: `src/index.ts` - Main plugin implementation with Vite hooks
- **Expected Structure**: Projects must have `hono/index.ts` that exports a default Hono app
- **Build Output**: Frontend → `dist/frontend/`, Server → `dist/server.js`
- **Development**: Middleware intercepts requests at basePath and forwards to Hono app

## Technology Stack

- **Language**: TypeScript with strict mode enabled
- **Module System**: ESM-only (type: "module" in package.json)
- **Build Tool**: tsup for building, Vite for testing
- **Test Framework**: Vitest with v8 coverage
- **Code Quality**: ESLint, Prettier, commitlint, husky + lint-staged
- **Runtime Support**: Node.js 18+, Bun, and Deno

## Development Commands

```bash
# Build the plugin
pnpm build

# Development mode (watch for changes)
pnpm dev

# Run tests
pnpm test

# Watch tests during development
pnpm test:watch

# Lint and format
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check

# Test with playground
pnpm play
pnpm dev:play
pnpm build:play
pnpm preview:play
```

## Code Style and Standards

### Module System

- **ESM Only**: Always use `import`/`export` syntax, never `require()`
- All imports should use explicit file extensions when needed
- Use named exports for utilities, default export for the plugin

### TypeScript

- Strict mode is enabled - no implicit any, proper null checks required
- Use type imports with `import type` for type-only imports
- Define interfaces for all public APIs and options
- Use type guards for runtime type checking (see `isJsonRecord`, `isHonoApp`)

### Code Quality

- Pre-commit hooks enforce formatting and linting
- All code must pass ESLint checks
- Format with Prettier before committing
- Follow conventional commit format (feat, fix, docs, chore, etc.)

### Testing

- Tests should be in `tests/` directory
- Use Vitest for all tests
- Maintain test coverage (configured with thresholds)
- Test files are excluded from build output

## Key Implementation Details

### Plugin Structure (`src/index.ts`)

- **Dependency Validation**: Checks for Vite 6+, Hono (optional: @hono/node-server, @types/node)
- **Conditional Activation**: Only enables if `hono/index.ts` exists
- **Development Middleware**: Intercepts requests matching basePath, forwards to Hono app via SSR loading
- **Build Configuration**: Uses Vite Environment API for parallel frontend/server builds
- **Wrapper Generation**: Creates `.hono-server.mjs` for production deployment

### Critical Constants

- `HONO_ENTRY = 'hono/index.ts'` - Required entry point location
- `WRAPPER_FILE = '.hono-server.mjs'` - Generated production wrapper
- Default `basePath = '/api'`
- Default `port = 4173`

### Build Process

1. **Frontend**: Builds to `dist/frontend/`
2. **Server**: Builds Hono app + wrapper to `dist/server.js`
3. **Deployment Files**: Copies package.json + lockfile to `dist/`
4. **Cleanup**: Removes generated wrapper file after build

## Important Constraints

### WebSocket Limitations

WebSocket connections are NOT supported - the middleware doesn't handle HTTP upgrade requests. Use Server-Sent Events (SSE) instead.

### Vite Version Requirement

Plugin requires Vite 6+ for Environment API support. Version validation happens at plugin initialization.

### File Structure Requirements

- **Must have**: `hono/index.ts` exporting default Hono app with fetch method
- **Generated**: `.hono-server.mjs` (temporary, cleaned up after build)
- **Output**: `dist/frontend/` and `dist/server.js`

### Runtime Support

- Node.js 18+ is required
- Hono is a required peer dependency
- @hono/node-server and @types/node are optional peer dependencies

## Best Practices

### When Making Changes

1. **Check existing implementation** - Review related code before adding new features
2. **Maintain backward compatibility** - This is a published package used by others
3. **Update tests** - Add or update tests for any behavior changes
4. **Follow naming conventions** - Use camelCase for variables/functions, PascalCase for types
5. **Document constraints** - Update documentation if adding new requirements or limitations

### Code Patterns to Follow

- Use type guards for runtime validation (see existing `isJsonRecord`, `isHonoApp`, etc.)
- Handle errors gracefully with try-catch and clear error messages
- Use helper functions for string/header conversions (see `toHeaderValue`, etc.)
- Validate versions and dependencies early at plugin initialization

### What to Avoid

- Don't add CommonJS patterns (`require`, `module.exports`)
- Don't break the plugin for existing users
- Don't add features that work around WebSocket limitations (not supported)
- Don't bypass the pre-commit hooks
- Don't remove or weaken TypeScript strict mode checks

## Publishing and Releases

- Package is published to npm as `@saadmniamatullah/vite-plugin-hono-api`
- Uses semantic-release for automated versioning
- GitHub Actions handles CI/CD pipeline
- All releases must pass linting, tests, and build checks

## Additional Resources

For more detailed instructions specific to other AI coding assistants:

- Claude Code: See `CLAUDE.md` for Claude-specific guidance
- OpenSpec workflow: See `openspec/AGENTS.md` for spec-driven development

## Commit Message Format

Follow conventional commit format enforced by commitlint:

```
<type>(<scope>): <subject>

Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci, revert
- feat: New feature
- fix: Bug fix
- docs: Documentation changes
- style: Code style changes (formatting, etc)
- refactor: Code refactoring
- perf: Performance improvements
- test: Adding or updating tests
- chore: Maintenance tasks
- build: Build system or dependency changes
- ci: CI configuration changes
- revert: Revert previous commit
```

Examples:

- `feat(plugin): add support for custom base path`
- `fix(middleware): handle query parameters correctly`
- `docs(readme): update installation instructions`
- `test(plugin): add tests for build process`
