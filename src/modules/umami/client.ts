import { CacheManager } from '../../utils/umami/cache';
import { UmamiAPI, type PageviewsParams, type MetricsParams, type StatsAPIResponse } from './api';
import { parseShareUrl } from '../../utils/umami/url-parser';
import { UmamiUrlError } from '../../errors';
import type {
  UmamiConfig,
  StatsResult,
  StatsQueryParams,
  MetricType,
  MetricEntry,
  PageviewsSeries,
  WebsiteInfo,
  DateRange
} from './types';

function extractValue(field: number | { value: number } | undefined): number {
  if (typeof field === 'number') return field;
  return field?.value ?? 0;
}

function toStatsResult(data: StatsAPIResponse): StatsResult {
  const result: StatsResult = {
    pageviews: extractValue(data.pageviews),
    visitors: extractValue(data.visitors),
    visits: extractValue(data.visits),
    _fromCache: data._fromCache
  };
  if (data.bounces !== undefined) result.bounces = extractValue(data.bounces);
  if (data.totaltime !== undefined) result.totaltime = extractValue(data.totaltime);
  if (data.comparison) result.comparison = data.comparison;
  return result;
}

export class UmamiClient {
  private baseUrl: string;
  private shareId: string;
  private cacheManager: CacheManager;
  private api: UmamiAPI;

  constructor(config: UmamiConfig) {
    if (!config.shareUrl) {
      throw new UmamiUrlError('shareUrl 是必需参数');
    }

    const { apiBase, shareId } = parseShareUrl(config.shareUrl);
    this.baseUrl = apiBase;
    this.shareId = shareId;

    this.cacheManager = new CacheManager('umami', 3600000);
    this.api = new UmamiAPI(this.cacheManager);
  }

  async getPageStats(path: string, options: Partial<StatsQueryParams> = {}): Promise<StatsResult> {
    const data = await this.api.getStats(this.baseUrl, this.shareId, {
      path: `eq.${path}`,
      ...options
    });
    return toStatsResult(data);
  }

  async getPageStatsByUrl(url: string, options: Partial<StatsQueryParams> = {}): Promise<StatsResult> {
    const data = await this.api.getStats(this.baseUrl, this.shareId, { url, ...options });
    return toStatsResult(data);
  }

  async getSiteStats(options: Partial<StatsQueryParams> = {}): Promise<StatsResult> {
    const data = await this.api.getStats(this.baseUrl, this.shareId, options);
    return toStatsResult(data);
  }

  async getActiveVisitors(): Promise<number> {
    const data = await this.api.getActiveVisitors(this.baseUrl, this.shareId);
    return data.visitors ?? 0;
  }

  async getPageviews(options: PageviewsParams = {}): Promise<PageviewsSeries> {
    const data = await this.api.getPageviews(this.baseUrl, this.shareId, options);
    return { pageviews: data.pageviews ?? [], sessions: data.sessions ?? [] };
  }

  getMetrics(type: MetricType, options: MetricsParams = {}): Promise<MetricEntry[]> {
    return this.api.getMetrics(this.baseUrl, this.shareId, type, options);
  }

  getWebsite(): Promise<WebsiteInfo> {
    return this.api.getWebsite(this.baseUrl, this.shareId);
  }

  getDateRange(): Promise<DateRange> {
    return this.api.getDateRange(this.baseUrl, this.shareId);
  }

  clearCache(): void {
    this.cacheManager.clear();
    this.api.clearShareCache(this.shareId);
  }
}

export function createUmamiClient(config: UmamiConfig): UmamiClient {
  return new UmamiClient(config);
}
