interface UmamiConfig {
  /** 如: https://umami.example.com/share/abc123 */
  shareUrl: string;
  baseUrl?: string;
  shareId?: string;
}

interface StatsQueryParams {
  path?: string;
  url?: string;
}

interface StatsResult {
  pageviews: number;
  visitors: number;
  _fromCache?: boolean;
}

interface ShareData {
  websiteId: string;
  token: string;
}

export type { UmamiConfig, StatsQueryParams, StatsResult, ShareData };