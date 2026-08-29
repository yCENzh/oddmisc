/**
 * 运行时共享工具函数（IIFE 打包时会内联，无外部依赖）。
 */

export const DEFAULT_TIMEOUT = 10000;
export const SHARE_CONTEXT_HEADER = 'x-umami-share-context';
export const SHARE_CONTEXT_VALUE = '1';
export const DEFAULT_CACHE_TTL = 3600000;
export const DEFAULT_CACHE_MAX = 100;
export const RANGE_ALIGN_MS = 5 * 60_000;

export async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeout = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`[oddmisc] 请求超时 (${timeout}ms): ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function extract(field: unknown): number {
  if (typeof field === 'number') return field;
  if (field && typeof (field as { value?: unknown }).value === 'number') {
    return (field as { value: number }).value;
  }
  return 0;
}

export function parseShareUrl(shareUrl: string): { apiBase: string; shareId: string } {
  const url = new URL(shareUrl);
  const pathParts = url.pathname.split('/');
  const shareIndex = pathParts.indexOf('share');
  if (shareIndex === -1 || shareIndex === pathParts.length - 1) {
    throw new Error('无效的分享 URL：未找到 share 路径');
  }
  const shareId = pathParts[shareIndex + 1];
  if (!shareId) throw new Error('无效的分享 URL：缺少分享 ID');
  const pathBeforeShare = pathParts.slice(0, shareIndex).join('/');
  return { apiBase: `${url.protocol}//${url.host}${pathBeforeShare}/api`, shareId };
}

export function alignedNow(): number {
  return Math.floor(Date.now() / RANGE_ALIGN_MS) * RANGE_ALIGN_MS;
}

export function buildCacheKey(prefix: string, params: Record<string, string>): string {
  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${prefix}-${sortedParams}`;
}

export function extractPathFromUrl(url: string): string | null {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return null;
  }
}