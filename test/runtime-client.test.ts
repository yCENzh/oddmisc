import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get store() { return store; }
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Mock window and CustomEvent
const originalWindow = global.window;
const mockDispatchEvent = vi.fn();
const mockWindow = {
  dispatchEvent: mockDispatchEvent,
  oddmisc: undefined
};

Object.defineProperty(global, 'window', { value: mockWindow, writable: true });

// Import after mocks
const { initUmamiRuntime, UmamiRuntimeClient, SimpleCache } = await import('../src/runtime/client.ts');

describe('SimpleCache', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves values in memory', () => {
    const cache = new SimpleCache('test', 3600000, 100);
    cache.set('key1', { data: 'value1' });
    expect(cache.get('key1')).toEqual({ data: 'value1' });
  });

  it('persists to localStorage', () => {
    const cache = new SimpleCache('test', 3600000, 100);
    cache.set('key1', { data: 'value1' });
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it('loads from localStorage on init', () => {
    localStorageMock.store['test'] = JSON.stringify({
      key1: { value: { data: 'persisted' }, timestamp: Date.now() }
    });
    const cache = new SimpleCache('test', 3600000, 100);
    expect(cache.get('key1')).toEqual({ data: 'persisted' });
  });

  it('expires entries after TTL', () => {
    const cache = new SimpleCache('test', 1000, 100);
    cache.set('key1', { data: 'value1' });
    expect(cache.get('key1')).toEqual({ data: 'value1' });
    
    vi.advanceTimersByTime(1500);
    expect(cache.get('key1')).toBeNull();
  });

  it('evicts oldest entries when maxEntries exceeded', () => {
    const cache = new SimpleCache('test', 3600000, 2);
    cache.set('key1', { data: 'value1' });
    cache.set('key2', { data: 'value2' });
    cache.set('key3', { data: 'value3' });
    
    expect(cache.get('key1')).toBeNull(); // evicted
    expect(cache.get('key2')).toEqual({ data: 'value2' });
    expect(cache.get('key3')).toEqual({ data: 'value3' });
  });

  it('clears all entries', () => {
    const cache = new SimpleCache('test', 3600000, 100);
    cache.set('key1', { data: 'value1' });
    cache.clear();
    expect(cache.get('key1')).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('test');
  });
});

