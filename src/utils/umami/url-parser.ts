/**
 * 从分享 URL 中提取 apiBase 和 shareId
 * 支持多种 Umami 实例格式：
 * - https://umami.example.com/share/abc123 → apiBase: https://umami.example.com/api
 * - https://cloud.umami.is/analytics/us/share/abc123 → apiBase: https://cloud.umami.is/analytics/us/api
 */
export function parseShareUrl(shareUrl: string): { apiBase: string; shareId: string } {
  try {
    const url = new URL(shareUrl);
    
    // 提取 shareId（/share/ 后面的部分）
    const pathParts = url.pathname.split('/');
    const shareIndex = pathParts.indexOf('share');
    
    if (shareIndex === -1 || shareIndex === pathParts.length - 1) {
      throw new Error('无效的分享 URL：未找到 share 路径');
    }
    
    const shareId = pathParts[shareIndex + 1];
    
    if (!shareId || shareId.length < 10) {
      throw new Error('无效的分享 ID');
    }
    
    // 构造 apiBase：去掉 /share/{shareId}，加上 /api
    // 例如: /analytics/us/share/abc123 → /analytics/us/api
    const pathBeforeShare = pathParts.slice(0, shareIndex).join('/');
    const apiPath = pathBeforeShare + '/api';
    const apiBase = `${url.protocol}//${url.host}${apiPath}`;
    
    return { apiBase, shareId };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`URL 解析失败: ${error.message}`);
    }
    throw new Error('URL 解析失败: 无效的 URL 格式');
  }
}

/**
 * 验证分享 URL 格式
 */
export function isValidShareUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.includes('/share/');
  } catch {
    return false;
  }
}