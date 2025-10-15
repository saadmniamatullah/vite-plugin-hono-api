import type { Plugin, ViteDevServer } from 'vite';
import { createRequire } from 'node:module';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';

type JsonRecord = Record<string, unknown>;
type NextFunction = (err?: unknown) => void;

interface HonoAppLike {
  fetch(request: Request): Response | Promise<Response>;
}

type ModuleLoader = (url: string) => Promise<unknown>;

interface ModuleGraphLike {
  getModuleByUrl(url: string, ssr?: boolean): Promise<unknown>;
  invalidateModule(module: unknown): void;
}

type EnvironmentLike = object | undefined;

type ServerWithEnvironments = ViteDevServer & {
  environments?: Record<string, EnvironmentLike>;
};

export interface HonoPluginOptions {
  basePath?: string;
  port?: number;
}

const requireFromPlugin = createRequire(import.meta.url);

const HONO_ENTRY = 'hono/index.ts';
const WRAPPER_FILE = '.hono-server.mjs';

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toHeaderValue = (value: string | readonly string[] | undefined): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const entry of value) {
      if (typeof entry === 'string' && entry.length > 0) {
        parts.push(entry);
      }
    }
    return parts.length > 0 ? parts.join(', ') : undefined;
  }
  return undefined;
};

const toSingleHeaderValue = (value: string | readonly string[] | undefined): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && entry.length > 0) {
        return entry;
      }
    }
  }
  return undefined;
};

const indentBlock = (code: string, spaces = 2) =>
  code
    .split('\n')
    .map((line) => (line ? `${' '.repeat(spaces)}${line}` : line))
    .join('\n');

const getEnvironmentFromContext = (context: unknown): EnvironmentLike =>
  (context as { environment?: EnvironmentLike }).environment;

const pickModuleGraph = (candidate: EnvironmentLike): ModuleGraphLike | undefined => {
  if (!candidate || typeof candidate !== 'object') return undefined;
  const graph = (candidate as { moduleGraph?: unknown }).moduleGraph;
  if (
    graph &&
    typeof (graph as ModuleGraphLike).getModuleByUrl === 'function' &&
    typeof (graph as ModuleGraphLike).invalidateModule === 'function'
  ) {
    return graph as ModuleGraphLike;
  }
  return undefined;
};

const pickModuleLoader = (candidate: EnvironmentLike): ModuleLoader | undefined => {
  if (!candidate || typeof candidate !== 'object') return undefined;
  const container = (candidate as { pluginContainer?: unknown }).pluginContainer;
  if (container && typeof (container as { ssrLoadModule?: unknown }).ssrLoadModule === 'function') {
    return (container as { ssrLoadModule: ModuleLoader }).ssrLoadModule;
  }
  return undefined;
};

const dependencyExists = (specifier: string): boolean => {
  try {
    requireFromPlugin.resolve(specifier);
    return true;
  } catch {
    return false;
  }
};

const fileExists = (path: string) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

const readJsonFile = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

const isHonoApp = (value: unknown): value is HonoAppLike =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { fetch?: unknown }).fetch === 'function';

const generateWrapper = (basePath: string, port: number) => {
  const denoBlock = `const honoDenoModule = 'npm:@hono/deno@^1.0.0';
const { serveStatic } = await import(/* @vite-ignore */ honoDenoModule);
app.use('*', serveStatic({ root: './frontend' }));
app.get('*', serveStatic({ root: './frontend', path: 'index.html' }));

const serverPort = Number(Deno.env.get('PORT') ?? ${port});
Deno.serve({ port: serverPort }, app.fetch);
console.log(\`Server running on http://localhost:\${serverPort} (Deno)\`);`;

  const bunBlock = `const bunStaticModule = 'hono/bun';
const { serveStatic } = await import(/* @vite-ignore */ bunStaticModule);
app.use('*', serveStatic({ root: './frontend' }));
app.get('*', serveStatic({ root: './frontend', path: 'index.html' }));

const serverPort = Number(process.env.PORT ?? ${port});
runtimeExport = {
  port: serverPort,
  fetch: app.fetch,
};
console.log(\`Server running on http://localhost:\${serverPort} (Bun)\`);`;

  const nodeBlock = `const nodeServerModule = '@hono/node-server';
const nodeServeStaticModule = '@hono/node-server/serve-static';
const { serve } = await import(/* @vite-ignore */ nodeServerModule);
const { serveStatic } = await import(/* @vite-ignore */ nodeServeStaticModule);
app.use('*', serveStatic({ root: './frontend' }));
app.get('*', serveStatic({ root: './frontend', path: 'index.html' }));

const serverPort = Number(process.env.PORT ?? ${port});
serve({ fetch: app.fetch, port: serverPort });
console.log(\`Server running on http://localhost:\${serverPort} (Node.js)\`);`;

  return `// Auto-generated by vite-plugin-hono (multi-runtime)
import { Hono } from 'hono';
import api from './hono/index';

const app = new Hono();
app.route('${basePath}', api);

let runtimeExport = app;

// Runtime detection and initialization
const runtime = (() => {
  if (typeof Deno !== 'undefined') return 'deno';
  if (typeof Bun !== 'undefined') return 'bun';
  return 'node';
})();

switch (runtime) {
  case 'deno': {
${indentBlock(denoBlock, 4)}
    break;
  }
  case 'bun': {
${indentBlock(bunBlock, 4)}
    break;
  }
  case 'node':
  default: {
${indentBlock(nodeBlock, 4)}
    break;
  }
}

export default runtimeExport;`;
};

