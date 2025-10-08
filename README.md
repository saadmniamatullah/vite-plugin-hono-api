# @saadmniamatullah/vite-plugin-hono-api

[![CI](https://github.com/saadmniamatullah/vite-plugin-hono-api/workflows/CI/badge.svg)](https://github.com/saadmniamatullah/vite-plugin-hono-api/actions)
[![codecov](https://codecov.io/gh/saadmniamatullah/vite-plugin-hono-api/graph/badge.svg)](https://codecov.io/gh/saadmniamatullah/vite-plugin-hono-api)
[![npm version](https://badge.fury.io/js/%40saadmniamatullah%2Fvite-plugin-hono-api.svg)](https://www.npmjs.com/package/@saadmniamatullah/vite-plugin-hono-api)

A low-config Vite plugin that integrates a Hono API with your frontend. Create `hono/index.ts` and you're ready to go.

## Installation

```bash
npm install @saadmniamatullah/vite-plugin-hono-api --save-dev
```

### Peer Dependencies

```bash
npm install hono @hono/node-server @types/node
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

## Requirements

- **Vite 6+** - Uses Environment API for parallel builds
- **Hono 4+** - Modern Hono with TypeScript support
- **Node.js 18+** - Required for ESM support

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

### "Missing required peer dependencies"

Install the peer dependencies:

```bash
npm install hono @hono/node-server @types/node
```

### "Vite 6+ required"

Upgrade Vite:

```bash
npm install vite@latest
```

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

## License

MIT
