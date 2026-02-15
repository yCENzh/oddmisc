// Astro 集成配置
export interface UmamiIntegrationOptions {
  shareUrl: string;      // Umami 分享链接
  timezone?: string;     // 时区，默认 'Asia/Shanghai'
  enableCache?: boolean; // 启用缓存，默认 true
  cacheTTL?: number;     // 缓存时间，单位毫秒
}

// Astro 集成函数
export function umami(options: UmamiIntegrationOptions) {
  if (!options.shareUrl) {
    throw new Error('需要配置 shareUrl');
  }

  return {
    name: 'astro-umami-integration',
    hooks: {
      'astro:config:setup': ({ injectScript }: any) => {
        const config = {
          shareUrl: options.shareUrl,
          timezone: options.timezone || 'Asia/Shanghai',
          enableCache: options.enableCache !== false,
          cacheTTL: options.cacheTTL || 3600000
        };

        // 注入全局统计客户端
        injectScript('page', `
          import { createUmamiClient } from 'oddmisc';
          
          // 创建命名空间避免冲突
          window.oddmisc = window.oddmisc || {};
          window.oddmisc.umami = createUmamiClient(${JSON.stringify(config)});
          
          // 命名空间下的快捷方法
          window.oddmisc.getStats = (path) => window.oddmisc.umami.getPageStats(path);
          window.oddmisc.getSiteStats = () => window.oddmisc.umami.getSiteStats();
        `);
      }
    }
  };
}