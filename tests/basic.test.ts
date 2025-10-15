import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ConfigEnv, InlineConfig, ResolvedConfig, ViteDevServer } from 'vite';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import honoPlugin from '../src/index';

function createTempProject(options: { includeHono?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'vite-plugin-hono-'));
  if (options.includeHono !== false) {
    mkdirSync(join(dir, 'hono'), { recursive: true });

    writeFileSync(
      join(dir, 'hono/index.ts'),
      'export default { fetch: (request: Request) => new Response(JSON.stringify({ url: request.url })) };\n',
      'utf8'
    );
  }

  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.0.0' }),
    'utf8'
  );

  return dir;
}

type NextFunction = (err?: unknown) => void;

type MiddlewareFn = (req: IncomingMessage, res: ServerResponse, next: NextFunction) => unknown;

interface ResponseSpy {
  status: number | undefined;
  ended: boolean;
  body(): string;
  header(key: string): string | undefined;
  setHeader(key: string, value: string | number | readonly string[]): void;
  writeHead(code: number): void;
  write(chunk: string | Uint8Array): void;
  end(chunk?: string | Uint8Array): void;
  waitForEnd(): Promise<void>;
}

const createResponseSpy = (): ResponseSpy => {
  const chunks: Uint8Array[] = [];
  const headers = new Map<string, string>();
  let resolveEnd: (() => void) | undefined;
  const completed = new Promise<void>((resolve) => {
    resolveEnd = resolve;
  });
  return {
    status: undefined,
    ended: false,
    setHeader(key: string, value: string | number | readonly string[]) {
      const normalized =
        typeof value === 'string'
          ? value
          : Array.isArray(value)
            ? value.join(', ')
            : value.toString();
      headers.set(key.toLowerCase(), normalized);
    },
    writeHead(code: number, headersObj?: Record<string, string>) {
      this.status = code;
      if (headersObj) {
        for (const [key, value] of Object.entries(headersObj)) {
          headers.set(key.toLowerCase(), value);
        }
      }
    },
    write(chunk: string | Uint8Array) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
    },
    end(chunk?: string | Uint8Array) {
      if (chunk) this.write(chunk);
      this.ended = true;
      resolveEnd?.();
    },
    body() {
      return Buffer.concat(chunks).toString();
    },
    header(key: string) {
      return headers.get(key.toLowerCase());
    },
    waitForEnd() {
      return completed;
    },
  };
};

const createRequest = (options: {
  url: string;
  method: string;
  headers?: IncomingHttpHeaders;
}): IncomingMessage => {
  const request = new EventEmitter() as IncomingMessage;
  request.url = options.url;
  request.method = options.method;
  request.headers = options.headers ?? {};
  return request;
};

const applyConfigHook = async (
  pluginInstance: ReturnType<typeof honoPlugin>,
  inlineConfig: InlineConfig,
  env: ConfigEnv
) => {
  const hook =
    typeof pluginInstance.config === 'function'
      ? pluginInstance.config
      : pluginInstance.config?.handler;

  if (!hook) return undefined;

  const context = {} as ThisParameterType<typeof hook>;
  return hook.call(context, inlineConfig, env);
};

const applyConfigResolvedHook = async (
  pluginInstance: ReturnType<typeof honoPlugin>,
  resolvedConfig: ResolvedConfig
) => {
  const hook =
    typeof pluginInstance.configResolved === 'function'
      ? pluginInstance.configResolved
      : pluginInstance.configResolved?.handler;

  if (!hook) return;

  const context = {} as ThisParameterType<typeof hook>;
  await hook.call(context, resolvedConfig);
};

const applyBuildStartHook = async (
  pluginInstance: ReturnType<typeof honoPlugin>,
  context: { environment?: { name?: string } }
) => {
  const hook =
    typeof pluginInstance.buildStart === 'function'
      ? pluginInstance.buildStart
      : pluginInstance.buildStart?.handler;

  if (!hook) return;

  const hookContext = { ...context } as ThisParameterType<typeof hook> & typeof context;
  await hook.call(hookContext, undefined as never);
};

const applyCloseBundleHook = async (pluginInstance: ReturnType<typeof honoPlugin>) => {
  const hook =
    typeof pluginInstance.closeBundle === 'function'
      ? pluginInstance.closeBundle
      : pluginInstance.closeBundle?.handler;

  if (!hook) return;

  const context = {} as ThisParameterType<typeof hook>;
  await hook.call(context);
};

const applyConfigureServerHook = async (
  pluginInstance: ReturnType<typeof honoPlugin>,
  server: unknown
) => {
  const hook =
    typeof pluginInstance.configureServer === 'function'
      ? pluginInstance.configureServer
      : pluginInstance.configureServer?.handler;

  if (!hook) return;

  const context = {} as ThisParameterType<typeof hook>;
  await hook.call(context, server as ViteDevServer);
};

