interface UmamiConfig {
  /** 如: https://umami.example.com/share/abc123 */
  shareUrl: string;
}

interface StatsQueryParams {
  path?: string;
  url?: string;
}

interface StatsResult {
  pageviews: number;
  visitors: number;
  visits?: number;
  _fromCache?: boolean;
}

interface ShareData {
  websiteId: string;
  token: string;
}

export type { UmamiConfig, StatsQueryParams, StatsResult, ShareData };
