export interface UmamiConfig {
  /** 分享 URL，如: https://umami.example.com/share/abc123 */
  shareUrl: string;
  /** 时区，默认 'Asia/Shanghai' */
  timezone?: string;
  /** 是否启用缓存，默认 true */
  enableCache?: boolean;
  /** 缓存过期时间(毫秒)，默认 1小时 */
  cacheTTL?: number;
  // 自动提取的参数（内部使用）
  baseUrl?: string;
  shareId?: string;
}

export interface StatsQueryParams {
  path?: string;
  url?: string;
  startAt?: number;
  endAt?: number;
  unit?: 'hour' | 'day' | 'month' | 'year';
  timezone?: string;
  compare?: boolean;
}

export interface StatsResult {
  pageviews: number;
  visitors: number;
  _fromCache?: boolean;
}

export interface ShareData {
  websiteId: string;
  token: string;
}