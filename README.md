# @saadmniamatullah/vite-plugin-hono-api

[![CI](https://github.com/saadmniamatullah/vite-plugin-hono-api/workflows/CI/badge.svg)](https://github.com/saadmniamatullah/vite-plugin-hono-api/actions)
[![npm version](https://badge.fury.io/js/%40saadmniamatullah%2Fvite-plugin-hono-api.svg)](https://www.npmjs.com/package/@saadmniamatullah/vite-plugin-hono-api)

A low-config Vite plugin that integrates a Hono API with your frontend. Create `hono/index.ts` and you're ready to go.

## Requirements

- **Vite**: 6.0.0 or later (including Vite 7 with full Environment API support)
- **Hono**: 4.6.9 or later
- **Node.js**: 18 or later

## Installation

```bash
npm install @saadmniamatullah/vite-plugin-hono-api --save-dev
```

### Peer Dependencies

```bash
# Required for all runtimes
npm install hono

# Optional: Only needed for Node.js runtime
npm install @hono/node-server @types/node
```

## Quick Start

1. **Create your Hono app** (`hono/index.ts`):

```typescript
import { Hono } from 'hono';

const api = new Hono();

api.get('/', (c) => c.json({ message: 'Hello from Hono!' }));
api.get('/health', (c) => c.json({ status: 'ok' }));

export default api;
```

2. **Configure Vite**:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import honoApi from '@saadmniamatullah/vite-plugin-hono-api';

export default defineConfig({
  plugins: [honoApi()],
});
```

That's it! Your API is now available at `/api/*` during development and builds to `dist/server.js` for production.

## API Reference

### Plugin Options

```typescript
interface HonoPluginOptions {
  basePath?: string; // API base path (default: '/api')
  port?: number; // Default port for server wrapper (default: 4173)
}
```

### Configuration

```typescript
import honoApi from '@saadmniamatullah/vite-plugin-hono-api';

export default defineConfig({
  plugins: [
    honoApi({
      basePath: '/api', // Custom API path
      port: 3000, // Custom port
    }),
  ],
});
```

## Examples

### Basic Usage

```typescript
// hono/index.ts
import { Hono } from 'hono';

const api = new Hono();

api.get('/', (c) => c.json({ message: 'Hello World' }));
api.get('/users', (c) => c.json({ users: [] }));

export default api;
```

### With Middleware

```typescript
// hono/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const api = new Hono();

api.use('*', cors());
api.get('/api/data', (c) => c.json({ data: 'protected' }));

export default api;
```

### Custom Base Path

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    honoApi({
      basePath: '/backend', // API now at /backend/*
    }),
  ],
});
```

## Build Output

```
dist/
├── frontend/          # Your frontend build
│   ├── index.html
│   └── assets/
└── server.js          # Your Hono server (ready to run)
```

## Production Deployment

```bash
# Build both frontend and server
npm run build

# Start the server
node dist/server.js
```

## Runtime Support

This plugin generates servers that work with **Node.js, Bun, and Deno** automatically—no configuration needed!

### Node.js

```bash
npm install hono @hono/node-server
npm run build
node dist/server.js
```

### Bun

```bash
bun add hono
bun run build
bun run dist/server.js
```

### Deno

```bash
# No installation needed - Deno uses npm: specifiers
npm run build
deno run --allow-net --allow-read dist/server.js
```

The generated server automatically detects the runtime and uses the appropriate APIs.

## Requirements

- **Vite 6+** - Uses Environment API for parallel builds
- **Hono 4+** - Modern Hono with TypeScript support
- **Runtime** - Node.js 18+, Bun 1.0+, or Deno 1.30+

## Limitations

### WebSocket Support

WebSocket connections are **not supported**. The plugin middleware doesn't handle HTTP upgrade requests. Use Server-Sent Events instead:

```typescript
// hono/index.ts
api.get('/events', (c) => {
  return c.streamText(async (stream) => {
    await stream.write('data: Hello\n\n');
    // Send updates...
  });
});
```

### Type Safety

Basic TypeScript support only. No automatic API route type generation or OpenAPI schema generation.

## Troubleshooting

### "Missing required peer dependency: hono"

Install Hono:

```bash
npm install hono
```

For Node.js runtime, also install:

```bash
npm install @hono/node-server @types/node
```

### "Vite 6+ required"

This plugin requires Vite 6 or later. It's fully compatible with both Vite 6 and Vite 7 (including the new Environment API).

Upgrade Vite:

```bash
npm install vite@latest
```

**Vite 7 Compatibility**: The plugin fully supports Vite 7's Environment API with environment-aware hooks, per-environment lifecycle management, and proper server/client environment filtering.

### "hono/index.ts not found"

Create the required file structure:

```bash
mkdir hono
cat > hono/index.ts << 'EOF'
import { Hono } from 'hono';

const api = new Hono();
api.get('/', (c) => c.json({ message: 'Hello World' }));

export default api;
EOF
```

### API routes return 404

Ensure your Hono app exports a default export:

```typescript
// ✅ Correct
export default api;

// ❌ Incorrect
export { api };
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Commit Convention

This project uses [Conventional Commits](https://conventionalcommits.org/) for automated versioning and changelog generation. Please follow the format:

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `style:` for formatting changes
- `refactor:` for code refactoring
- `test:` for adding or updating tests
- `chore:` for maintenance tasks

Example: `feat: add new API endpoint`

## License

MIT
