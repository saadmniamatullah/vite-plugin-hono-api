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
    writeHead(code: number) {
      this.status = code;
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

    expect(returnedConfig.environments?.server?.build?.ssr).toBe('./.hono-server.js');

    const resolvedConfig = {
      root,
      environments: { server: { build: {} } },
    } as unknown as ResolvedConfig;
    await applyConfigResolvedHook(plugin, resolvedConfig);

    const wrapperPath = join(root, '.hono-server.js');
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

  it('copies deploy files after running builder for client and server', async () => {
    const root = createTempProject();
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

    const wrapperPath = join(root, '.hono-server.js');
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
});
