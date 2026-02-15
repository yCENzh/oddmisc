import { CacheManager } from '../../utils/umami/cache';
import { UmamiAPI } from './api';
import { parseShareUrl } from '../../utils/umami/url-parser';
import type { UmamiConfig, StatsResult, StatsQueryParams } from './types';

export class UmamiClient {
  private config: UmamiConfig;
  private cacheManager: CacheManager;
  private api: UmamiAPI;

  constructor(config: UmamiConfig) {
    // 验证必需参数
    if (!config.shareUrl) {
      throw new Error('shareUrl 是必需参数');
    }
    
    // 自动解析 shareUrl
    const { baseUrl, shareId } = parseShareUrl(config.shareUrl);
    
    this.config = {
      timezone: 'Asia/Shanghai',
      enableCache: true,
      cacheTTL: 3600000,
      baseUrl,
      shareId,
      ...config
    };
    
    this.cacheManager = new CacheManager('umami', this.config.cacheTTL);
    this.api = new UmamiAPI(this.cacheManager);
  }

  async getPageStats(
    path: string, 
    options: Partial<StatsQueryParams> = {}
  ): Promise<StatsResult> {
    if (!this.config.baseUrl || !this.config.shareId) {
      throw new Error('客户端未正确初始化');
    }
    
    const data = await this.api.getStats(this.config.baseUrl, this.config.shareId, {
      path: `eq.${path}`,
      timezone: this.config.timezone,
      ...options
    });
    
    return {
      pageviews: (data.pageviews?.value) || data.pageviews || 0,
      visitors: (data.visitors?.value) || data.visitors || 0,
      _fromCache: data._fromCache
    };
  }

  async getPageStatsByUrl(
    url: string,
    options: Partial<StatsQueryParams> = {}
  ): Promise<StatsResult> {
    if (!this.config.baseUrl || !this.config.shareId) {
      throw new Error('客户端未正确初始化');
    }
    
    const data = await this.api.getStats(this.config.baseUrl, this.config.shareId, {
      url: url,
      timezone: this.config.timezone,
      ...options
    });
    
    return {
      pageviews: (data.pageviews?.value) || data.pageviews || 0,
      visitors: (data.visitors?.value) || data.visitors || 0,
      _fromCache: data._fromCache
    };
  }

  async getSiteStats(options: Partial<StatsQueryParams> = {}): Promise<StatsResult> {
    if (!this.config.baseUrl || !this.config.shareId) {
      throw new Error('客户端未正确初始化');
    }
    
    const data = await this.api.getStats(this.config.baseUrl, this.config.shareId, {
      timezone: this.config.timezone,
      ...options
    });
    
    return {
      pageviews: data.pageviews || 0,
      visitors: data.visitors || 0,
      _fromCache: data._fromCache
    };
  }

  clearCache(): void {
    this.cacheManager.clear();
    this.api.clearShareCache();
  }

  getConfig(): Readonly<UmamiConfig> {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<UmamiConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

export function createUmamiClient(config: UmamiConfig): UmamiClient {
  return new UmamiClient(config);
}