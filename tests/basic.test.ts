import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ViteDevServer } from 'vite';
import honoPlugin from '../src/index';

function createTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vite-plugin-hono-'));
  mkdirSync(join(dir, 'hono'), { recursive: true });

  writeFileSync(
    join(dir, 'hono/index.ts'),
    "export default { fetch: (request: Request) => new Response(JSON.stringify({ url: request.url })) };\n",
    'utf8',
  );

  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }), 'utf8');

  return dir;
}

function createResponseSpy() {
  const chunks: Uint8Array[] = [];
  const headers = new Map<string, string>();
  return {
    status: undefined as number | undefined,
    ended: false,
    setHeader(key: string, value: string) {
      headers.set(key.toLowerCase(), value);
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
    },
    body() {
      return Buffer.concat(chunks).toString();
    },
    header(key: string) {
      return headers.get(key.toLowerCase());
    },
  };
}

describe('vite-plugin-saad', () => {
  it('generates and cleans up the server wrapper during build', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const configHook = typeof plugin.config === 'function' ? plugin.config : plugin.config?.handler;
    const returnedConfig = (await configHook?.call({} as any, { root } as any, { command: 'build', mode: 'production' } as any)) ?? {};

    expect(returnedConfig.environments?.server?.build?.ssr).toBe('./.hono-server.js');

    const configResolved = typeof plugin.configResolved === 'function' ? plugin.configResolved : plugin.configResolved?.handler;
    await configResolved?.call({} as any, {
      root,
      environments: { server: { build: {} } },
    } as any);

    const wrapperPath = join(root, '.hono-server.js');
    const wrapperContents = readFileSync(wrapperPath, 'utf8');
    expect(wrapperContents).toContain("app.route('/api'");
    expect(wrapperContents).toContain("serveStatic({\n  root: './frontend'");

    const buildStart = typeof plugin.buildStart === 'function' ? plugin.buildStart : plugin.buildStart?.handler;
    buildStart?.call({ environment: { name: 'server' } } as any, {} as any);
    expect(readFileSync(wrapperPath, 'utf8')).toContain('Server running');

    const closeBundle = typeof plugin.closeBundle === 'function' ? plugin.closeBundle : plugin.closeBundle?.handler;
    await closeBundle?.call({} as any);
    expect(() => readFileSync(wrapperPath, 'utf8')).toThrow();

    rmSync(root, { recursive: true, force: true });
  });

  it('copies deploy files after running builder for client and server', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const configHook = typeof plugin.config === 'function' ? plugin.config : plugin.config?.handler;
    const returnedConfig = (await configHook?.call({} as any, { root } as any, { command: 'build', mode: 'production' } as any)) ?? {};

    const buildSpy = vi.fn().mockResolvedValue(undefined);

    await returnedConfig.builder?.buildApp?.({
      environments: { client: 'client-env', server: 'server-env' },
      build: buildSpy,
    } as any);

    expect(buildSpy).toHaveBeenNthCalledWith(1, 'client-env');
    expect(buildSpy).toHaveBeenNthCalledWith(2, 'server-env');

    const distPackage = readFileSync(join(root, 'dist/package.json'), 'utf8');
    expect(JSON.parse(distPackage).scripts).toEqual({ start: 'node server.js' });

    rmSync(root, { recursive: true, force: true });
  });

  it('proxies API requests during development and falls through otherwise', async () => {
    const root = createTempProject();
    const plugin = honoPlugin();

    const configHook = typeof plugin.config === 'function' ? plugin.config : plugin.config?.handler;
    await configHook?.call({} as any, { root } as any, { command: 'serve', mode: 'development' } as any);

    let middleware: any;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const server = {
      moduleGraph: {
        getModuleByUrl: vi.fn().mockResolvedValue(null),
        invalidateModule: vi.fn(),
      },
      ssrLoadModule: vi.fn().mockResolvedValue({ default: { fetch: fetchMock } }),
      middlewares: {
        use(fn: any) {
          middleware = fn;
        },
      },
    } as unknown as ViteDevServer;

    const configureServer = typeof plugin.configureServer === 'function' ? plugin.configureServer : plugin.configureServer?.handler;
    await configureServer?.call({} as any, server);
    expect(typeof middleware).toBe('function');

    const next = vi.fn();
    await middleware({ url: '/about', method: 'GET', headers: {} } as any, {} as any, next);
    expect(next).toHaveBeenCalledOnce();

    const apiResponse = createResponseSpy();
    await middleware(
      { url: '/api/message', method: 'GET', headers: { host: 'localhost:5173' } } as any,
      apiResponse,
      vi.fn(),
    );

    expect(fetchMock).toHaveBeenCalled();

    // Verify the Hono app received the stripped path (without /api prefix)
    const fetchCallArgs = fetchMock.mock.calls[0];
    const receivedRequest = fetchCallArgs[0] as Request;
    expect(receivedRequest.url).toContain('/message');
    expect(receivedRequest.url).not.toContain('/api/message');

    expect(apiResponse.status).toBe(200);
    expect(apiResponse.header('content-type')).toBe('application/json');
    expect(apiResponse.body()).toContain('{"ok":true}');

    rmSync(root, { recursive: true, force: true });
  });
});
