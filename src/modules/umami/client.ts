import { CacheManager } from '../../utils/umami/cache';
import { UmamiAPI } from './api';
import { parseShareUrl } from '../../utils/umami/url-parser';
import type { UmamiConfig, StatsResult, StatsQueryParams } from './types';

function extractValue(field: number | { value: number } | undefined): number {
  if (typeof field === 'number') return field;
  return field?.value ?? 0;
}

export class UmamiClient {
  private baseUrl: string;
  private shareId: string;
  private cacheManager: CacheManager;
  private api: UmamiAPI;

  constructor(config: UmamiConfig) {
    if (!config.shareUrl) {
      throw new Error('shareUrl 是必需参数');
    }

    const { apiBase, shareId } = parseShareUrl(config.shareUrl);
    this.baseUrl = apiBase;
    this.shareId = shareId;

    this.cacheManager = new CacheManager('umami', 3600000);
    this.api = new UmamiAPI(this.cacheManager);
  }

  async getPageStats(
    path: string,
    options: Partial<StatsQueryParams> = {}
  ): Promise<StatsResult> {
    const data = await this.api.getStats(this.baseUrl, this.shareId, {
      path: `eq.${path}`,
      ...options
    });

    return {
      pageviews: extractValue(data.pageviews),
      visitors: extractValue(data.visitors),
      visits: extractValue(data.visits),
      _fromCache: data._fromCache
    };
  }

  async getPageStatsByUrl(
    url: string,
    options: Partial<StatsQueryParams> = {}
  ): Promise<StatsResult> {
    const data = await this.api.getStats(this.baseUrl, this.shareId, {
      url,
      ...options
    });

    return {
      pageviews: extractValue(data.pageviews),
      visitors: extractValue(data.visitors),
      visits: extractValue(data.visits),
      _fromCache: data._fromCache
    };
  }

  async getSiteStats(options: Partial<StatsQueryParams> = {}): Promise<StatsResult> {
    const data = await this.api.getStats(this.baseUrl, this.shareId, options);

    return {
      pageviews: extractValue(data.pageviews),
      visitors: extractValue(data.visitors),
      visits: extractValue(data.visits),
      _fromCache: data._fromCache
    };
  }

  clearCache(): void {
    this.cacheManager.clear();
    this.api.clearShareCache();
  }
}

export function createUmamiClient(config: UmamiConfig): UmamiClient {
  return new UmamiClient(config);
}