describe('vite-plugin-saad', () => {
  it('generates and cleans up the server wrapper during build', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'build', mode: 'production' };
    const returnedConfig = (await applyConfigHook(plugin, inlineConfig, env)) ?? {};

    expect(returnedConfig.environments?.server?.build?.ssr).toBe('./.hono-server.mjs');

    const resolvedConfig = {
      root,
      environments: { server: { build: {} } },
    } as unknown as ResolvedConfig;
    await applyConfigResolvedHook(plugin, resolvedConfig);

    const wrapperPath = join(root, '.hono-server.mjs');
    const wrapperContents = readFileSync(wrapperPath, 'utf8');
    expect(wrapperContents).toContain("app.route('/api'");
    expect(wrapperContents).toContain("app.use('*', serveStatic({ root: './frontend' }));");
    expect(wrapperContents).toContain(
      "app.get('*', serveStatic({ root: './frontend', path: 'index.html' }));"
    );

    await applyBuildStartHook(plugin, { environment: { name: 'server' } });
    expect(readFileSync(wrapperPath, 'utf8')).toContain('Server running');

    await applyCloseBundleHook(plugin);
    expect(() => readFileSync(wrapperPath, 'utf8')).toThrow();

    rmSync(root, { recursive: true, force: true });
  });

  it('uses runtime-scoped dynamic imports in the generated wrapper', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'build', mode: 'production' };
    await applyConfigHook(plugin, inlineConfig, env);

    const resolvedConfig = {
      root,
      environments: { server: { build: {} } },
    } as unknown as ResolvedConfig;
    await applyConfigResolvedHook(plugin, resolvedConfig);

    const wrapperPath = join(root, '.hono-server.mjs');
    const wrapper = readFileSync(wrapperPath, 'utf8');

    expect(wrapper).toContain('const runtime = (() => {');
    expect(wrapper).toContain('await import(/* @vite-ignore */ honoDenoModule);');
    expect(wrapper).not.toContain("await import('npm:@hono/deno");
    expect(wrapper).toContain('await import(/* @vite-ignore */ bunStaticModule);');
    expect(wrapper).not.toContain("await import('hono/bun");
    expect(wrapper).toContain('await import(/* @vite-ignore */ nodeServerModule);');
    expect(wrapper).not.toContain("await import('@hono/node-server");

    await applyCloseBundleHook(plugin);
    rmSync(root, { recursive: true, force: true });
  });

  it('copies deploy files after running builder for client and server', async () => {
    const root = createTempProject();
    // Add yarn.lock to test that path
    writeFileSync(join(root, 'yarn.lock'), '# yarn lockfile', 'utf8');

    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'build', mode: 'production' };
    const returnedConfig = (await applyConfigHook(plugin, inlineConfig, env)) ?? {};

    const buildSpy = vi.fn<(target: unknown) => Promise<void>>().mockResolvedValue(undefined);

    const builderArgs = {
      environments: { client: 'client-env', server: 'server-env' },
      build: buildSpy,
    } as const;

    const builderHook = returnedConfig.builder;
    if (builderHook?.buildApp) {
      const buildApp = builderHook.buildApp;
      type BuildAppArgs = Parameters<typeof buildApp>[0];
      await buildApp.call(builderHook, builderArgs as unknown as BuildAppArgs);
    }

    expect(buildSpy).toHaveBeenNthCalledWith(1, 'client-env');
    expect(buildSpy).toHaveBeenNthCalledWith(2, 'server-env');

    let distPackagePath = join(root, 'dist/package.json');
    try {
      readFileSync(distPackagePath, 'utf8');
    } catch {
      distPackagePath = join(process.cwd(), 'dist/package.json');
    }

    const distPackage = readFileSync(distPackagePath, 'utf8');
    const parsedPackage = JSON.parse(distPackage) as { scripts?: Record<string, string> };
    expect(parsedPackage.scripts).toEqual({ start: 'node server.js' });

    // Verify yarn.lock was copied
    const distYarnLock = join(root, 'dist/yarn.lock');
    try {
      const yarnLockContents = readFileSync(distYarnLock, 'utf8');
      expect(yarnLockContents).toContain('# yarn lockfile');
    } catch {
      // If not in root/dist, check process.cwd()/dist
      const cwdYarnLock = join(process.cwd(), 'dist/yarn.lock');
      const yarnLockContents = readFileSync(cwdYarnLock, 'utf8');
      expect(yarnLockContents).toContain('# yarn lockfile');
    }

    rmSync(root, { recursive: true, force: true });
    rmSync(join(process.cwd(), 'dist'), { recursive: true, force: true });
  });

  it('proxies API requests during development and falls through otherwise', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const serveEnv: ConfigEnv = { command: 'serve', mode: 'development' };
    await applyConfigHook(plugin, inlineConfig, serveEnv);
    const serveResolvedConfig = {
      root,
      environments: { server: { build: {} } },
    } as unknown as ResolvedConfig;
    await applyConfigResolvedHook(plugin, serveResolvedConfig);

    type MiddlewareFn = (req: IncomingMessage, res: ServerResponse, next: NextFunction) => unknown;
    let middleware: MiddlewareFn | undefined;
    let fetchInvoked = false;
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>((_request) => {
      fetchInvoked = true;
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    });

    const server = {
      moduleGraph: {
        getModuleByUrl: vi
          .fn<(url: string, ssr?: boolean) => Promise<null>>()
          .mockResolvedValue(null),
        invalidateModule: vi.fn<(module: unknown) => void>(),
      },
      ssrLoadModule: vi
        .fn<(url: string) => Promise<{ default: { fetch: typeof fetchMock } }>>()
        .mockResolvedValue({ default: { fetch: fetchMock } }),
      middlewares: {
        use: vi.fn<(fn: MiddlewareFn) => unknown>(),
      },
      config: { logger: { warn: vi.fn<(msg: string) => void>() } },
    };

    server.middlewares.use.mockImplementation((fn) => {
      middleware = fn;
      return server;
    });

    await applyConfigureServerHook(plugin, server);
    expect(typeof middleware).toBe('function');

    if (!middleware) throw new Error('Middleware was not registered');

    const next = vi.fn<NextFunction>(() => undefined);
    await middleware(
      createRequest({ url: '/about', method: 'GET', headers: {} }),
      createResponseSpy() as unknown as ServerResponse,
      next
    );
    expect(next).toHaveBeenCalledOnce();

    const apiResponse = createResponseSpy();
    const fallthrough = vi.fn<NextFunction>(() => undefined);
    await middleware(
      createRequest({
        url: '/api/message',
        method: 'GET',
        headers: { host: 'localhost:5173' },
      }),
      apiResponse as unknown as ServerResponse,
      fallthrough
    );
    await apiResponse.waitForEnd();

    expect(server.ssrLoadModule).toHaveBeenCalled();
    expect(fallthrough).not.toHaveBeenCalled();
    expect(apiResponse.status).toBe(200);
    expect(fetchInvoked).toBe(true);

    // Verify the Hono app received the stripped path (without /api prefix)
    const fetchCallArgs = fetchMock.mock.calls[0];
    const receivedRequest = fetchCallArgs[0];
    expect(receivedRequest.url).toContain('/message');
    expect(receivedRequest.url).not.toContain('/api/message');

    expect(apiResponse.status).toBe(200);
    expect(apiResponse.header('content-type')).toBe('application/json');
    expect(apiResponse.body()).toContain('{"ok":true}');

    rmSync(root, { recursive: true, force: true });
  });

  it('respects custom basePath and port options', async () => {
    const root = createTempProject();
    const plugin = honoPlugin({ basePath: '/backend', port: 9090 });

    const buildConfig: InlineConfig = { root };
    const buildEnv: ConfigEnv = { command: 'build', mode: 'production' };
    await applyConfigHook(plugin, buildConfig, buildEnv);

    const resolvedConfig = {
      root,
      environments: { server: { build: {} } },
    } as unknown as ResolvedConfig;
    await applyConfigResolvedHook(plugin, resolvedConfig);

    const wrapperPath = join(root, '.hono-server.mjs');
    const wrapper = readFileSync(wrapperPath, 'utf8');
    expect(wrapper).toContain("app.route('/backend', api)");
    expect(wrapper).toContain('process.env.PORT ?? 9090');

    await applyCloseBundleHook(plugin);

    // Dev middleware check with custom base path and request body forwarding
    const devPlugin = honoPlugin({ basePath: '/backend' });
    const devConfig: InlineConfig = { root };
    const devEnv: ConfigEnv = { command: 'serve', mode: 'development' };
    await applyConfigHook(devPlugin, devConfig, devEnv);
    const devResolvedConfig = {
      root,
      environments: { server: { build: {} } },
    } as unknown as ResolvedConfig;
    await applyConfigResolvedHook(devPlugin, devResolvedConfig);

    type MiddlewareFn = (req: IncomingMessage, res: ServerResponse, next: NextFunction) => unknown;
    let middleware: MiddlewareFn | undefined;
    let fetchInvoked = false;
    const fetchMock = vi.fn(async (req: Request) => {
      fetchInvoked = true;
      expect(await req.text()).toBe('{"msg":"hi"}');
      return new Response(JSON.stringify({ received: req.url }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    });

    const devServer = {
      moduleGraph: {
        getModuleByUrl: vi
          .fn<(url: string, ssr?: boolean) => Promise<null>>()
          .mockResolvedValue(null),
        invalidateModule: vi.fn<(module: unknown) => void>(),
      },
      ssrLoadModule: vi
        .fn<(url: string) => Promise<{ default: { fetch: typeof fetchMock } }>>()
        .mockResolvedValue({ default: { fetch: fetchMock } }),
      middlewares: {
        use: vi.fn<(fn: MiddlewareFn) => unknown>(),
      },
      config: { logger: { warn: vi.fn<(msg: string) => void>() } },
    };

    devServer.middlewares.use.mockImplementation((fn) => {
      middleware = fn;
      return devServer;
    });

    await applyConfigureServerHook(devPlugin, devServer);

    if (!middleware) throw new Error('Middleware was not registered');

    const req = createRequest({
      url: '/backend/items',
      method: 'POST',
      headers: { host: 'localhost:5173', 'content-type': 'application/json' },
    });

    const res = createResponseSpy();

    setTimeout(() => {
      req.emit('data', Buffer.from('{"msg":"hi"}'));
      req.emit('end');
    }, 0);

    const devFallthrough = vi.fn<NextFunction>(() => undefined);
    await middleware(req, res as unknown as ServerResponse, devFallthrough);
    await res.waitForEnd();

    expect(devServer.ssrLoadModule).toHaveBeenCalled();
    expect(devFallthrough).not.toHaveBeenCalled();
    expect(res.status).toBe(201);
    expect(fetchInvoked).toBe(true);
    const requestArg = fetchMock.mock.calls[0][0];
    expect(requestArg.url).toContain('/items');
    expect(requestArg.url).not.toContain('/backend/items');
    expect(res.status).toBe(201);
    expect(res.body()).toContain('{"received":"http://localhost:5173/items"}');

    rmSync(root, { recursive: true, force: true });
  });

  it('warns when hono entry is missing and skips middleware registration', async () => {
    const root = createTempProject({ includeHono: false });
    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'serve', mode: 'development' };
    await applyConfigHook(plugin, inlineConfig, env);

    const warn = vi.fn<(message: string) => void>();
    const use = vi.fn<(fn: MiddlewareFn) => void>();

    const server = {
      config: { logger: { warn } },
      middlewares: { use },
    };

    use.mockImplementation(() => server);

    await applyConfigureServerHook(plugin, server);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('hono/index.ts not found'));
    expect(use).not.toHaveBeenCalled();

    rmSync(root, { recursive: true, force: true });
  });

  it('handles middleware errors gracefully', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'serve', mode: 'development' };
    await applyConfigHook(plugin, inlineConfig, env);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let middleware: MiddlewareFn | undefined;

    const server = {
      moduleGraph: {
        getModuleByUrl: vi
          .fn<(url: string, ssr?: boolean) => Promise<null>>()
          .mockResolvedValue(null),
        invalidateModule: vi.fn<(module: unknown) => void>(),
      },
      ssrLoadModule: vi
        .fn<(url: string) => Promise<{ default: unknown }>>()
        .mockRejectedValue(new Error('Failed to load Hono app')),
      middlewares: {
        use: vi.fn<(fn: MiddlewareFn) => unknown>(),
      },
      config: { logger: { warn: vi.fn<(msg: string) => void>() } },
    };

    server.middlewares.use.mockImplementation((fn) => {
      middleware = fn;
      return server;
    });

    await applyConfigureServerHook(plugin, server);

    if (!middleware) throw new Error('Middleware was not registered');

    const res = createResponseSpy();
    const next = vi.fn<NextFunction>(() => undefined);

    await middleware(
      createRequest({
        url: '/api/error',
        method: 'GET',
        headers: { host: 'localhost:5173' },
      }),
      res as unknown as ServerResponse,
      next
    );
    await res.waitForEnd();

    expect(errorSpy).toHaveBeenCalledWith('Hono middleware error:', expect.any(Error));
    expect(res.status).toBe(500);
    expect(res.header('content-type')).toBe('application/json');
    expect(res.body()).toContain('Internal server error');

    errorSpy.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  it('calls next() when request is missing url or method', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'serve', mode: 'development' };
    await applyConfigHook(plugin, inlineConfig, env);

    let middleware: MiddlewareFn | undefined;

    const server = {
      moduleGraph: {
        getModuleByUrl: vi
          .fn<(url: string, ssr?: boolean) => Promise<null>>()
          .mockResolvedValue(null),
        invalidateModule: vi.fn<(module: unknown) => void>(),
      },
      ssrLoadModule: vi
        .fn<(url: string) => Promise<{ default: { fetch: () => Response } }>>()
        .mockResolvedValue({
          default: {
            fetch: () => new Response(JSON.stringify({ ok: true })),
          },
        }),
      middlewares: {
        use: vi.fn<(fn: MiddlewareFn) => unknown>(),
      },
      config: { logger: { warn: vi.fn<(msg: string) => void>() } },
    };

    server.middlewares.use.mockImplementation((fn) => {
      middleware = fn;
      return server;
    });

    await applyConfigureServerHook(plugin, server);

    if (!middleware) throw new Error('Middleware was not registered');

    // Test: request without url
    const nextNoUrl = vi.fn<NextFunction>(() => undefined);
    const reqNoUrl = createRequest({ url: '/api/test', method: 'GET' });
    reqNoUrl.url = undefined;

    await middleware(reqNoUrl, createResponseSpy() as unknown as ServerResponse, nextNoUrl);

    expect(nextNoUrl).toHaveBeenCalledOnce();
    expect(server.ssrLoadModule).not.toHaveBeenCalled();

    // Test: request without method
    const nextNoMethod = vi.fn<NextFunction>(() => undefined);
    const reqNoMethod = createRequest({ url: '/api/test', method: 'GET' });
    reqNoMethod.method = undefined;

    await middleware(reqNoMethod, createResponseSpy() as unknown as ServerResponse, nextNoMethod);

    expect(nextNoMethod).toHaveBeenCalledOnce();

    rmSync(root, { recursive: true, force: true });
  });

  it('throws error when hono app does not have fetch method', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'serve', mode: 'development' };
    await applyConfigHook(plugin, inlineConfig, env);

    let middleware: MiddlewareFn | undefined;

    const server = {
      moduleGraph: {
        getModuleByUrl: vi
          .fn<(url: string, ssr?: boolean) => Promise<null>>()
          .mockResolvedValue(null),
        invalidateModule: vi.fn<(module: unknown) => void>(),
      },
      ssrLoadModule: vi
        .fn<(url: string) => Promise<{ default: unknown }>>()
        .mockResolvedValue({ default: { notFetch: 'wrong' } }),
      middlewares: {
        use: vi.fn<(fn: MiddlewareFn) => unknown>(),
      },
      config: { logger: { warn: vi.fn<(msg: string) => void>() } },
    };

    server.middlewares.use.mockImplementation((fn) => {
      middleware = fn;
      return server;
    });

    await applyConfigureServerHook(plugin, server);

    if (!middleware) throw new Error('Middleware was not registered');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createResponseSpy();
    const next = vi.fn<NextFunction>(() => undefined);

    await middleware(
      createRequest({
        url: '/api/test',
        method: 'GET',
        headers: { host: 'localhost:5173' },
      }),
      res as unknown as ServerResponse,
      next
    );
    await res.waitForEnd();

    expect(errorSpy).toHaveBeenCalled();
    expect(res.status).toBe(500);

    errorSpy.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  it('handles HEAD and GET requests without body', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'serve', mode: 'development' };
    await applyConfigHook(plugin, inlineConfig, env);

    let middleware: MiddlewareFn | undefined;
    let receivedRequestBody: BodyInit | undefined | null;

    const fetchMock = vi.fn<(request: Request) => Promise<Response>>((req) => {
      // Capture the body that was passed
      receivedRequestBody = req.body;
      return Promise.resolve(
        new Response(JSON.stringify({ method: req.method }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    });

    const server = {
      moduleGraph: {
        getModuleByUrl: vi
          .fn<(url: string, ssr?: boolean) => Promise<null>>()
          .mockResolvedValue(null),
        invalidateModule: vi.fn<(module: unknown) => void>(),
      },
      ssrLoadModule: vi
        .fn<(url: string) => Promise<{ default: { fetch: typeof fetchMock } }>>()
        .mockResolvedValue({ default: { fetch: fetchMock } }),
      middlewares: {
        use: vi.fn<(fn: MiddlewareFn) => unknown>(),
      },
      config: { logger: { warn: vi.fn<(msg: string) => void>() } },
    };

    server.middlewares.use.mockImplementation((fn) => {
      middleware = fn;
      return server;
    });

    await applyConfigureServerHook(plugin, server);

    if (!middleware) throw new Error('Middleware was not registered');

    // Test HEAD request (should not have body)
    const resHead = createResponseSpy();
    const nextHead = vi.fn<NextFunction>(() => undefined);

    await middleware(
      createRequest({
        url: '/api/test',
        method: 'HEAD',
        headers: { host: 'localhost:5173' },
      }),
      resHead as unknown as ServerResponse,
      nextHead
    );
    await resHead.waitForEnd();

    expect(fetchMock).toHaveBeenCalled();
    expect(resHead.status).toBe(200);
    // HEAD/GET requests should have null body (per Fetch API spec)
    expect(receivedRequestBody).toBeNull();

    rmSync(root, { recursive: true, force: true });
  });

  it('handles x-forwarded-proto header for https', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'serve', mode: 'development' };
    await applyConfigHook(plugin, inlineConfig, env);

    let middleware: MiddlewareFn | undefined;
    let capturedUrl: string | undefined;

    const fetchMock = vi.fn<(request: Request) => Promise<Response>>((req) => {
      capturedUrl = req.url;
      return Promise.resolve(
        new Response(JSON.stringify({ received: req.url }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    });

    const server = {
      moduleGraph: {
        getModuleByUrl: vi
          .fn<(url: string, ssr?: boolean) => Promise<null>>()
          .mockResolvedValue(null),
        invalidateModule: vi.fn<(module: unknown) => void>(),
      },
      ssrLoadModule: vi
        .fn<(url: string) => Promise<{ default: { fetch: typeof fetchMock } }>>()
        .mockResolvedValue({ default: { fetch: fetchMock } }),
      middlewares: {
        use: vi.fn<(fn: MiddlewareFn) => unknown>(),
      },
      config: { logger: { warn: vi.fn<(msg: string) => void>() } },
    };

    server.middlewares.use.mockImplementation((fn) => {
      middleware = fn;
      return server;
    });

    await applyConfigureServerHook(plugin, server);

    if (!middleware) throw new Error('Middleware was not registered');

    const res = createResponseSpy();
    const next = vi.fn<NextFunction>(() => undefined);

    await middleware(
      createRequest({
        url: '/api/secure',
        method: 'GET',
        headers: {
          host: 'example.com',
          'x-forwarded-proto': 'https',
        },
      }),
      res as unknown as ServerResponse,
      next
    );
    await res.waitForEnd();

    expect(fetchMock).toHaveBeenCalled();
    expect(capturedUrl).toContain('https://');
    expect(capturedUrl).toContain('example.com');
    expect(res.status).toBe(200);

    rmSync(root, { recursive: true, force: true });
  });

  it('creates wrapper in buildStart if not already present', async () => {
    const root = createTempProject();
    const plugin = honoPlugin({ basePath: '/v1', port: 8080 });

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'build', mode: 'production' };
    await applyConfigHook(plugin, inlineConfig, env);

    // Skip configResolved so wrapper is NOT created yet
    // Call buildStart directly which should create it
    await applyBuildStartHook(plugin, { environment: { name: 'server' } });

    const wrapperPath = join(root, '.hono-server.mjs');
    const wrapperContents = readFileSync(wrapperPath, 'utf8');
    expect(wrapperContents).toContain("app.route('/v1'");
    expect(wrapperContents).toContain('process.env.PORT ?? 8080');

    await applyCloseBundleHook(plugin);
    rmSync(root, { recursive: true, force: true });
  });

  it('handles module graph invalidation when module exists', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'serve', mode: 'development' };
    await applyConfigHook(plugin, inlineConfig, env);

    let middleware: MiddlewareFn | undefined;
    const mockModule = { id: '/hono/index.ts', invalidated: false };

    const server = {
      moduleGraph: {
        getModuleByUrl: vi
          .fn<(url: string, ssr?: boolean) => Promise<typeof mockModule>>()
          .mockResolvedValue(mockModule),
        invalidateModule: vi.fn<(module: typeof mockModule) => void>((mod) => {
          mod.invalidated = true;
        }),
      },
      ssrLoadModule: vi
        .fn<(url: string) => Promise<{ default: { fetch: () => Response } }>>()
        .mockResolvedValue({
          default: {
            fetch: () =>
              new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
          },
        }),
      middlewares: {
        use: vi.fn<(fn: MiddlewareFn) => unknown>(),
      },
      config: { logger: { warn: vi.fn<(msg: string) => void>() } },
    };

    server.middlewares.use.mockImplementation((fn) => {
      middleware = fn;
      return server;
    });

    await applyConfigureServerHook(plugin, server);

    if (!middleware) throw new Error('Middleware was not registered');

    const res = createResponseSpy();
    const next = vi.fn<NextFunction>(() => undefined);

    await middleware(
      createRequest({
        url: '/api/test',
        method: 'GET',
        headers: { host: 'localhost:5173' },
      }),
      res as unknown as ServerResponse,
      next
    );
    await res.waitForEnd();

    expect(server.moduleGraph.getModuleByUrl).toHaveBeenCalledWith('/hono/index.ts', true);
    expect(server.moduleGraph.invalidateModule).toHaveBeenCalledWith(mockModule);
    expect(mockModule.invalidated).toBe(true);
    expect(res.status).toBe(200);

    rmSync(root, { recursive: true, force: true });
  });

  it('handles array and empty header values correctly', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'serve', mode: 'development' };
    await applyConfigHook(plugin, inlineConfig, env);

    let middleware: MiddlewareFn | undefined;
    let receivedHeaders: Headers | undefined;

    const fetchMock = vi.fn<(request: Request) => Promise<Response>>((req) => {
      receivedHeaders = req.headers;
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
        })
      );
    });

    const server = {
      moduleGraph: {
        getModuleByUrl: vi
          .fn<(url: string, ssr?: boolean) => Promise<null>>()
          .mockResolvedValue(null),
        invalidateModule: vi.fn<(module: unknown) => void>(),
      },
      ssrLoadModule: vi
        .fn<(url: string) => Promise<{ default: { fetch: typeof fetchMock } }>>()
        .mockResolvedValue({ default: { fetch: fetchMock } }),
      middlewares: {
        use: vi.fn<(fn: MiddlewareFn) => unknown>(),
      },
      config: { logger: { warn: vi.fn<(msg: string) => void>() } },
    };

    server.middlewares.use.mockImplementation((fn) => {
      middleware = fn;
      return server;
    });

    await applyConfigureServerHook(plugin, server);

    if (!middleware) throw new Error('Middleware was not registered');

    const res = createResponseSpy();
    const next = vi.fn<NextFunction>(() => undefined);

    // Test with array header values and empty strings
    const req = createRequest({
      url: '/api/test',
      method: 'GET',
      headers: {
        host: 'localhost:5173',
        'x-custom': ['value1', 'value2', ''],
        'x-empty': '',
        'x-single': 'single-value',
      },
    });

    await middleware(req, res as unknown as ServerResponse, next);
    await res.waitForEnd();

    expect(fetchMock).toHaveBeenCalled();
    expect(receivedHeaders?.get('x-custom')).toBe('value1, value2');
    expect(receivedHeaders?.get('x-empty')).toBeNull();
    expect(receivedHeaders?.get('x-single')).toBe('single-value');

    rmSync(root, { recursive: true, force: true });
  });

  it('handles query parameters in requests', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'serve', mode: 'development' };
    await applyConfigHook(plugin, inlineConfig, env);

    let middleware: MiddlewareFn | undefined;
    let capturedUrl: string | undefined;

    const fetchMock = vi.fn<(request: Request) => Promise<Response>>((req) => {
      capturedUrl = req.url;
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const server = {
      moduleGraph: {
        getModuleByUrl: vi
          .fn<(url: string, ssr?: boolean) => Promise<null>>()
          .mockResolvedValue(null),
        invalidateModule: vi.fn<(module: unknown) => void>(),
      },
      ssrLoadModule: vi
        .fn<(url: string) => Promise<{ default: { fetch: typeof fetchMock } }>>()
        .mockResolvedValue({ default: { fetch: fetchMock } }),
      middlewares: {
        use: vi.fn<(fn: MiddlewareFn) => unknown>(),
      },
      config: { logger: { warn: vi.fn<(msg: string) => void>() } },
    };

    server.middlewares.use.mockImplementation((fn) => {
      middleware = fn;
      return server;
    });

    await applyConfigureServerHook(plugin, server);

    if (!middleware) throw new Error('Middleware was not registered');

    const res = createResponseSpy();
    const next = vi.fn<NextFunction>(() => undefined);

    // Test with query string
    await middleware(
      createRequest({
        url: '/api/users?page=2&limit=10',
        method: 'GET',
        headers: { host: 'localhost:5173' },
      }),
      res as unknown as ServerResponse,
      next
    );
    await res.waitForEnd();

    expect(fetchMock).toHaveBeenCalled();
    expect(capturedUrl).toContain('/users?page=2&limit=10');
    expect(capturedUrl).not.toContain('/api');
    expect(res.status).toBe(200);

    rmSync(root, { recursive: true, force: true });
  });

  it('handles requests to exact basePath root', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'serve', mode: 'development' };
    await applyConfigHook(plugin, inlineConfig, env);

    let middleware: MiddlewareFn | undefined;
    let capturedUrl: string | undefined;

    const fetchMock = vi.fn<(request: Request) => Promise<Response>>((req) => {
      capturedUrl = req.url;
      return Promise.resolve(new Response(JSON.stringify({ message: 'root' }), { status: 200 }));
    });

    const server = {
      moduleGraph: {
        getModuleByUrl: vi
          .fn<(url: string, ssr?: boolean) => Promise<null>>()
          .mockResolvedValue(null),
        invalidateModule: vi.fn<(module: unknown) => void>(),
      },
      ssrLoadModule: vi
        .fn<(url: string) => Promise<{ default: { fetch: typeof fetchMock } }>>()
        .mockResolvedValue({ default: { fetch: fetchMock } }),
      middlewares: {
        use: vi.fn<(fn: MiddlewareFn) => unknown>(),
      },
      config: { logger: { warn: vi.fn<(msg: string) => void>() } },
    };

    server.middlewares.use.mockImplementation((fn) => {
      middleware = fn;
      return server;
    });

    await applyConfigureServerHook(plugin, server);

    if (!middleware) throw new Error('Middleware was not registered');

    const res = createResponseSpy();
    const next = vi.fn<NextFunction>(() => undefined);

    // Test request to exactly /api (should become /)
    await middleware(
      createRequest({
        url: '/api',
        method: 'GET',
        headers: { host: 'localhost:5173' },
      }),
      res as unknown as ServerResponse,
      next
    );
    await res.waitForEnd();

    expect(fetchMock).toHaveBeenCalled();
    // When path is exactly /api, strippedPath should be "/"
    expect(capturedUrl).toContain('://');
    expect(capturedUrl).toMatch(/\/{1,2}$/); // Should end with /
    expect(res.status).toBe(200);

    rmSync(root, { recursive: true, force: true });
  });

  it('generates multi-runtime wrapper with detection logic', async () => {
    const root = createTempProject();
    const plugin = honoPlugin({ basePath: '/api', port: 4173 });

    const inlineConfig: InlineConfig = { root };
    const env: ConfigEnv = { command: 'build', mode: 'production' };
    await applyConfigHook(plugin, inlineConfig, env);

    const resolvedConfig = {
      root,
      environments: { server: { build: {} } },
    } as unknown as ResolvedConfig;
    await applyConfigResolvedHook(plugin, resolvedConfig);

    const wrapperPath = join(root, '.hono-server.mjs');
    const wrapperContents = readFileSync(wrapperPath, 'utf8');

    // Check for multi-runtime comment
    expect(wrapperContents).toContain('Auto-generated by vite-plugin-hono (multi-runtime)');

    // Check for runtime detection variables
    expect(wrapperContents).toContain('const runtime = (() => {');
    expect(wrapperContents).toContain("if (typeof Deno !== 'undefined') return 'deno';");
    expect(wrapperContents).toContain("if (typeof Bun !== 'undefined') return 'bun';");
    expect(wrapperContents).toContain('switch (runtime)');

    // Check for Deno branch
    expect(wrapperContents).toContain("case 'deno': {");
    expect(wrapperContents).toContain("const honoDenoModule = 'npm:@hono/deno@^1.0.0';");
    expect(wrapperContents).toContain('await import(/* @vite-ignore */ honoDenoModule);');
    expect(wrapperContents).toContain("Deno.env.get('PORT')");
    expect(wrapperContents).toContain('Deno.serve');
    expect(wrapperContents).toContain('(Deno)');

    // Check for Bun branch
    expect(wrapperContents).toContain("case 'bun': {");
    expect(wrapperContents).toContain("const bunStaticModule = 'hono/bun';");
    expect(wrapperContents).toContain('await import(/* @vite-ignore */ bunStaticModule);');
    expect(wrapperContents).toContain('(Bun)');

    // Check for Node.js branch (else)
    expect(wrapperContents).toContain("case 'node':");
    expect(wrapperContents).toContain("const nodeServerModule = '@hono/node-server';");
    expect(wrapperContents).toContain(
      "const nodeServeStaticModule = '@hono/node-server/serve-static';"
    );
    expect(wrapperContents).toContain('await import(/* @vite-ignore */ nodeServerModule);');
    expect(wrapperContents).toContain('await import(/* @vite-ignore */ nodeServeStaticModule);');
    expect(wrapperContents).toContain('(Node.js)');

    // Default export handling
    expect(wrapperContents).toMatch(/let runtimeExport = app;/);
    expect(wrapperContents).toMatch(
      /runtimeExport = {\s*port: serverPort,\s*fetch: app\.fetch,\s*};/
    );
    expect(wrapperContents).toMatch(/export default runtimeExport;/);
    const defaultExports = wrapperContents.match(/export default/g) ?? [];
    expect(defaultExports.length).toBe(1);

    // Check that all branches include serveStatic setup
    const staticPattern = /serveStatic\(\{ root: '\.\/frontend' \}\)/g;
    const matches = wrapperContents.match(staticPattern);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3); // At least 3 branches

    await applyCloseBundleHook(plugin);
    rmSync(root, { recursive: true, force: true });
  });
});
