# @saadmniamatullah/vite-plugin-hono-api

[![CI](https://github.com/saadmniamatullah/vite-plugin-saad/workflows/CI/badge.svg)](https://github.com/saadmniamatullah/vite-plugin-saad/actions)
[![codecov](https://codecov.io/gh/saadmniamatullah/vite-plugin-saad/graph/badge.svg?token=YOUR_CODECOV_TOKEN)](https://codecov.io/gh/saadmniamatullah/vite-plugin-saad)
[![npm version](https://badge.fury.io/js/%40saadmniamatullah%2Fvite-plugin-hono-api.svg)](https://badge.fury.io/js/%40saadmniamatullah%2Fvite-plugin-hono-api)

A low-config Vite plugin that integrates a Hono app as an API. Create `hono/index.ts` and you're ready to go.

## Prerequisites

Before installing this plugin, ensure you have:

- **Node.js 18+** - Required for the build process and runtime
- **Vite 6+** - Uses the Environment API for parallel builds
- **TypeScript** - Recommended for better development experience
- **Required peer dependencies** (install separately):
  ```bash
  npm install hono @hono/node-server @types/node
  ```

### Project Structure Requirements

This plugin expects a specific file structure:

```
your-project/
├── hono/
│   └── index.ts          # Required: Your Hono app entry point
├── src/                  # Your frontend source code
├── vite.config.ts        # Your Vite configuration
└── package.json
```

The `hono/index.ts` file **must exist** and export a default Hono app.

## Features

- 🔌 **Low Configuration**: Works out of the box with sensible defaults (requires hono/index.ts)
- 🏗️ **Automatic Builds**: Builds both frontend and server in parallel
- 📁 **Standardized Structure**: Always uses `hono/index.ts` as entry point
- ⚡ **Fast Development**: Hot reload for both frontend and API
- 🚀 **Production Ready**: Optimized builds for `dist/frontend` and `dist/server.js`

## Limitations

This plugin has some known limitations:

### WebSocket Support

❌ **WebSocket connections are not supported** - The plugin middleware does not handle HTTP upgrade requests. If you need real-time communication, consider using:

- **Server-Sent Events (SSE)** - Supported for one-way streaming from server to client
- **External WebSocket service** - Use a dedicated WebSocket server alongside this plugin

### Type Safety

⚠️ **Basic type safety only** - The plugin provides TypeScript typings for configuration options, but does not offer:

- Request/response type inference
- Automatic API route type generation
- OpenAPI schema generation

### Package Manager Support

📦 **Lockfile copying only** - The plugin copies whichever lockfile it finds (npm, pnpm, yarn, bun) to the output directory, but does not:

- Install dependencies during build
- Manage package manager-specific features
- Handle multiple package managers in one project

### Native Dependencies

🔧 **Limited native dependency support** - Native dependencies (like SQLite drivers) work through Node.js SSR bundling but have no special handling. Performance may vary depending on the driver and Vite's bundling behavior.

## Installation

### Step 1: Authenticate with GitHub Packages

This plugin is published to GitHub Packages. You need to authenticate to install it.

Create or update `.npmrc` in your project root:

```ini
# .npmrc
@saadmniamatullah:registry=https://npm.pkg.github.com
```

**Important:** You also need a personal access token with `read:packages` scope. Create one at [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens).

Then authenticate by running:

```bash
npm login --scope=@saadmniamatullah --registry=https://npm.pkg.github.com
```

Use your GitHub username and the personal access token as your password.

### Step 2: Install the Plugin

Install the plugin as a dev dependency:

```bash
npm install @saadmniamatullah/vite-plugin-hono-api --save-dev
# or
pnpm add @saadmniamatullah/vite-plugin-hono-api -D
# or
yarn add @saadmniamatullah/vite-plugin-hono-api --dev
# or
bun add @saadmniamatullah/vite-plugin-hono-api -d
```

### Step 3: Install Peer Dependencies

Install the required peer dependencies:

```bash
npm install hono @hono/node-server @types/node
# or
pnpm add hono @hono/node-server @types/node
```

## Quick Start

### 1. Create your Hono app

Create `hono/index.ts`:

```typescript
import { Hono } from 'hono';

export const api = new Hono();

api.get('/', (c) => c.json({ message: 'Hello from Hono!' }));
api.get('/health', (c) => c.json({ status: 'ok' }));

export default api;
```

### 2. Configure Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import honoApi from '@saadmniamatullah/vite-plugin-hono-api';

export default defineConfig({
  plugins: [
    react(),
    honoApi({
      basePath: '/api', // Optional override
    }),
  ],
});
```

That's it! Your Vite project now has:

- ✅ API at `/api/*` during development
- ✅ Frontend build to `dist/frontend`
- ✅ Server build to `dist/server.js`

## Plugin Options

```typescript
interface HonoPluginOptions {
  basePath?: string; // API base path (default: '/api')
  port?: number; // Default port for generated server wrapper (default: 4173)
}
```

## How It Works

### Development Mode

- Plugin checks if `hono/index.ts` exists
- If found, intercepts requests matching `basePath` (default `/api`)
- Forwards them to your Hono app
- If no file exists, no API is mounted

### Build Mode

- If `hono/index.ts` exists, automatically configures Vite Environment API
- Builds frontend to `dist/frontend/`
- Builds server bundle to `dist/server.js`
- If no file exists, builds frontend only

## Build Output

```
dist/
├── frontend/          # Your React/Vue/etc. app
│   ├── index.html
│   ├── assets/
│   └── ...
└── server.js          # Your Hono server bundle (ready to run with node)
```

## Package Scripts

```json
{
  "scripts": {
    "dev": "vite", // Development mode
    "build": "vite build", // Builds both frontend + server
    "start": "node dist/server.js",
    "preview": "vite preview"
  }
}
```

## Example Project Structure

```
my-app/
├── hono/
│   └── index.ts          # Your Hono app
├── src/
│   └── main.tsx           # Your frontend
├── vite.config.ts
└── package.json
```

## Before vs After

### Before (Manual Setup)

```typescript
export default defineConfig({
  build: { outDir: 'dist/frontend' },
  environments: {
    server: {
      build: {
        outDir: 'dist/',
        ssr: 'hono/index.ts',
        rollupOptions: {
          output: {
            entryFileNames: 'server.js',
            format: 'esm'
          }
        }
      }
    }
  },
  builder: { buildApp: async (builder) => { ... } }
})
```

### After (With Plugin)

```typescript
export default defineConfig({
  plugins: [vitePluginHono()],
});
```

## Troubleshooting

### Common Issues

#### "Missing required peer dependencies" Error

**Problem:** Plugin throws error about missing dependencies.

**Solution:** Install the peer dependencies:

```bash
npm install hono @hono/node-server @types/node
```

#### "Vite 6+ required" Error

**Problem:** Plugin doesn't work with older Vite versions.

**Solution:** Upgrade Vite:

```bash
npm install vite@latest
```

#### "hono/index.ts not found" Warning

**Problem:** Plugin warns about missing Hono entry file.

**Solution:** Create the required file structure:

```bash
mkdir hono
cat > hono/index.ts << 'EOF'
import { Hono } from 'hono';

const api = new Hono();
api.get('/', (c) => c.json({ message: 'Hello World' }));

export default api;
EOF
```

#### API routes return 404

**Problem:** Frontend requests to `/api/*` don't reach the Hono app.

**Solution:** Ensure your Hono app exports a default export with a `fetch` method:

```typescript
import { Hono } from 'hono';

const api = new Hono();
api.get('/', (c) => c.json({ message: 'Hello World' }));

// This export is required
export default api;
```

#### Build fails with "Cannot resolve module"

**Problem:** TypeScript can't find Hono modules during build.

**Solution:** Check your `tsconfig.json` includes Node.js types:

```json
{
  "compilerOptions": {
    "types": ["node"]
  }
}
```

### Getting Help

If you're still having issues:

1. **Check the console output** - The plugin provides detailed error messages
2. **Verify file structure** - Ensure `hono/index.ts` exists and exports correctly
3. **Review the examples** - See the `vite/` directory for a working example
4. **Check GitHub Issues** - [Report bugs or request features](https://github.com/saadmniamatullah/vite-plugin-saad/issues)

### Server-Sent Events Example

Since WebSockets aren't supported, here's how to use Server-Sent Events for real-time updates:

```typescript
// hono/index.ts
import { Hono } from 'hono';

const api = new Hono();

api.get('/events', (c) => {
  return c.streamText(async (stream) => {
    await stream.write('data: Initial message\n\n');

    // Send updates every second
    const interval = setInterval(async () => {
      await stream.write(`data: Time: ${new Date().toISOString()}\n\n`);
    }, 1000);

    // Cleanup on disconnect
    stream.onAbort(() => clearInterval(interval));
  });
});

export default api;
```

Client-side usage:

```typescript
// Your frontend code
const eventSource = new EventSource('/api/events');

eventSource.onmessage = (event) => {
  console.log('Received:', event.data);
};

eventSource.onerror = (error) => {
  console.error('SSE Error:', error);
};
```

## Requirements

- **Vite 6+** (with Environment API support) - Required for parallel frontend/server builds
  - To upgrade: `npm install vite@latest` or check your package.json
- **Hono 4+** - Modern Hono with improved performance and TypeScript support
- **Node.js 18+** - Required for ESM support and modern JavaScript features

### Why Vite 6+ is Required

This plugin relies on Vite's Environment API (introduced in Vite 6) to:

- Build frontend and server bundles in parallel
- Handle different build targets for each environment
- Provide optimized SSR bundling for the server

If you're using an older version of Vite, you'll need to upgrade before using this plugin.

## License

MIT
