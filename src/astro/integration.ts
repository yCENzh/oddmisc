import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
    throw new Error('[oddmisc] 需要配置 shareUrl');
  }

  return {
    name: 'oddmisc-umami-integration',
    hooks: {
      'astro:config:setup': ({ injectScript }: any) => {
        const config = {
          shareUrl: options.shareUrl,
          timezone: options.timezone || 'Asia/Shanghai',
          enableCache: options.enableCache !== false,
          cacheTTL: options.cacheTTL || 3600000
        };

        // 读取运行时代码
        let runtimeCode = '';
        try {
          const __dirname = dirname(fileURLToPath(import.meta.url));
          const runtimePath = join(__dirname, './runtime/client.global.js');
          runtimeCode = readFileSync(runtimePath, 'utf-8');
        } catch {
          // 如果读取失败，使用内联代码
          console.warn('[oddmisc] 无法读取运行时文件，使用备用方案');
        }

        // 注入运行时 + 初始化配置
        const initCode = `
// oddmisc Umami Runtime
${runtimeCode}

// 初始化
if (typeof window !== 'undefined') {
  __oddmiscRuntime.initUmamiRuntime(${JSON.stringify(config)});
}
`;

        injectScript('page', initCode);
      }
    }
  };
}