const copyDeployFiles = (targetDir: string, workingDir: string) => {
  mkdirSync(targetDir, { recursive: true });

  for (const file of [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lockb',
  ]) {
    const path = join(workingDir, file);
    if (!fileExists(path)) continue;

    if (file === 'package.json') {
      const pkgRaw = readJsonFile(path);
      if (!isJsonRecord(pkgRaw)) {
        throw new Error(`Invalid package.json structure at ${path}`);
      }

      const pkgWithScripts: JsonRecord = {
        ...pkgRaw,
        scripts: { start: 'node server.js' },
      };

      writeFileSync(join(targetDir, file), JSON.stringify(pkgWithScripts, null, 2) + '\n', 'utf8');
    } else {
      copyFileSync(path, join(targetDir, file));
    }
  }
};

const loadHonoApp = async ({
  server,
  environment,
}: {
  server: ViteDevServer;
  environment?: EnvironmentLike;
}): Promise<HonoAppLike> => {
  const serverWithEnv = server as unknown as ServerWithEnvironments;
  const serverEnvironment = serverWithEnv.environments?.server;

  const moduleGraph =
    pickModuleGraph(environment) ??
    pickModuleGraph(serverEnvironment) ??
    (server.moduleGraph as unknown as ModuleGraphLike);

  const loader =
    pickModuleLoader(environment) ??
    pickModuleLoader(serverEnvironment) ??
    ((id: string) => server.ssrLoadModule(id));

  const url = `/${HONO_ENTRY}`;
  const moduleNode = await moduleGraph.getModuleByUrl(url, true);
  if (moduleNode) {
    moduleGraph.invalidateModule(moduleNode);
  }

  const loadedModule = await loader(url);
  const app = (loadedModule as { default?: unknown }).default;
  if (!isHonoApp(app)) {
    throw new Error(`${HONO_ENTRY} must export a Hono app with fetch()`);
  }

  return app;
};

const readBody = (req: IncomingMessage): Promise<BodyInit | undefined> =>
  new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(undefined);
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      const body = Buffer.concat(chunks);
      resolve(body as unknown as BodyInit);
    });
    req.on('error', reject);
  });

