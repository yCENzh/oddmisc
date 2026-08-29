import type {
  ShareData,
  StatsQueryParams,
  PageviewsSeries,
  MetricEntry,
  MetricType,
  WebsiteInfo,
  DateRange
} from './types';
import { CacheManager } from '../../utils/umami/cache';
import { fetchWithTimeout } from '../../utils/fetch';
import { UmamiNetworkError, UmamiAuthError } from '../../errors';

// cloud.umami.is 需要此 header，否则 401
const SHARE_CONTEXT_HEADER = 'x-umami-share-context';
const SHARE_CONTEXT_VALUE = '1';

// endAt 默认值按 5 分钟对齐，减少缓存未命中
const RANGE_ALIGN_MS = 5 * 60_000;

interface StatsAPIParams extends Partial<StatsQueryParams> {
  path?: string;
  hostname?: string;
  url?: string;
}

export interface StatsAPIResponse {
  pageviews?: number | { value: number };
  visitors?: number | { value: number };
  visits?: number | { value: number };
  bounces?: number | { value: number };
  totaltime?: number | { value: number };
  comparison?: {
    pageviews?: number;
    visitors?: number;
    visits?: number;
    bounces?: number;
    totaltime?: number;
  };
  _fromCache?: boolean;
  [key: string]: unknown;
}

export interface TimeRange {
  startAt?: number;
  endAt?: number;
}

export interface PageviewsParams extends TimeRange {
  unit?: 'year' | 'month' | 'day' | 'hour' | 'minute';
  timezone?: string;
}

export interface MetricsParams extends TimeRange {
  limit?: number;
}

type Cached<T> = T & { _fromCache?: boolean };

export class UmamiAPI {
  private sharePromises = new Map<string, Promise<ShareData>>();

  constructor(private readonly cacheManager: CacheManager) {}

  private shareKey(baseUrl: string, shareId: string): string {
    return `${baseUrl}|${shareId}`;
  }

  async getShareData(baseUrl: string, shareId: string): Promise<ShareData> {
    const key = this.shareKey(baseUrl, shareId);
    let promise = this.sharePromises.get(key);
    if (!promise) {
      promise = this.fetchShareData(baseUrl, shareId).catch((err) => {
        this.sharePromises.delete(key);
        throw err;
      });
      this.sharePromises.set(key, promise);
    }
    return promise;
  }

  clearShareCache(baseUrl?: string, shareId?: string): void {
    if (baseUrl && shareId) {
      this.sharePromises.delete(this.shareKey(baseUrl, shareId));
    } else {
      this.sharePromises.clear();
    }
  }

  private async fetchShareData(baseUrl: string, shareId: string): Promise<ShareData> {
    const res = await fetchWithTimeout(`${baseUrl}/share/${shareId}`);
    if (!res.ok) {
      throw new UmamiNetworkError(`获取分享信息失败: ${res.status}`, res.status);
    }
    return (await res.json()) as ShareData;
  }

  private async authedFetch<T>(baseUrl: string, shareId: string, path: string): Promise<T> {
    const { token } = await this.getShareData(baseUrl, shareId);
    const res = await fetchWithTimeout(`${baseUrl}${path}`, {
      headers: {
        'x-umami-share-token': token,
        [SHARE_CONTEXT_HEADER]: SHARE_CONTEXT_VALUE
      }
    });

    if (!res.ok) {
      if (res.status === 401) {
        this.sharePromises.delete(this.shareKey(baseUrl, shareId));
        throw new UmamiAuthError('认证失败，请检查 shareId', res.status);
      }
      throw new UmamiNetworkError(`请求 ${path} 失败: ${res.status}`, res.status);
    }
    return (await res.json()) as T;
  }

  private async cachedGet<T extends object>(
    baseUrl: string,
    shareId: string,
    path: string,
    cacheKey: string
  ): Promise<Cached<T>> {
    const cached = this.cacheManager.get(cacheKey) as T | null;
    if (cached) return { ...cached, _fromCache: true };
    const data = await this.authedFetch<T>(baseUrl, shareId, path);
    this.cacheManager.set(cacheKey, data);
    return data;
  }

  private resolveRange(range: TimeRange = {}): { startAt: number; endAt: number } {
    return {
      startAt: range.startAt ?? 0,
      endAt: range.endAt ?? Math.floor(Date.now() / RANGE_ALIGN_MS) * RANGE_ALIGN_MS
    };
  }

