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
import { buildCacheKey, RANGE_ALIGN_MS } from '../../runtime/shared';

const SHARE_CONTEXT_HEADER = 'x-umami-share-context';
const SHARE_CONTEXT_VALUE = '1';

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

  private shareKey(shareId: string): string {
    return shareId;
  }

  async getShareData(baseUrl: string, shareId: string): Promise<ShareData> {
    const key = this.shareKey(shareId);
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

clearShareCache(shareId?: string): void {
    if (shareId) {
      this.sharePromises.delete(this.shareKey(shareId));
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
        this.sharePromises.delete(this.shareKey(shareId));
        throw new UmamiAuthError('认证失败，请检查 shareId', res.status);
      }
      throw new UmamiNetworkError(`请求 ${path} 失败: ${res.status}`, res.status);
    }
    return (await res.json()) as T;
  }

  private async cachedGet<T>(
    baseUrl: string,
    shareId: string,
    path: string,
    cacheKey: string
  ): Promise<Cached<T>> {
    const cached = this.cacheManager.get(cacheKey) as T | null;
    if (cached) return { ...cached, _fromCache: true } as Cached<T>;
    const data = await this.authedFetch<T>(baseUrl, shareId, path);
    this.cacheManager.set(cacheKey, data);
    return { ...data, _fromCache: false } as Cached<T>;
  }

  private resolveRange(range: TimeRange = {}): { startAt: number; endAt: number } {
    return {
      startAt: range.startAt ?? 0,
      endAt: range.endAt ?? Math.floor(Date.now() / RANGE_ALIGN_MS) * RANGE_ALIGN_MS
    };
  }

  private buildCacheKeyForStats(baseUrl: string, shareId: string, params: StatsAPIParams): string {
    const { startAt, endAt } = this.resolveRange(params);
    return buildCacheKey(`${baseUrl}|${shareId}|stats`, {
      startAt: startAt.toString(),
      endAt: endAt.toString(),
      path: params.path ?? '',
      url: params.url ?? '',
      hostname: params.hostname ?? '',
    });
  }

  private buildCacheKeyForPageviews(baseUrl: string, shareId: string, params: PageviewsParams): string {
    const { startAt, endAt } = this.resolveRange(params);
    return buildCacheKey(`${baseUrl}|${shareId}|pageviews`, {
      startAt: startAt.toString(),
      endAt: endAt.toString(),
      unit: params.unit ?? 'day',
      timezone: params.timezone ?? 'UTC',
    });
  }

  private buildCacheKeyForMetrics(baseUrl: string, shareId: string, type: MetricType, params: MetricsParams): string {
    const { startAt, endAt } = this.resolveRange(params);
    return buildCacheKey(`${baseUrl}|${shareId}|metrics`, {
      startAt: startAt.toString(),
      endAt: endAt.toString(),
      type,
      limit: typeof params.limit === 'number' ? params.limit.toString() : '',
    });
  }

  async getStats(baseUrl: string, shareId: string, params: StatsAPIParams): Promise<StatsAPIResponse> {
    const { websiteId } = await this.getShareData(baseUrl, shareId);
    const cacheKey = this.buildCacheKeyForStats(baseUrl, shareId, params);

    const qp = new URLSearchParams({ startAt: '0', endAt: '0' });
    const { startAt, endAt } = this.resolveRange(params);
    qp.set('startAt', startAt.toString());
    qp.set('endAt', endAt.toString());
    if (params.path) qp.set('path', params.path);
    if (params.url) qp.set('url', params.url);
    if (params.hostname) qp.set('hostname', params.hostname);

    return this.cachedGet<StatsAPIResponse>(
      baseUrl, shareId,
      `/websites/${websiteId}/stats?${qp.toString()}`,
      cacheKey
    );
  }

  async getActiveVisitors(baseUrl: string, shareId: string): Promise<{ visitors: number }> {
    const { websiteId } = await this.getShareData(baseUrl, shareId);
    return this.authedFetch(baseUrl, shareId, `/websites/${websiteId}/active`);
  }

  async getWebsite(baseUrl: string, shareId: string): Promise<Cached<WebsiteInfo>> {
    const { websiteId } = await this.getShareData(baseUrl, shareId);
    const cacheKey = `${baseUrl}|${shareId}|website`;
    return this.cachedGet<WebsiteInfo>(
      baseUrl, shareId,
      `/websites/${websiteId}`,
      cacheKey
    );
  }

  async getDateRange(baseUrl: string, shareId: string): Promise<Cached<DateRange>> {
    const { websiteId } = await this.getShareData(baseUrl, shareId);
    const cacheKey = `${baseUrl}|${shareId}|daterange`;
    return this.cachedGet<DateRange>(
      baseUrl, shareId,
      `/websites/${websiteId}/daterange`,
      cacheKey
    );
  }

  async getPageviews(
    baseUrl: string,
    shareId: string,
    params: PageviewsParams = {}
  ): Promise<Cached<PageviewsSeries>> {
    const { websiteId } = await this.getShareData(baseUrl, shareId);
    const cacheKey = this.buildCacheKeyForPageviews(baseUrl, shareId, params);

    const qp = new URLSearchParams({ startAt: '0', endAt: '0' });
    const { startAt, endAt } = this.resolveRange(params);
    qp.set('startAt', startAt.toString());
    qp.set('endAt', endAt.toString());
    qp.set('unit', params.unit ?? 'day');
    qp.set('timezone', params.timezone ?? 'UTC');

    return this.cachedGet<PageviewsSeries>(
      baseUrl, shareId,
      `/websites/${websiteId}/pageviews?${qp.toString()}`,
      cacheKey
    );
  }

  async getMetrics(
    baseUrl: string,
    shareId: string,
    type: MetricType,
    params: MetricsParams = {}
  ): Promise<Cached<MetricEntry[]>> {
    const { websiteId } = await this.getShareData(baseUrl, shareId);
    const cacheKey = this.buildCacheKeyForMetrics(baseUrl, shareId, type, params);

    const cached = this.cacheManager.get(cacheKey) as MetricEntry[] | null;
    if (cached) {
      Object.defineProperty(cached, '_fromCache', { value: true, enumerable: true, writable: true });
      return cached;
    }

    const qp = new URLSearchParams({ startAt: '0', endAt: '0' });
    const { startAt, endAt } = this.resolveRange(params);
    qp.set('startAt', startAt.toString());
    qp.set('endAt', endAt.toString());
    qp.set('type', type);
    if (typeof params.limit === 'number') qp.set('limit', params.limit.toString());

    const data = await this.authedFetch<MetricEntry[]>(
      baseUrl, shareId,
      `/websites/${websiteId}/metrics?${qp.toString()}`
    );
    this.cacheManager.set(cacheKey, data);
    return data;
  }
}