describe('UmamiRuntimeClient', () => {
  beforeEach(() => {
    localStorageMock.clear();
    fetchMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockShareResponse = { websiteId: 'w1', token: 't1' };
  const mockStatsResponse = { pageviews: 100, visitors: 50, visits: 75, bounces: 10, totaltime: 5000 };
  const mockActiveResponse = { visitors: 5 };
  const mockPageviewsResponse = {
    pageviews: [{ x: '2024-01-01', y: 10 }],
    sessions: [{ x: '2024-01-01', y: 5 }]
  };
  const mockMetricsResponse = [{ x: '/', y: 100 }, { x: '/about', y: 50 }];
  const mockWebsiteResponse = {
    id: 'w1', name: 'Test Site', domain: 'test.com', shareId: 's1',
    createdAt: '2024-01-01', updatedAt: '2024-01-01', resetAt: null,
    userId: 'u1', teamId: null, createdBy: 'u1', deletedAt: null,
    recorderEnabled: true, replayConfig: null
  };
  const mockDateRangeResponse = { startDate: '2024-01-01', endDate: '2024-12-31' };

  function setupFetchMock(responses: unknown[]) {
    let callIndex = 0;
    fetchMock.mockImplementation(async (url: string) => {
      const response = responses[callIndex++];
      return {
        ok: true,
        status: 200,
        json: async () => response,
        headers: new Headers()
      } as Response;
    });
  }

  it('initializes with shareUrl and fetches share data', async () => {
    setupFetchMock([mockShareResponse, mockStatsResponse]);
    
    const client = new UmamiRuntimeClient({ shareUrl: 'https://umami.example.com/share/abc123' });
    const stats = await client.getSiteStats();
    
    expect(stats.pageviews).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches share data for subsequent calls', async () => {
    setupFetchMock([mockShareResponse, mockStatsResponse, mockStatsResponse]);
    
    const client = new UmamiRuntimeClient({ shareUrl: 'https://umami.example.com/share/abc123' });
    await client.getSiteStats();
    await client.getSiteStats();
    
    // share endpoint should only be called once
    const shareCalls = fetchMock.mock.calls.filter((call: unknown[]) => 
      (call[0] as string).includes('/share/')
    );
    expect(shareCalls.length).toBe(1);
  });

  it('returns cached stats with _fromCache flag', async () => {
    setupFetchMock([mockShareResponse, mockStatsResponse]);
    
    const client = new UmamiRuntimeClient({ shareUrl: 'https://umami.example.com/share/abc123' });
    await client.getSiteStats();
    const cached = await client.getSiteStats();
    
    expect(cached._fromCache).toBe(true);
  });

  it('gets page stats by path', async () => {
    setupFetchMock([mockShareResponse, mockStatsResponse]);
    
    const client = new UmamiRuntimeClient({ shareUrl: 'https://umami.example.com/share/abc123' });
    const stats = await client.getPageStats('/about');
    
    expect(stats.pageviews).toBe(100);
    const statsCall = fetchMock.mock.calls[1][0] as string;
    expect(statsCall).toContain('path=eq.%2Fabout');
  });

  it('gets active visitors (no cache)', async () => {
    setupFetchMock([mockShareResponse, mockActiveResponse]);
    
    const client = new UmamiRuntimeClient({ shareUrl: 'https://umami.example.com/share/abc123' });
    const active = await client.getActiveVisitors();
    
    expect(active).toBe(5);
  });

  it('gets pageviews with custom params', async () => {
    setupFetchMock([mockShareResponse, mockPageviewsResponse]);
    
    const client = new UmamiRuntimeClient({ shareUrl: 'https://umami.example.com/share/abc123' });
    const series = await client.getPageviews({
      startAt: 1700000000000,
      endAt: 1700000100000,
      unit: 'hour',
      timezone: 'Asia/Shanghai'
    });
    
    expect(series.pageviews).toHaveLength(1);
    expect(series.sessions).toHaveLength(1);
  });

  it('gets metrics with custom params', async () => {
    setupFetchMock([mockShareResponse, mockMetricsResponse]);
    
    const client = new UmamiRuntimeClient({ shareUrl: 'https://umami.example.com/share/abc123' });
    const metrics = await client.getMetrics('country', { limit: 5 });
    
    expect(metrics).toHaveLength(2);
    expect(metrics[0]).toEqual({ x: '/', y: 100 });
  });

  it('gets website info', async () => {
    setupFetchMock([mockShareResponse, mockWebsiteResponse]);
    
    const client = new UmamiRuntimeClient({ shareUrl: 'https://umami.example.com/share/abc123' });
    const website = await client.getWebsite();
    
    expect(website.name).toBe('Test Site');
    expect(website.userId).toBe('u1');
    expect(website.recorderEnabled).toBe(true);
  });

  it('gets date range', async () => {
    setupFetchMock([mockShareResponse, mockDateRangeResponse]);
    
    const client = new UmamiRuntimeClient({ shareUrl: 'https://umami.example.com/share/abc123' });
    const range = await client.getDateRange();
    
    expect(range.startDate).toBe('2024-01-01');
    expect(range.endDate).toBe('2024-12-31');
  });

  it('clears cache and share data', async () => {
    setupFetchMock([mockShareResponse, mockStatsResponse, mockShareResponse, mockStatsResponse]);
    
    const client = new UmamiRuntimeClient({ shareUrl: 'https://umami.example.com/share/abc123' });
    await client.getSiteStats();
    client.clearCache();
    await client.getSiteStats();
    
    // share endpoint should be called again after clearCache
    const shareCalls = fetchMock.mock.calls.filter((call: unknown[]) => 
      (call[0] as string).includes('/share/')
    );
    expect(shareCalls.length).toBe(2);
  });

  it('handles custom cache TTL and max entries', async () => {
    setupFetchMock([mockShareResponse, mockStatsResponse]);
    
    const client = new UmamiRuntimeClient({
      shareUrl: 'https://umami.example.com/share/abc123',
      cacheTtl: 7200000,
      cacheMax: 50
    });
    
    await client.getSiteStats();
    // Should work without errors
  });

  it('handles custom timeout', async () => {
    setupFetchMock([mockShareResponse, mockStatsResponse]);
    
    const client = new UmamiRuntimeClient({
      shareUrl: 'https://umami.example.com/share/abc123',
      timeout: 5000
    });
    
    await client.getSiteStats();
    // Should work without errors
  });

  it('throws on 401 and clears share data', async () => {
    // Use a time that aligns to 5 minutes
    vi.setSystemTime(1700000000000);
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => mockShareResponse } as Response)
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) } as Response);
    
    const client = new UmamiRuntimeClient({ shareUrl: 'https://umami.example.com/share/abc123' });
    
    // The endAt gets aligned to 5 minutes (1700000000000 -> 1699999800000)
    await expect(client.getSiteStats()).rejects.toThrow('请求 /stats?startAt=0&endAt=1699999800000 失败: 401');
  });

  it('throws on invalid shareUrl', () => {
    expect(() => new UmamiRuntimeClient({ shareUrl: 'https://invalid.com/no-share' })).toThrow('无效的分享 URL');
  });

  it('throws on missing shareUrl', () => {
    // @ts-expect-error - testing invalid config
    expect(() => new UmamiRuntimeClient({ shareUrl: undefined })).toThrow('shareUrl 是必需参数');
  });
});

