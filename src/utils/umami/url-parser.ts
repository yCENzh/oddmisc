/**
 * 解析 Umami 分享 URL
 * 支持标准格式和 cloud.umami.is 格式
 */
export function parseShareUrl(shareUrl: string): { apiBase: string; shareId: string } {
  try {
    const url = new URL(shareUrl);

    const pathParts = url.pathname.split('/');
    const shareIndex = pathParts.indexOf('share');

    if (shareIndex === -1 || shareIndex === pathParts.length - 1) {
      throw new Error('无效的分享 URL：未找到 share 路径');
    }

    const shareId = pathParts[shareIndex + 1];

    if (!shareId || shareId.length < 10) {
      throw new Error('无效的分享 ID');
    }

    const pathBeforeShare = pathParts.slice(0, shareIndex).join('/');
    const apiBase = `${url.protocol}//${url.host}${pathBeforeShare}/api`;

    return { apiBase, shareId };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`URL 解析失败: ${error.message}`);
    }
    throw new Error('URL 解析失败: 无效的 URL 格式');
  }
}