  async getStats(baseUrl: string, shareId: string, params: StatsAPIParams): Promise<StatsAPIResponse> {
    const { websiteId } = await this.getShareData(baseUrl, shareId);
    const { startAt, endAt } = this.resolveRange(params);
    const qp = new URLSearchParams({ startAt: startAt.toString(), endAt: endAt.toString() });
    const cacheQp = new URLSearchParams({ startAt: startAt.toString(), endAt: endAt.toString() });
    if (params.path) { qp.set('path', params.path); cacheQp.set('path', params.path); }
    if (params.url) { qp.set('url', params.url); cacheQp.set('url', params.url); }
    if (params.hostname) { qp.set('hostname', params.hostname); cacheQp.set('hostname', params.hostname); }
    return this.cachedGet<StatsAPIResponse>(
      baseUrl, shareId,
      `/websites/${websiteId}/stats?${qp.toString()}`,
      `${baseUrl}|${shareId}|stats|${cacheQp.toString()}`
    );
  }

  async getActiveVisitors(baseUrl: string, shareId: string): Promise<{ visitors: number }> {
    const { websiteId } = await this.getShareData(baseUrl, shareId);
    return this.authedFetch(baseUrl, shareId, `/websites/${websiteId}/active`);
  }

  async getWebsite(baseUrl: string, shareId: string): Promise<Cached<WebsiteInfo>> {
    const { websiteId } = await this.getShareData(baseUrl, shareId);
    return this.cachedGet<WebsiteInfo>(
      baseUrl, shareId,
      `/websites/${websiteId}`,
      `${baseUrl}|${shareId}|website`
    );
  }

  async getDateRange(baseUrl: string, shareId: string): Promise<Cached<DateRange>> {
    const { websiteId } = await this.getShareData(baseUrl, shareId);
    return this.cachedGet<DateRange>(
      baseUrl, shareId,
      `/websites/${websiteId}/daterange`,
      `${baseUrl}|${shareId}|daterange`
    );
  }

  async getPageviews(
    baseUrl: string,
    shareId: string,
    params: PageviewsParams = {}
  ): Promise<Cached<PageviewsSeries>> {
    const { websiteId } = await this.getShareData(baseUrl, shareId);
    const { startAt, endAt } = this.resolveRange(params);
    const qp = new URLSearchParams({ startAt: startAt.toString(), endAt: endAt.toString() });
    const cacheQp = new URLSearchParams({ startAt: startAt.toString(), endAt: endAt.toString() });
    qp.set('unit', params.unit ?? 'day');
    qp.set('timezone', params.timezone ?? 'UTC');
    cacheQp.set('unit', params.unit ?? 'day');
    cacheQp.set('timezone', params.timezone ?? 'UTC');
    return this.cachedGet<PageviewsSeries>(
      baseUrl, shareId,
      `/websites/${websiteId}/pageviews?${qp.toString()}`,
      `${baseUrl}|${shareId}|pageviews|${cacheQp.toString()}`
    );
  }

  async getMetrics(
    baseUrl: string,
    shareId: string,
    type: MetricType,
    params: MetricsParams = {}
  ): Promise<Cached<MetricEntry[]>> {
    const { websiteId } = await this.getShareData(baseUrl, shareId);
    const { startAt, endAt } = this.resolveRange(params);
    const qp = new URLSearchParams({ startAt: startAt.toString(), endAt: endAt.toString() });
    const cacheQp = new URLSearchParams({ startAt: startAt.toString(), endAt: endAt.toString() });
    qp.set('type', type);
    if (typeof params.limit === 'number') qp.set('limit', params.limit.toString());
    cacheQp.set('type', type);
    if (typeof params.limit === 'number') cacheQp.set('limit', params.limit.toString());
    const cacheKey = `${baseUrl}|${shareId}|metrics|${cacheQp.toString()}`;

    const cached = this.cacheManager.get(cacheKey) as MetricEntry[] | null;
    if (cached) {
      Object.defineProperty(cached, '_fromCache', { value: true, enumerable: true, writable: true });
      return cached;
    }

    const data = await this.authedFetch<MetricEntry[]>(
      baseUrl, shareId,
      `/websites/${websiteId}/metrics?${qp.toString()}`
    );
    this.cacheManager.set(cacheKey, data);
    return data;
  }
}
