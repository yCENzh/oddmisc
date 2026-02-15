/**
 * 浏览器运行时客户端
 * 用于 Astro 集成注入到页面中
 * 
 * 注意：此文件会被内联注入到页面，不能有外部依赖
 */

interface UmamiRuntimeConfig {
  shareUrl: string;
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

// 解析分享 URL
function parseShareUrl(shareUrl: string): { apiBase: string; shareId: string } {
  const url = new URL(shareUrl);
  const pathParts = url.pathname.split('/');
  const shareIndex = pathParts.indexOf('share');
  
  if (shareIndex === -1 || shareIndex === pathParts.length - 1) {
    throw new Error('无效的分享 URL：未找到 share 路径');
  }
  
  const shareId = pathParts[shareIndex + 1];
  
  if (!shareId || shareId.length < 10) {
    throw new Error('无效的分享 ID');
  }
  
  // 构造 apiBase：去掉 /share/{shareId}，加上 /api
  const pathBeforeShare = pathParts.slice(0, shareIndex).join('/');
  const apiPath = pathBeforeShare + '/api';
  const apiBase = `${url.protocol}//${url.host}${apiPath}`;
  
  return { apiBase, shareId };
}

// 简单的缓存管理
class SimpleCache {
  private cache = new Map<string, { value: any; timestamp: number }>();
  private storageKey: string;
  private ttl: number;

  constructor(storageKey: string, ttl: number) {
    this.storageKey = storageKey;
    this.ttl = ttl;
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const now = Date.now();
        for (const [key, data] of Object.entries(parsed)) {
          if (now - (data as any).timestamp < this.ttl) {
            this.cache.set(key, data as { value: any; timestamp: number });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private saveToStorage(): void {
    try {
      const obj: Record<string, any> = {};
      this.cache.forEach((value, key) => {
        obj[key] = value;
      });
      localStorage.setItem(this.storageKey, JSON.stringify(obj));
    } catch {
      // ignore
    }
  }

  get(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.value;
    }
    return null;
  }

  set(key: string, value: any): void {
    this.cache.set(key, { value, timestamp: Date.now() });
    this.saveToStorage();
  }

  clear(): void {
    this.cache.clear();
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // ignore
    }
  }
}

// Umami 运行时客户端
class UmamiRuntimeClient {
  private apiBase: string;
  private shareId: string;
  private cache: SimpleCache;
  private shareData: ShareData | null = null;
  private sharePromise: Promise<ShareData> | null = null;

  constructor(config: UmamiRuntimeConfig) {
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
      const res = await fetch(`${this.apiBase}/share/${this.shareId}`);
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
      return { ...cached, _fromCache: true };
    }

    const { websiteId, token } = await this.getShareData();
    
    const params = new URLSearchParams({
      startAt: '0',
      endAt: Date.now().toString()
    });

    if (path) {
      params.set('path', `eq.${path}`);
    }

    const res = await fetch(
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

// 初始化函数 - 挂载到 window.oddmisc
export function initUmamiRuntime(config: UmamiRuntimeConfig): void {
  const client = new UmamiRuntimeClient(config);
  
  (window as any).oddmisc = (window as any).oddmisc || {};
  (window as any).oddmisc.umami = client;
  (window as any).oddmisc.getStats = (path?: string) => client.getStats(path);
  (window as any).oddmisc.getSiteStats = () => client.getSiteStats();
  (window as any).oddmisc.getPageStats = (path: string) => client.getPageStats(path);
  (window as any).oddmisc.clearCache = () => client.clearCache();
  
  console.log('[oddmisc] Umami runtime client initialized');
}

export type { UmamiRuntimeConfig, StatsResult };
