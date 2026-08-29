/**
 * 浏览器运行时客户端（IIFE 内联注入，不能有外部 import）。
 */

import {
  DEFAULT_TIMEOUT,
  SHARE_CONTEXT_HEADER,
  SHARE_CONTEXT_VALUE,
  DEFAULT_CACHE_TTL,
  DEFAULT_CACHE_MAX,
  fetchWithTimeout,
  extract,
  parseShareUrl,
  alignedNow,
  buildCacheKey,
  extractPathFromUrl,
} from './shared';

import type {
  StatsResult,
  PageviewsSeries,
  MetricEntry,
  WebsiteInfo,
  DateRange,
} from '../modules/umami/types';

// --- cache ---

class SimpleCache {
  private cache = new Map<string, { value: unknown; timestamp: number }>();

  constructor(
    private readonly storageKey: string,
    private readonly ttl: number,
    private readonly maxEntries = DEFAULT_CACHE_MAX
  ) {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Record<string, { value: unknown; timestamp: number }>;
      for (const [key, entry] of Object.entries(parsed)) {
        if (entry && typeof entry.timestamp === 'number' && !this.isExpired(entry.timestamp)) {
          this.cache.set(key, entry);
        }
      }
    } catch { /* ignore */ }
  }

  private saveToStorage(): void {
    try {
      const obj: Record<string, { value: unknown; timestamp: number }> = {};
      this.cache.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(this.storageKey, JSON.stringify(obj));
    } catch { /* ignore */ }
  }

  private isExpired(timestamp: number): boolean {
    return Date.now() - timestamp >= this.ttl;
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxEntries) return;
    const entries = [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.length - this.maxEntries;
    for (let i = 0; i < toRemove; i++) this.cache.delete(entries[i][0]);
    this.saveToStorage();
  }

  get(key: string): unknown | null {
    const cached = this.cache.get(key);
    if (cached && !this.isExpired(cached.timestamp)) return cached.value;
    if (cached) { this.cache.delete(key); this.saveToStorage(); }
    return null;
  }

  set(key: string, value: unknown): void {
    this.cache.set(key, { value, timestamp: Date.now() });
    this.saveToStorage();
    this.evictIfNeeded();
  }

  clear(): void {
    this.cache.clear();
    try { localStorage.removeItem(this.storageKey); } catch { /* ignore */ }
  }
}

// --- types ---

interface UmamiRuntimeConfig {
  shareUrl: string | false;
  cacheTtl?: number;
  cacheMax?: number;
  timeout?: number;
}

interface ShareData {
  websiteId: string;
  token: string;
}

// --- client ---

class UmamiRuntimeClient {
  private apiBase: string;
  private shareId: string;
  private cache: SimpleCache;
  private shareData: ShareData | null = null;
  private sharePromise: Promise<ShareData> | null = null;
  private readonly timeout: number;

  constructor(config: UmamiRuntimeConfig) {
    if (!config.shareUrl) throw new Error('shareUrl 是必需参数');
    const { apiBase, shareId } = parseShareUrl(config.shareUrl);
    this.apiBase = apiBase;
    this.shareId = shareId;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.cache = new SimpleCache(
      `umami-runtime-${shareId}`,
      config.cacheTtl ?? DEFAULT_CACHE_TTL,
      config.cacheMax ?? DEFAULT_CACHE_MAX
    );
  }

  private async getShareData(): Promise<ShareData> {
    if (this.shareData) return this.shareData;
    if (this.sharePromise) return this.sharePromise;
    this.sharePromise = (async (): Promise<ShareData> => {
      const res = await fetchWithTimeout(`${this.apiBase}/share/${this.shareId}`, {}, this.timeout);
      if (!res.ok) {
        this.shareData = null;
        this.sharePromise = null;
        throw new Error(`获取分享信息失败: ${res.status}`);
      }
      const data = (await res.json()) as ShareData;
      this.shareData = data;
      return data;
    })();
    return this.sharePromise;
  }

