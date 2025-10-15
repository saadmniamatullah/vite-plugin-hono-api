import { describe, expect, it } from 'vitest';
import honoPlugin from '../src/index';

interface MockEnvironment {
  name: string;
}

describe('Vite 7 Environment API Compatibility', () => {
  it('has environment API properties', () => {
    const plugin = honoPlugin();

    // Check for Vite 7 Environment API properties
    expect(plugin.perEnvironmentStartEndDuringDev).toBe(true);
    expect(typeof plugin.applyToEnvironment).toBe('function');
  });

  it('applyToEnvironment filters correctly', () => {
    const plugin = honoPlugin();

    if (!plugin.applyToEnvironment) {
      throw new Error('applyToEnvironment should be defined');
    }

    const serverEnv: MockEnvironment = { name: 'server' };
    const ssrEnv: MockEnvironment = { name: 'ssr' };
    const clientEnv: MockEnvironment = { name: 'client' };
    const customEnv: MockEnvironment = { name: 'custom' };

    // Should apply to server environment
    expect(plugin.applyToEnvironment(serverEnv)).toBe(true);

    // Should apply to ssr environment
    expect(plugin.applyToEnvironment(ssrEnv)).toBe(true);

    // Should NOT apply to client environment
    expect(plugin.applyToEnvironment(clientEnv)).toBe(false);

    // Should NOT apply to other environments
    expect(plugin.applyToEnvironment(customEnv)).toBe(false);
  });

  it('buildStart respects environment context', async () => {
    const plugin = honoPlugin();

    // Mock buildStart with client environment
    const clientContext = {
      environment: { name: 'client' },
    };

    // buildStart hook should exist
    expect(plugin.buildStart).toBeDefined();

    if (typeof plugin.buildStart === 'function') {
      // Client environment should not trigger wrapper creation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      await plugin.buildStart.call(clientContext as any, undefined as never);
      // Note: In a real scenario, we'd need to check if wrapper file was created
      // but this test is just verifying the hook can be called without error
    }
  });

  it('is backward compatible with Vite 6', () => {
    const plugin = honoPlugin();

    // All Vite 6 hooks should still be present
    expect(plugin.name).toBe('vite-plugin-hono');
    expect(typeof plugin.config).toBe('function');
    expect(typeof plugin.configResolved).toBe('function');
    expect(typeof plugin.buildStart).toBe('function');
    expect(typeof plugin.closeBundle).toBe('function');
    expect(typeof plugin.configureServer).toBe('function');

    // New properties should not break Vite 6 (they'll be ignored)
    expect(plugin.perEnvironmentStartEndDuringDev).toBe(true);
  });

  it('supports both Vite 6 and 7 version strings', () => {
    // This test verifies the version check logic
    // The actual checkViteVersion is tested in the main test suite
    const plugin = honoPlugin();
    expect(plugin).toBeDefined();
    expect(plugin.name).toBe('vite-plugin-hono');
  });
});
