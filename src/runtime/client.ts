/**
 * 浏览器运行时客户端
 * 注意：此文件会被内联注入到页面，不能有外部依赖
 */

const DEFAULT_TIMEOUT = 10000;

async function fetchWithTimeout(url: string, options?: RequestInit, timeout = DEFAULT_TIMEOUT): Promise<Response> {
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
  visits?: number;
  _fromCache?: boolean;
}

interface ShareData {
  websiteId: string;
  token: string;
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
  private storageKey: string;
  private ttl: number;
  private storageCache: Record<string, { value: unknown; timestamp: number }> | null = null;

  constructor(storageKey: string, ttl: number) {
    this.storageKey = storageKey;
    this.ttl = ttl;
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (this.storageCache !== null) return;
    try {
      const stored = localStorage.getItem(this.storageKey);
      this.storageCache = stored ? JSON.parse(stored) : {};
    } catch {
      this.storageCache = {};
    }
  }

  private saveToStorage(): void {
    try {
      const obj: Record<string, { value: unknown; timestamp: number }> = {};
      this.cache.forEach((value, key) => {
        obj[key] = value;
      });
      localStorage.setItem(this.storageKey, JSON.stringify(obj));
      this.storageCache = obj;
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
    }
    return null;
  }

  set(key: string, value: unknown): void {
    const entry = { value, timestamp: Date.now() };
    this.cache.set(key, entry);
    this.saveToStorage();
  }

  clear(): void {
    this.cache.clear();
    this.storageCache = null;
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
    if (this.shareData) {
      return this.shareData;
    }

    if (this.sharePromise) {
      return this.sharePromise;
    }

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

  async getStats(path?: string): Promise<StatsResult> {
    const cacheKey = path ? `stats-${path}` : 'stats-site';

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached as StatsResult, _fromCache: true };
    }

    const { websiteId, token } = await this.getShareData();

    const params = new URLSearchParams({
      startAt: '0',
      endAt: Date.now().toString()
    });

    if (path) {
      params.set('path', `eq.${path}`);
    }

    const res = await fetchWithTimeout(
      `${this.apiBase}/websites/${websiteId}/stats?${params.toString()}`,
      {
        headers: { 'x-umami-share-token': token }
      }
    );

    if (!res.ok) {
      throw new Error(`获取统计失败: ${res.status}`);
    }

    const data = await res.json();

    const result: StatsResult = {
      pageviews: data.pageviews?.value ?? data.pageviews ?? 0,
      visitors: data.visitors?.value ?? data.visitors ?? 0,
      visits: data.visits?.value ?? data.visits ?? 0
    };

    this.cache.set(cacheKey, result);

    return result;
  }

  async getSiteStats(): Promise<StatsResult> {
    return this.getStats();
  }

  async getPageStats(path: string): Promise<StatsResult> {
    return this.getStats(path);
  }

  clearCache(): void {
    this.cache.clear();
    this.shareData = null;
    this.sharePromise = null;
  }
}

function mountEmptyClient(): void {
  (window as typeof window & { oddmisc?: Record<string, unknown> }).oddmisc = {
    getStats: () => Promise.resolve({ pageviews: 0, visitors: 0, visits: 0 }),
    getSiteStats: () => Promise.resolve({ pageviews: 0, visitors: 0, visits: 0 }),
    getPageStats: () => Promise.resolve({ pageviews: 0, visitors: 0, visits: 0 }),
    clearCache: () => {},
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
        clearCache: () => client.clearCache(),
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
      clearCache: () => void;
    };
  };
}

export type { OddmiscReadyEvent };
