interface UmamiConfig {
  shareUrl: string;
}

interface StatsQueryParams {
  path?: string;
  url?: string;
  /** 毫秒时间戳，默认 0 */
  startAt?: number;
  /** 毫秒时间戳，默认按 5 分钟对齐的当前时间 */
  endAt?: number;
}

interface StatsComparison {
  pageviews?: number;
  visitors?: number;
  visits?: number;
  bounces?: number;
  totaltime?: number;
}

interface StatsResult {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces?: number;
  totaltime?: number;
  comparison?: StatsComparison;
  _fromCache?: boolean;
}

interface ShareData {
  websiteId: string;
  token: string;
}

type MetricType =
  | 'path'
  | 'referrer'
  | 'browser'
  | 'os'
  | 'device'
  | 'country'
  | 'region'
  | 'city'
  | 'event'
  | 'title'
  | 'language'
  | 'screen'
  | 'tag';

interface MetricEntry {
  x: string;
  y: number;
}

type PageviewPoint = MetricEntry;

interface PageviewsSeries {
  pageviews: PageviewPoint[];
  sessions: PageviewPoint[];
}

interface WebsiteInfo {
  id: string;
  name: string;
  domain: string;
  shareId: string | null;
  createdAt: string;
  updatedAt: string;
  resetAt: string | null;
  userId: string;
  teamId: string | null;
  createdBy: string;
  deletedAt: string | null;
  recorderEnabled: boolean;
  replayConfig: Record<string, unknown> | null;
}

interface DateRange {
  startDate: string | null;
  endDate: string | null;
}

export type {
  UmamiConfig,
  StatsQueryParams,
  StatsResult,
  StatsComparison,
  ShareData,
  MetricType,
  MetricEntry,
  PageviewPoint,
  PageviewsSeries,
  WebsiteInfo,
  DateRange
};