  private async authedFetch<T>(path: string): Promise<T> {
    const { websiteId, token } = await this.getShareData();
    const res = await fetchWithTimeout(`${this.apiBase}/websites/${websiteId}${path}`, {
      headers: { 'x-umami-share-token': token, [SHARE_CONTEXT_HEADER]: SHARE_CONTEXT_VALUE }
    }, this.timeout);
    if (!res.ok) {
      if (res.status === 401) { this.shareData = null; this.sharePromise = null; }
      throw new Error(`请求 ${path} 失败: ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async getStats(path?: string, options?: { startAt?: number; endAt?: number }): Promise<StatsResult> {
    const endAt = options?.endAt ?? alignedNow();
    const startAt = options?.startAt ?? 0;
    const cacheKey = buildCacheKey(path ? `stats-${path}` : 'stats-site', {
      startAt: startAt.toString(),
      endAt: endAt.toString(),
    });
    const cached = this.cache.get(cacheKey) as StatsResult | null;
    if (cached) return { ...cached, _fromCache: true };

    const params = new URLSearchParams({ startAt: startAt.toString(), endAt: endAt.toString() });
    if (path) params.set('path', `eq.${path}`);

    const data = await this.authedFetch<Record<string, unknown>>(`/stats?${params.toString()}`);
    const result: StatsResult = {
      pageviews: extract(data.pageviews),
      visitors: extract(data.visitors),
      visits: extract(data.visits)
    };
    if (data.bounces !== undefined) result.bounces = extract(data.bounces);
    if (data.totaltime !== undefined) result.totaltime = extract(data.totaltime);
    if (data.comparison && typeof data.comparison === 'object' && data.comparison !== null) {
      const comp = data.comparison as Record<string, unknown>;
      result.comparison = {
        pageviews: extract(comp.pageviews),
        visitors: extract(comp.visitors),
        visits: extract(comp.visits),
        bounces: comp.bounces !== undefined ? extract(comp.bounces) : undefined,
        totaltime: comp.totaltime !== undefined ? extract(comp.totaltime) : undefined,
      };
    }
    this.cache.set(cacheKey, result);
    return result;
  }

  getSiteStats(options?: { startAt?: number; endAt?: number }): Promise<StatsResult> { return this.getStats(undefined, options); }
  getPageStats(path: string, options?: { startAt?: number; endAt?: number }): Promise<StatsResult> { return this.getStats(path, options); }

  async getPageStatsByUrl(url: string, options?: { startAt?: number; endAt?: number }): Promise<StatsResult> {
    const path = extractPathFromUrl(url);
    if (!path) throw new Error('无效的 URL');
    return this.getStats(path, options);
  }

  async getActiveVisitors(): Promise<number> {
    const data = await this.authedFetch<{ visitors?: number }>('/active');
    return typeof data?.visitors === 'number' ? data.visitors : 0;
  }

  async getPageviews(params?: {
    startAt?: number;
    endAt?: number;
    unit?: 'year' | 'month' | 'day' | 'hour' | 'minute';
    timezone?: string;
  }): Promise<PageviewsSeries> {
    const { startAt = 0, endAt = alignedNow(), unit = 'day', timezone = 'UTC' } = params ?? {};
    const cacheParams = { startAt: startAt.toString(), endAt: endAt.toString(), unit, timezone };
    const cacheKey = buildCacheKey('pageviews', cacheParams);

    const cached = this.cache.get(cacheKey) as PageviewsSeries | null;
    if (cached) return { ...cached, _fromCache: true } as PageviewsSeries & { _fromCache?: boolean };

    const qp = new URLSearchParams({
      startAt: startAt.toString(),
      endAt: endAt.toString(),
      unit,
      timezone
    });

    const data = await this.authedFetch<{
      pageviews: Array<{ x: string; y: number | { value: number } }>;
      sessions: Array<{ x: string; y: number | { value: number } }>;
    }>(`/pageviews?${qp.toString()}`);

    const result: PageviewsSeries = {
      pageviews: data.pageviews.map(p => ({ x: p.x, y: extract(p.y) })),
      sessions: data.sessions.map(s => ({ x: s.x, y: extract(s.y) }))
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  async getMetrics(
    type: 'path' | 'referrer' | 'browser' | 'os' | 'device' | 'country' | 'region' | 'city' | 'event' | 'title' | 'language' | 'screen' | 'tag',
    params?: { startAt?: number; endAt?: number; limit?: number }
  ): Promise<MetricEntry[]> {
    const { startAt = 0, endAt = alignedNow(), limit } = params ?? {};
    const cacheParams: Record<string, string> = {
      type,
      startAt: startAt.toString(),
      endAt: endAt.toString()
    };
    if (typeof limit === 'number') cacheParams.limit = limit.toString();
    const cacheKey = buildCacheKey('metrics', cacheParams);

    const cached = this.cache.get(cacheKey) as MetricEntry[] | null;
    if (cached) {
      Object.defineProperty(cached, '_fromCache', { value: true, enumerable: true, writable: true });
      return cached;
    }

    const qp = new URLSearchParams({
      startAt: startAt.toString(),
      endAt: endAt.toString(),
      type
    });
    if (typeof limit === 'number') qp.set('limit', limit.toString());

    const data = await this.authedFetch<MetricEntry[]>(`/metrics?${qp.toString()}`);
    this.cache.set(cacheKey, data);
    return data;
  }

  async getWebsite(): Promise<WebsiteInfo> {
    const cacheKey = 'website';
    const cached = this.cache.get(cacheKey) as WebsiteInfo | null;
    if (cached) return { ...cached, _fromCache: true } as WebsiteInfo & { _fromCache?: boolean };

    const data = await this.authedFetch<WebsiteInfo>('/websites/');
    this.cache.set(cacheKey, data);
    return data;
  }

  async getDateRange(): Promise<DateRange> {
    const cacheKey = 'daterange';
    const cached = this.cache.get(cacheKey) as DateRange | null;
    if (cached) return { ...cached, _fromCache: true } as DateRange & { _fromCache?: boolean };

    const data = await this.authedFetch<DateRange>('/daterange');
    this.cache.set(cacheKey, data);
    return data;
  }

  clearCache(): void {
    this.cache.clear();
    this.shareData = null;
    this.sharePromise = null;
  }
}

// --- mount ---

function mountEmptyClient(): void {
  const zeroStats = () => Promise.resolve({ pageviews: 0, visitors: 0, visits: 0 });
  const zeroSeries = () => Promise.resolve({ pageviews: [], sessions: [] });
  const zeroMetrics = () => Promise.resolve([]);
  const zeroWebsite = () => Promise.resolve({
    id: '', name: '', domain: '', shareId: null, createdAt: '', updatedAt: '', resetAt: null,
    userId: '', teamId: null, createdBy: '', deletedAt: null, recorderEnabled: false, replayConfig: null
  });
  const zeroDateRange = () => Promise.resolve({ startDate: null, endDate: null });

  (window as typeof window & { oddmisc?: Record<string, unknown> }).oddmisc = {
    getStats: zeroStats, getSiteStats: zeroStats, getPageStats: zeroStats,
    getPageStatsByUrl: zeroStats,
    getActiveVisitors: () => Promise.resolve(0),
    getPageviews: zeroSeries, getMetrics: zeroMetrics,
    getWebsite: zeroWebsite, getDateRange: zeroDateRange,
    clearCache: () => {}
  };
}

export function initUmamiRuntime(config: UmamiRuntimeConfig): void {
  if (!config.shareUrl) {
    console.log('[oddmisc] shareUrl 未配置，跳过初始化');
    mountEmptyClient();
  } else {
    try {
      const client = new UmamiRuntimeClient(config);
      (window as typeof window & { oddmisc?: Record<string, unknown> }).oddmisc = {
        umami: client,
        getStats: (path?: string, options?: { startAt?: number; endAt?: number }) => client.getStats(path, options),
        getSiteStats: (options?: { startAt?: number; endAt?: number }) => client.getSiteStats(options),
        getPageStats: (path: string, options?: { startAt?: number; endAt?: number }) => client.getPageStats(path, options),
        getPageStatsByUrl: (url: string, options?: { startAt?: number; endAt?: number }) => client.getPageStatsByUrl(url, options),
        getActiveVisitors: () => client.getActiveVisitors(),
        getPageviews: (params?: {
          startAt?: number;
          endAt?: number;
          unit?: 'year' | 'month' | 'day' | 'hour' | 'minute';
          timezone?: string;
        }) => client.getPageviews(params),
        getMetrics: (
          type: 'path' | 'referrer' | 'browser' | 'os' | 'device' | 'country' | 'region' | 'city' | 'event' | 'title' | 'language' | 'screen' | 'tag',
          params?: { startAt?: number; endAt?: number; limit?: number }
        ) => client.getMetrics(type, params),
        getWebsite: () => client.getWebsite(),
        getDateRange: () => client.getDateRange(),
        clearCache: () => client.clearCache()
      };
      console.log('[oddmisc] Umami runtime client initialized');
    } catch (error) {
      console.warn('[oddmisc] 初始化失败:', error instanceof Error ? error.message : error);
      mountEmptyClient();
    }
  }

  window.dispatchEvent(
    new CustomEvent('oddmisc-ready', {
      detail: { client: (window as typeof window & { oddmisc?: Record<string, unknown> }).oddmisc }
    })
  );
}

export type { UmamiRuntimeConfig };

interface OddmiscReadyEvent extends CustomEvent {
  detail: {
    client: {
      getStats: (path?: string, options?: { startAt?: number; endAt?: number }) => Promise<StatsResult>;
      getSiteStats: (options?: { startAt?: number; endAt?: number }) => Promise<StatsResult>;
      getPageStats: (path: string, options?: { startAt?: number; endAt?: number }) => Promise<StatsResult>;
      getPageStatsByUrl: (url: string, options?: { startAt?: number; endAt?: number }) => Promise<StatsResult>;
      getActiveVisitors: () => Promise<number>;
      getPageviews: (params?: {
        startAt?: number;
        endAt?: number;
        unit?: 'year' | 'month' | 'day' | 'hour' | 'minute';
        timezone?: string;
      }) => Promise<PageviewsSeries>;
      getMetrics: (
        type: 'path' | 'referrer' | 'browser' | 'os' | 'device' | 'country' | 'region' | 'city' | 'event' | 'title' | 'language' | 'screen' | 'tag',
        params?: { startAt?: number; endAt?: number; limit?: number }
      ) => Promise<MetricEntry[]>;
      getWebsite: () => Promise<WebsiteInfo>;
      getDateRange: () => Promise<DateRange>;
      clearCache: () => void;
    };
  };
}

export type { OddmiscReadyEvent };

// Test exports (internal classes)
export { SimpleCache, UmamiRuntimeClient };