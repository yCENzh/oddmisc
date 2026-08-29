import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UmamiAPI } from '../src/modules/umami/api';
import { CacheManager } from '../src/utils/umami/cache';
import { UmamiAuthError, UmamiNetworkError } from '../src/errors';

const BASE = 'https://umami.example.com/api';
const SHARE_ID = 'abc123';

describe('UmamiAPI.getStats', () => {
  let api: UmamiAPI;
  let cache: CacheManager;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    cache = new CacheManager('api-test', 3600000);
    cache.clear();
    api = new UmamiAPI(cache);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('forwards the path query parameter to the stats endpoint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 1, visitors: 2, visits: 3 }) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await api.getStats(BASE, SHARE_ID, { path: 'eq./about' });

    const statsCall = fetchMock.mock.calls[1][0] as string;
    expect(statsCall).toContain('/websites/w1/stats?');
    expect(statsCall).toContain('path=eq.%2Fabout');
  });

  it('forwards the url query parameter to the stats endpoint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 0, visitors: 0, visits: 0 }) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await api.getStats(BASE, SHARE_ID, { url: 'https://site.example/page' });

    const statsCall = fetchMock.mock.calls[1][0] as string;
    expect(statsCall).toContain('url=https%3A%2F%2Fsite.example%2Fpage');
  });

  it('forwards the hostname query parameter to the stats endpoint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 0, visitors: 0, visits: 0 }) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await api.getStats(BASE, SHARE_ID, { hostname: 'eq.site.example' });

    const statsCall = fetchMock.mock.calls[1][0] as string;
    expect(statsCall).toContain('hostname=eq.site.example');
  });

  it('returns cached response on the second call without calling fetch again', async () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 5, visitors: 6, visits: 7 }) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const first = await api.getStats(BASE, SHARE_ID, { path: 'eq./a' });
    expect(first._fromCache).toBe(false);

    now = 2000;
    const second = await api.getStats(BASE, SHARE_ID, { path: 'eq./a' });
    expect(second._fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws UmamiAuthError on 401 responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(api.getStats(BASE, SHARE_ID, {})).rejects.toBeInstanceOf(UmamiAuthError);
  });

  it('throws UmamiNetworkError on other non-ok stats responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(api.getStats(BASE, SHARE_ID, {})).rejects.toBeInstanceOf(UmamiNetworkError);
  });

  it('retries share data fetch after a prior failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 1, visitors: 1, visits: 1 }) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(api.getStats(BASE, SHARE_ID, {})).rejects.toBeInstanceOf(UmamiNetworkError);
    const result = await api.getStats(BASE, SHARE_ID, {});
    expect(result.pageviews).toBe(1);
  });

  it('sends x-umami-share-token and x-umami-share-context headers on authed requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 'tok-xyz' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 1, visitors: 1, visits: 1 }) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await api.getStats(BASE, SHARE_ID, {});

    const [, init] = fetchMock.mock.calls[1];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-umami-share-token']).toBe('tok-xyz');
    expect(headers['x-umami-share-context']).toBe('1');
  });

  it('clears only current sharePromise on 401 so next call refetches share data', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't2' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 1, visitors: 1, visits: 1 }) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(api.getStats(BASE, SHARE_ID, {})).rejects.toBeInstanceOf(UmamiAuthError);
    const result = await api.getStats(BASE, SHARE_ID, {});
    expect(result.pageviews).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does NOT clear data cache on 401 (only share cache)', async () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    // Populate a cache entry via a different shareId
    cache.set('my-data-key', { hello: 'world' });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(api.getStats(BASE, SHARE_ID, {})).rejects.toBeInstanceOf(UmamiAuthError);

    // Data cache should NOT be cleared
    expect(cache.get('my-data-key')).toEqual({ hello: 'world' });
  });
});

describe('UmamiAPI additional endpoints', () => {
  let api: UmamiAPI;
  let cache: CacheManager;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    cache = new CacheManager('api-extra', 3600000);
    cache.clear();
    api = new UmamiAPI(cache);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('getActiveVisitors hits /active with required headers', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ visitors: 7 }) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const r = await api.getActiveVisitors(BASE, SHARE_ID);
    expect(r.visitors).toBe(7);
    expect((fetchMock.mock.calls[1][0] as string)).toContain('/websites/w1/active');
    const headers = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-umami-share-context']).toBe('1');
  });

  it('getPageviews forwards startAt/endAt/unit/timezone', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: [], sessions: [] }) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await api.getPageviews(BASE, SHARE_ID, { startAt: 1000, endAt: 2000, unit: 'hour', timezone: 'Asia/Shanghai' });

    const url = fetchMock.mock.calls[1][0] as string;
    expect(url).toContain('/websites/w1/pageviews?');
    expect(url).toContain('startAt=1000');
    expect(url).toContain('endAt=2000');
    expect(url).toContain('unit=hour');
    expect(url).toContain('timezone=Asia%2FShanghai');
  });

  it('getMetrics forwards type and limit and parses array response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ([{ x: 'CN', y: 12 }, { x: 'US', y: 4 }]) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await api.getMetrics(BASE, SHARE_ID, 'country', { limit: 5 });
    expect(res).toEqual([{ x: 'CN', y: 12 }, { x: 'US', y: 4 }]);
    const url = fetchMock.mock.calls[1][0] as string;
    expect(url).toContain('type=country');
    expect(url).toContain('limit=5');
  });

  it('getMetrics caches the array response', async () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ([{ x: '/', y: 10 }]) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const first = await api.getMetrics(BASE, SHARE_ID, 'path');
    expect(first).toEqual([{ x: '/', y: 10 }]);
    expect((first as Record<string, unknown>)._fromCache).toBeUndefined();

    now = 2000;
    const second = await api.getMetrics(BASE, SHARE_ID, 'path');
    expect(Array.isArray(second)).toBe(true);
    expect(second.length).toBe(1);
    expect(second[0]).toEqual({ x: '/', y: 10 });
    expect((second as Record<string, unknown>)._fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2); // share + metrics, no extra fetch
  });

  it('uses aligned endAt for cache stability when endAt not specified', async () => {
    // Freeze time so that aligned value is deterministic
    const fixedTime = 1700000100000; // not aligned to 5min
    vi.spyOn(Date, 'now').mockImplementation(() => fixedTime);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 1, visitors: 1, visits: 1 }) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await api.getStats(BASE, SHARE_ID, {});

    const statsUrl = fetchMock.mock.calls[1][0] as string;
    // endAt should be aligned to 5 min
    const alignedEnd = Math.floor(fixedTime / 300000) * 300000;
    expect(statsUrl).toContain(`endAt=${alignedEnd}`);
    expect(statsUrl).toContain('startAt=0');
  });

  it('sharePromises are keyed by baseUrl|shareId', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 1, visitors: 1, visits: 1 }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w2', token: 't2' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 2, visitors: 2, visits: 2 }) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const r1 = await api.getStats(BASE, 'share-a', {});
    const r2 = await api.getStats(BASE, 'share-b', {});

    // Each share should trigger its own fetch
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(r1.pageviews).toBe(1);
    expect(r2.pageviews).toBe(2);
  });
});
