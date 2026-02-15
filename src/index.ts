// 核心导出
export { VERSION, DEFAULT_CONFIG, isValidConfig, UmamiError } from './shared';

// Umami 模块
export { UmamiClient, createUmamiClient } from './modules/umami/client';
export type { UmamiConfig, StatsResult, StatsQueryParams } from './modules/umami/types';

// 工具函数
export { CacheManager } from './utils/umami/cache';
export { parseShareUrl, isValidShareUrl } from './utils/umami/url-parser';

// Astro 集成
export { umami } from './astro';
export type { UmamiIntegrationOptions } from './astro';

// 运行时客户端（用于手动初始化）
export { initUmamiRuntime } from './runtime/client';
export type { UmamiRuntimeConfig as RuntimeConfig, StatsResult as RuntimeStatsResult } from './runtime/client';