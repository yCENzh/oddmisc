import type { ShareData, StatsQueryParams } from './types';
import { CacheManager } from '../../utils/umami/cache';
import { fetchWithTimeout } from '../../utils/fetch';
import { UmamiNetworkError, UmamiAuthError } from '../../errors';

interface StatsAPIParams extends Partial<StatsQueryParams> {
  path?: string;
  url?: string;
}

interface StatsAPIResponse {
  pageviews?: number | { value: number };
  visitors?: number | { value: number };
  visits?: number | { value: number };
  _fromCache?: boolean;
  [key: string]: unknown;
}

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
    const res = await fetchWithTimeout(`${baseUrl}/share/${shareId}`);
    if (!res.ok) {
      throw new UmamiNetworkError(`获取分享信息失败: ${res.status}`, res.status);
    }
    return res.json();
  }

  async getStats(baseUrl: string, shareId: string, params: StatsAPIParams): Promise<StatsAPIResponse> {
    const cacheKey = `${baseUrl}|${shareId}|${JSON.stringify(params)}`;

    const cached = this.cacheManager.get(cacheKey);
    if (cached) {
      return { ...cached, _fromCache: true };
    }

    const { websiteId, token } = await this.getShareData(baseUrl, shareId);

    const queryParams = new URLSearchParams({
      startAt: '0',
      endAt: Date.now().toString()
    });

    if (params.path) {
      queryParams.set('path', params.path);
    }

    const statsUrl = `${baseUrl}/websites/${websiteId}/stats?${queryParams.toString()}`;

    const res = await fetchWithTimeout(statsUrl, {
      headers: { 'x-umami-share-token': token }
    });

    if (!res.ok) {
      if (res.status === 401) {
        this.cacheManager.clear();
        throw new UmamiAuthError('认证失败，请检查 shareId', res.status);
      }
      throw new UmamiNetworkError(`获取统计失败: ${res.status}`, res.status);
    }

    const data = await res.json();
    this.cacheManager.set(cacheKey, data);
    return data;
  }

  clearShareCache(): void {
    this.sharePromise = null;
  }
}
