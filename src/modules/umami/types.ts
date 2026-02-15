export interface UmamiConfig {
  /** 分享 URL，如: https://umami.example.com/share/abc123 */
  shareUrl: string;
  // 自动提取的参数（内部使用）
  baseUrl?: string;
  shareId?: string;
}

export interface StatsQueryParams {
  path?: string;
  url?: string;
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