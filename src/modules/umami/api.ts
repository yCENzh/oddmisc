import type { ShareData } from './types';
import { CacheManager } from '../../utils/umami/cache';

export class UmamiAPI {
  private cacheManager: CacheManager;
  private sharePromise: Promise<ShareData> | null = null;

  constructor(cacheManager: CacheManager) {
    this.cacheManager = cacheManager;
  }

  async getShareData(baseUrl: string, shareId: string): Promise<ShareData> {
    if (!this.sharePromise) {
      this.sharePromise = this.fetchShareData(baseUrl, shareId).catch((err) => {
        this.sharePromise = null;
        throw err;
      });
    }
    return this.sharePromise;
  }

  private async fetchShareData(baseUrl: string, shareId: string): Promise<ShareData> {
    const res = await fetch(`${baseUrl}/share/${shareId}`);
    if (!res.ok) {
      throw new Error(`获取分享信息失败: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async getStats(baseUrl: string, shareId: string, params: any) {
    const cacheKey = `${baseUrl}|${shareId}|${JSON.stringify(params)}`;
    
    const cached = this.cacheManager.get(cacheKey);
    if (cached) {
      return { ...cached, _fromCache: true };
    }

    const { websiteId, token } = await this.getShareData(baseUrl, shareId);
    
    const queryParams = new URLSearchParams({
      startAt: '0',
      endAt: Date.now().toString(),
      unit: 'hour',
      timezone: params.timezone || 'Asia/Shanghai',
      compare: 'false',
      ...params
    });

    const statsUrl = `${baseUrl}/websites/${websiteId}/stats?${queryParams.toString()}`;
    
    const res = await fetch(statsUrl, {
      headers: { 'x-umami-share-token': token }
    });

    if (!res.ok) {
      if (res.status === 401) {
        this.cacheManager.clear();
        throw new Error('认证失败，请检查 shareId');
      }
      throw new Error(`获取统计失败: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    this.cacheManager.set(cacheKey, data);
    return data;
  }

  clearShareCache(): void {
    this.sharePromise = null;
  }
}