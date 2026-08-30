// @ts-nocheck — test file, not included in tsconfig, vitest handles type checking
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { umami, oddmisc } from '../src/astro/integration';

// vi.spyOn 对 ESM 命名导出不可用，用 vi.mock + vi.hoisted 替代
const { mockReadFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn<(path: string) => string>()
}));

vi.mock('fs', async (importOriginal) => {
  const mod = await importOriginal<typeof import('fs')>();
  return { ...mod, readFileSync: mockReadFileSync };
});

describe('Astro integration — shape', () => {
  it('umami() returns an AstroIntegration with correct name', () => {
    const integration = umami({ shareUrl: 'https://u.2x.nz/share/test' });
    expect(integration.name).toBe('oddmisc-umami-integration');
    expect(integration.hooks['astro:config:setup']).toBeTypeOf('function');
  });

  it('umami({ shareUrl: false }) does not throw', () => {
    const integration = umami({ shareUrl: false });
    expect(integration.name).toBe('oddmisc-umami-integration');
  });

  it('oddmisc() returns an AstroIntegration with correct name', () => {
    const integration = oddmisc({ umami: { shareUrl: 'https://u.2x.nz/share/test' } });
    expect(integration.name).toBe('oddmisc-integration');
    expect(integration.hooks['astro:config:setup']).toBeTypeOf('function');
  });

  it('oddmisc() with no options does not throw', () => {
    const integration = oddmisc();
    expect(integration.name).toBe('oddmisc-integration');
  });

  it('oddmisc({ umami: { shareUrl: false } }) does not throw', () => {
    const integration = oddmisc({ umami: { shareUrl: false } });
    expect(integration.name).toBe('oddmisc-integration');
  });
});

describe('Astro integration — injectUmamiRuntime path resolution', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockReadFileSync.mockReset();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('resolves runtime path to runtime/client.global.js (not astro/runtime/)', () => {
    let capturedPath = '';
    mockReadFileSync.mockImplementation((path: string) => {
      capturedPath = path;
      return '// mock';
    });

    const injectScript = vi.fn();
    const addWatchFile = vi.fn();
    const integration = umami({ shareUrl: 'https://example.com/share/test' });
    const hook: any = (integration as any).hooks['astro:config:setup'];
    hook({ injectScript, addWatchFile });

    const normalized = capturedPath.replace(/\\/g, '/');
    expect(normalized).toMatch(/runtime\/client\.global\.js$/);
    expect(normalized).not.toMatch(/astro\/runtime\//);
  });

  it('throws when runtime file is missing', () => {
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const injectScript = vi.fn();
    const integration = umami({ shareUrl: 'https://example.com/share/test' });
    const hook: any = (integration as any).hooks['astro:config:setup'];

    expect(() => hook({ injectScript })).toThrow('ENOENT');
  });

  it('injects runtime code when file is found', () => {
    mockReadFileSync.mockReturnValue('// mock runtime code');

    const injectScript = vi.fn();
    const addWatchFile = vi.fn();
    const integration = umami({ shareUrl: 'https://example.com/share/test' });
    const hook: any = (integration as any).hooks['astro:config:setup'];
    hook({ injectScript, addWatchFile });

    expect(injectScript).toHaveBeenCalledTimes(1);
    expect(injectScript).toHaveBeenCalledWith(
      'head-inline',
      expect.stringContaining('// mock runtime code')
    );
    expect(injectScript).toHaveBeenCalledWith(
      'head-inline',
      expect.stringContaining('initUmamiRuntime')
    );
    expect(addWatchFile).toHaveBeenCalled();
  });

  it('skips injection when shareUrl is false', () => {
    mockReadFileSync.mockReturnValue('// code');

    const injectScript = vi.fn();
    const integration = umami({ shareUrl: false });
    const hook: any = (integration as any).hooks['astro:config:setup'];
    hook({ injectScript });

    expect(injectScript).not.toHaveBeenCalled();
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it('oddmisc() passes umami.shareUrl through to injectUmamiRuntime', () => {
    mockReadFileSync.mockReturnValue('// code');

    const injectScript = vi.fn();
    const addWatchFile = vi.fn();
    const integration = oddmisc({ umami: { shareUrl: 'https://example.com/share/test' } });
    const hook: any = (integration as any).hooks['astro:config:setup'];
    hook({ injectScript, addWatchFile });

    expect(injectScript).toHaveBeenCalledTimes(1);
    expect(injectScript).toHaveBeenCalledWith(
      'head-inline',
      expect.stringContaining('initUmamiRuntime')
    );
    expect(addWatchFile).toHaveBeenCalled();
  });

  it('oddmisc() with umami.shareUrl=false skips injection', () => {
    mockReadFileSync.mockReturnValue('// code');

    const injectScript = vi.fn();
    const integration = oddmisc({ umami: { shareUrl: false } });
    const hook: any = (integration as any).hooks['astro:config:setup'];
    hook({ injectScript });

    expect(injectScript).not.toHaveBeenCalled();
  });
});