export default function honoPlugin(options: HonoPluginOptions = {}): Plugin {
  const { basePath = '/api', port = 4173 } = options;

  const environmentState = new WeakMap<object, { wrapperWritten: boolean }>();

  let projectRoot = process.cwd();
  let wrapperPath = join(projectRoot, WRAPPER_FILE);
  let honoEntryPath = join(projectRoot, HONO_ENTRY);
  let hasHonoEntry = false;
  let runCommand: 'build' | 'serve' | 'test' | 'unknown' = 'unknown';
  let wrapperPrimed = false;

  return {
    name: 'vite-plugin-hono',
    applyToEnvironment(environment) {
      return environment.name === 'server' || environment.name === 'ssr';
    },
    perEnvironmentStartEndDuringDev: true,

    config(userConfig, env) {
      runCommand = env.command ?? 'serve';
      projectRoot = userConfig.root ? userConfig.root : process.cwd();
      wrapperPath = join(projectRoot, WRAPPER_FILE);
      honoEntryPath = join(projectRoot, HONO_ENTRY);
      hasHonoEntry = fileExists(honoEntryPath);

      if (!hasHonoEntry) {
        return {};
      }

      if (!dependencyExists('hono')) {
        throw new Error(
          '❌ vite-plugin-hono-api requires the `hono` package.\n' +
            'Install it via `pnpm add hono`, `npm install hono`, or `bun add hono`.'
        );
      }

      return {
        build: { outDir: 'dist/frontend', emptyOutDir: true },
        environments: {
          server: {
            build: {
              outDir: 'dist',
              ssr: runCommand === 'build' ? `./${WRAPPER_FILE}` : HONO_ENTRY,
              copyPublicDir: false,
              emptyOutDir: false,
              rollupOptions: { output: { entryFileNames: 'server.js', format: 'esm' } },
            },
          },
        },
        builder: {
          async buildApp(builder) {
            const targets = Object.values(builder.environments ?? {}).filter(Boolean);
            if (targets.length === 0) return;
            await Promise.all(targets.map((target) => builder.build(target)));
            copyDeployFiles('dist', projectRoot);
          },
        },
      };
    },

    configResolved(config) {
      projectRoot = config.root;
      wrapperPath = join(projectRoot, WRAPPER_FILE);
      honoEntryPath = join(projectRoot, HONO_ENTRY);
      hasHonoEntry = fileExists(honoEntryPath);

      const logger = config.logger ?? console;

      if (!hasHonoEntry) {
        logger.warn(
          `⚠️  ${HONO_ENTRY} not found. Hono API will not be available until you create it.`
        );
        return;
      }

      if (runCommand === 'build' && config.environments?.server?.build) {
        config.environments.server.build.ssr = `./${WRAPPER_FILE}`;
      }

      if (runCommand === 'build' && !wrapperPrimed) {
        writeFileSync(wrapperPath, generateWrapper(basePath, port), 'utf8');
        wrapperPrimed = true;
      }

      if (!dependencyExists('@hono/node-server')) {
        logger.warn(
          '⚠️  Optional dependency `@hono/node-server` is missing. Node.js runtime mode will fail at runtime.'
        );
      }
    },

    configEnvironment(name, environmentConfig) {
      if (name !== 'server' || !hasHonoEntry) return;

      environmentConfig.build ??= {};
      environmentConfig.build.outDir ??= 'dist';
      environmentConfig.build.copyPublicDir ??= false;
      environmentConfig.build.emptyOutDir ??= false;
      const rollupOptions = (environmentConfig.build.rollupOptions ??= {});
      const existingOutput = rollupOptions.output;
      if (Array.isArray(existingOutput)) {
        rollupOptions.output =
          existingOutput.length === 0
            ? [{ entryFileNames: 'server.js', format: 'esm' }]
            : existingOutput.map((entry, index) =>
                index === 0
                  ? {
                      ...entry,
                      entryFileNames: entry?.entryFileNames ?? 'server.js',
                      format: entry?.format ?? 'esm',
                    }
                  : entry
              );
      } else {
        rollupOptions.output = {
          ...(existingOutput ?? {}),
          entryFileNames: existingOutput?.entryFileNames ?? 'server.js',
          format: existingOutput?.format ?? 'esm',
        };
      }
      environmentConfig.build.ssr = runCommand === 'build' ? `./${WRAPPER_FILE}` : HONO_ENTRY;
    },

    buildStart() {
      if (runCommand !== 'build' || !hasHonoEntry) return;
      const environment = getEnvironmentFromContext(this);
      if (!environment || typeof environment !== 'object') return;
      const envObject = environment;

      const info = environmentState.get(envObject) ?? { wrapperWritten: false };
      if (!info.wrapperWritten) {
        if (!wrapperPrimed) {
          writeFileSync(wrapperPath, generateWrapper(basePath, port), 'utf8');
          wrapperPrimed = true;
        }
        info.wrapperWritten = true;
        environmentState.set(envObject, info);
      }
    },

    closeBundle() {
      const removeWrapper = () => {
        try {
          if (fileExists(wrapperPath)) {
            unlinkSync(wrapperPath);
          }
        } catch (error) {
          console.warn('Failed to remove generated Hono wrapper file:', error);
        } finally {
          wrapperPrimed = false;
        }
      };

      const environment = getEnvironmentFromContext(this);
      if (!environment || typeof environment !== 'object') {
        removeWrapper();
        return;
      }

      const envObject = environment;
      const info = environmentState.get(envObject);
      if (!info?.wrapperWritten) return;

      environmentState.delete(envObject);
      removeWrapper();
    },

    configureServer(server) {
      const serverLogger = server.config?.logger ?? console;

      if (!hasHonoEntry) {
        serverLogger.warn(
          `⚠️  ${HONO_ENTRY} not found. Hono API middleware disabled.\n` +
            `Create this file to enable the API:\n` +
            `  mkdir -p hono\n` +
            `  echo "import { Hono } from 'hono';\\n\\n` +
            `const api = new Hono();\\n` +
            `api.get('/', (c) => c.json({ message: 'Hello World' }));\\n\\n` +
            `export default api;\\n" > ${HONO_ENTRY}`
        );
        return;
      }

      const environment =
        getEnvironmentFromContext(this) ??
        (server as unknown as ServerWithEnvironments).environments?.server;

      const handleRequest = async (
        req: IncomingMessage,
        res: ServerResponse,
        next: NextFunction
      ) => {
        if (!req.url || !req.method) {
          next();
          return;
        }

        const protocol = toSingleHeaderValue(req.headers['x-forwarded-proto']) ?? 'http';
        const host = toSingleHeaderValue(req.headers.host) ?? 'localhost:5173';
        const incomingUrl = new URL(req.url, `${protocol}://${host}`);
        if (!incomingUrl.pathname.startsWith(basePath)) {
          next();
          return;
        }

        try {
          const strippedPath = incomingUrl.pathname.slice(basePath.length) || '/';
          const targetUrl = new URL(strippedPath + incomingUrl.search, incomingUrl.origin);
          const app = await loadHonoApp({ server, environment });

          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            const normalized = toHeaderValue(value);
            if (normalized) {
              headers.set(key, normalized);
            }
          }

          const request = new Request(targetUrl.toString(), {
            method: req.method,
            headers,
            body: await readBody(req),
          });

          const response = await app.fetch(request);

          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.writeHead(response.status);

          if (response.body) {
            const reader = response.body.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
              }
            } finally {
              reader.releaseLock();
            }
          }

          res.end();
        } catch (error) {
          console.error('Hono middleware error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      };

      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: NextFunction) => {
        void handleRequest(req, res, next);
      });
    },
  };
}
