/**
 * 浏览器运行时客户端。
 * 此文件会被内联注入到页面，因此不能有任何外部依赖。
 */

const DEFAULT_TIMEOUT = 10000;

// cloud.umami.is / 新版自托管 Umami 的 share token 鉴权必须同时带此 context 头。
const SHARE_CONTEXT_HEADER = 'x-umami-share-context';
const SHARE_CONTEXT_VALUE = '1';

async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeout = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

interface UmamiRuntimeConfig {
  shareUrl: string | false;
}

interface StatsResult {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces?: number;
  totaltime?: number;
  _fromCache?: boolean;
}

interface ShareData {
  websiteId: string;
  token: string;
}

function extract(field: unknown): number {
  if (typeof field === 'number') return field;
  if (field && typeof (field as { value?: unknown }).value === 'number') {
    return (field as { value: number }).value;
  }
  return 0;
}

function parseShareUrl(shareUrl: string): { apiBase: string; shareId: string } {
  const url = new URL(shareUrl);
  const pathParts = url.pathname.split('/');
  const shareIndex = pathParts.indexOf('share');

  if (shareIndex === -1 || shareIndex === pathParts.length - 1) {
    throw new Error('无效的分享 URL：未找到 share 路径');
  }

  const shareId = pathParts[shareIndex + 1];
  if (!shareId) {
    throw new Error('无效的分享 URL：缺少分享 ID');
  }

  const pathBeforeShare = pathParts.slice(0, shareIndex).join('/');
  const apiBase = `${url.protocol}//${url.host}${pathBeforeShare}/api`;
  return { apiBase, shareId };
}

class SimpleCache {
  private cache = new Map<string, { value: unknown; timestamp: number }>();

  constructor(private readonly storageKey: string, private readonly ttl: number) {
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
    } catch {}
  }

  private saveToStorage(): void {
    try {
      const obj: Record<string, { value: unknown; timestamp: number }> = {};
      this.cache.forEach((value, key) => {
        obj[key] = value;
      });
      localStorage.setItem(this.storageKey, JSON.stringify(obj));
    } catch {}
  }

  private isExpired(timestamp: number): boolean {
    return Date.now() - timestamp >= this.ttl;
  }

  get(key: string): unknown | null {
    const cached = this.cache.get(key);
    if (cached && !this.isExpired(cached.timestamp)) {
      return cached.value;
    }
    if (cached) {
      this.cache.delete(key);
      this.saveToStorage();
    }
    return null;
  }

  set(key: string, value: unknown): void {
    this.cache.set(key, { value, timestamp: Date.now() });
    this.saveToStorage();
  }

  clear(): void {
    this.cache.clear();
    try {
      localStorage.removeItem(this.storageKey);
    } catch {}
  }
}

class UmamiRuntimeClient {
  private apiBase: string;
  private shareId: string;
  private cache: SimpleCache;
  private shareData: ShareData | null = null;
  private sharePromise: Promise<ShareData> | null = null;

  constructor(config: UmamiRuntimeConfig) {
    if (!config.shareUrl) {
      throw new Error('shareUrl 是必需参数');
    }
    const { apiBase, shareId } = parseShareUrl(config.shareUrl);
    this.apiBase = apiBase;
    this.shareId = shareId;
    this.cache = new SimpleCache(`umami-runtime-${shareId}`, 3600000);
  }

  private async getShareData(): Promise<ShareData> {
    if (this.shareData) return this.shareData;
    if (this.sharePromise) return this.sharePromise;

    this.sharePromise = (async (): Promise<ShareData> => {
      const res = await fetchWithTimeout(`${this.apiBase}/share/${this.shareId}`);
      if (!res.ok) {
        this.sharePromise = null;
        throw new Error(`获取分享信息失败: ${res.status}`);
      }
      const data = await res.json();
      this.shareData = data;
      return data;
    })();

    return this.sharePromise;
  }

  private async authedFetch<T>(path: string): Promise<T> {
    const { websiteId, token } = await this.getShareData();
    const res = await fetchWithTimeout(`${this.apiBase}/websites/${websiteId}${path}`, {
      headers: {
        'x-umami-share-token': token,
        [SHARE_CONTEXT_HEADER]: SHARE_CONTEXT_VALUE
      }
    });
    if (!res.ok) {
      throw new Error(`请求 ${path} 失败: ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async getStats(path?: string): Promise<StatsResult> {
    const cacheKey = path ? `stats-${path}` : 'stats-site';
    const cached = this.cache.get(cacheKey) as StatsResult | null;
    if (cached) return { ...cached, _fromCache: true };

    const params = new URLSearchParams({
      startAt: '0',
      endAt: Date.now().toString()
    });
    if (path) params.set('path', `eq.${path}`);

    const data = await this.authedFetch<Record<string, unknown>>(`/stats?${params.toString()}`);
    const result: StatsResult = {
      pageviews: extract(data.pageviews),
      visitors: extract(data.visitors),
      visits: extract(data.visits)
    };
    if (data.bounces !== undefined) result.bounces = extract(data.bounces);
    if (data.totaltime !== undefined) result.totaltime = extract(data.totaltime);

    this.cache.set(cacheKey, result);
    return result;
  }

  getSiteStats(): Promise<StatsResult> {
    return this.getStats();
  }

  getPageStats(path: string): Promise<StatsResult> {
    return this.getStats(path);
  }

  async getActiveVisitors(): Promise<number> {
    const data = await this.authedFetch<{ visitors?: number }>('/active');
    return typeof data?.visitors === 'number' ? data.visitors : 0;
  }

  clearCache(): void {
    this.cache.clear();
    this.shareData = null;
    this.sharePromise = null;
  }
}

function mountEmptyClient(): void {
  const zeroStats = () => Promise.resolve({ pageviews: 0, visitors: 0, visits: 0 });
  (window as typeof window & { oddmisc?: Record<string, unknown> }).oddmisc = {
    getStats: zeroStats,
    getSiteStats: zeroStats,
    getPageStats: zeroStats,
    getActiveVisitors: () => Promise.resolve(0),
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
        getStats: (path?: string) => client.getStats(path),
        getSiteStats: () => client.getSiteStats(),
        getPageStats: (path: string) => client.getPageStats(path),
        getActiveVisitors: () => client.getActiveVisitors(),
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

export type { UmamiRuntimeConfig, StatsResult };

interface OddmiscReadyEvent extends CustomEvent {
  detail: {
    client: {
      getStats: (path?: string) => Promise<StatsResult>;
      getSiteStats: () => Promise<StatsResult>;
      getPageStats: (path: string) => Promise<StatsResult>;
      getActiveVisitors: () => Promise<number>;
      clearCache: () => void;
    };
  };
}

export type { OddmiscReadyEvent };