describe('initUmamiRuntime', () => {
  beforeEach(() => {
    localStorageMock.clear();
    fetchMock.mockReset();
    mockDispatchEvent.mockClear();
    mockWindow.oddmisc = undefined;
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts empty client when shareUrl is false', () => {
    initUmamiRuntime({ shareUrl: false });
    
    expect(mockWindow.oddmisc).toBeDefined();
    expect(typeof mockWindow.oddmisc.getSiteStats).toBe('function');
    expect(mockDispatchEvent).toHaveBeenCalled();
    const event = mockDispatchEvent.mock.calls[0][0];
    expect(event.type).toBe('oddmisc-ready');
  });

  it('initializes client with shareUrl', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 100, visitors: 50, visits: 75 }) } as Response);
    
    initUmamiRuntime({ shareUrl: 'https://umami.example.com/share/abc123' });
    
    // Wait for async initialization
    await vi.runAllTimersAsync();
    
    expect(mockWindow.oddmisc).toBeDefined();
    expect(typeof mockWindow.oddmisc.getSiteStats).toBe('function');
    expect(mockDispatchEvent).toHaveBeenCalled();
  });

  it('passes custom config to client', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 100, visitors: 50, visits: 75 }) } as Response);
    
    initUmamiRuntime({
      shareUrl: 'https://umami.example.com/share/abc123',
      cacheTtl: 7200000,
      cacheMax: 50,
      timeout: 5000
    });
    
    await vi.runAllTimersAsync();
    
    expect(mockWindow.oddmisc).toBeDefined();
  });

  it('throws on API error (404) and allows retry', async () => {
    // Mock the share endpoint to fail (404)
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response);
    
    initUmamiRuntime({ shareUrl: 'https://umami.example.com/share/invalid' });
    
    // Wait for async initialization
    await vi.runAllTimersAsync();
    
    expect(mockWindow.oddmisc).toBeDefined();
    // First API call throws
    await expect(mockWindow.oddmisc.getSiteStats()).rejects.toThrow('获取分享信息失败: 404');
  });

  it('dispatches oddmisc-ready event with client detail', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ websiteId: 'w1', token: 't1' }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ pageviews: 100, visitors: 50, visits: 75 }) } as Response);
    
    initUmamiRuntime({ shareUrl: 'https://umami.example.com/share/abc123' });
    await vi.runAllTimersAsync();
    
    const event = mockDispatchEvent.mock.calls[0][0];
    expect(event.type).toBe('oddmisc-ready');
    expect(event.detail).toBeDefined();
    expect(event.detail.client).toBe(mockWindow.oddmisc);
  });
});