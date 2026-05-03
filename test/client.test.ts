import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UmamiClient, createUmamiClient } from '../src/modules/umami/client';
import { UmamiUrlError } from '../src/errors';

const SHARE_URL = 'https://umami.example.com/share/abc123';

describe('UmamiClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws UmamiUrlError when shareUrl is missing', () => {
    expect(() => new UmamiClient({ shareUrl: '' as unknown as string })).toThrow(UmamiUrlError);
  });

  it('createUmamiClient returns a UmamiClient instance', () => {
    const client = createUmamiClient({ shareUrl: SHARE_URL });
    expect(client).toBeInstanceOf(UmamiClient);
  });

  it('normalises stats responses that wrap values in { value }', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ pageviews: { value: 11 }, visitors: { value: 22 }, visits: { value: 33 } })
      } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = createUmamiClient({ shareUrl: SHARE_URL });
    client.clearCache();
    const result = await client.getSiteStats();
    expect(result).toMatchObject({ pageviews: 11, visitors: 22, visits: 33 });
  });

  it('sends a url filter when calling getPageStatsByUrl', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 1, visitors: 1, visits: 1 }) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = createUmamiClient({ shareUrl: SHARE_URL });
    client.clearCache();
    await client.getPageStatsByUrl('https://site.example/page');

    const statsCall = fetchMock.mock.calls[1][0] as string;
    expect(statsCall).toContain('url=https%3A%2F%2Fsite.example%2Fpage');
  });

  it('exposes bounces / totaltime / comparison from stats response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          pageviews: 57,
          visitors: 19,
          visits: 22,
          bounces: 13,
          totaltime: 1714,
          comparison: { pageviews: 100, visitors: 10, visits: 20, bounces: 5, totaltime: 500 }
        })
      } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = createUmamiClient({ shareUrl: SHARE_URL });
    client.clearCache();
    const result = await client.getSiteStats();
    expect(result.bounces).toBe(13);
    expect(result.totaltime).toBe(1714);
    expect(result.comparison).toEqual({ pageviews: 100, visitors: 10, visits: 20, bounces: 5, totaltime: 500 });
  });

  it('getActiveVisitors returns the visitor count as a number', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ visitors: 42 }) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = createUmamiClient({ shareUrl: SHARE_URL });
    client.clearCache();
    expect(await client.getActiveVisitors()).toBe(42);
  });

  it('getMetrics returns the Umami [{x,y}] array unchanged', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ([{ x: '/', y: 12 }, { x: '/posts', y: 5 }]) } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = createUmamiClient({ shareUrl: SHARE_URL });
    client.clearCache();
    const top = await client.getMetrics('path', { limit: 10 });
    expect(top).toEqual([{ x: '/', y: 12 }, { x: '/posts', y: 5 }]);
    const url = fetchMock.mock.calls[1][0] as string;
    expect(url).toContain('type=path');
    expect(url).toContain('limit=10');
  });

  it('getWebsite returns metadata', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'w1', name: 'Fuwari', domain: 'fuwari.oh1.top', shareId: 'abc123', createdAt: '', updatedAt: '', resetAt: null })
      } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = createUmamiClient({ shareUrl: SHARE_URL });
    client.clearCache();
    const info = await client.getWebsite();
    expect(info.name).toBe('Fuwari');
    expect(info.domain).toBe('fuwari.oh1.top');
  });
});
