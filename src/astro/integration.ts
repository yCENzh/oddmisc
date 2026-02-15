import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Astro 集成配置
export interface UmamiIntegrationOptions {
  shareUrl: string;  // Umami 分享链接
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
        // 读取运行时代码
        let runtimeCode = '';
        try {
          const __dirname = dirname(fileURLToPath(import.meta.url));
          const runtimePath = join(__dirname, './runtime/client.global.js');
          runtimeCode = readFileSync(runtimePath, 'utf-8');
        } catch {
          console.warn('[oddmisc] 无法读取运行时文件，使用备用方案');
        }

        // 注入运行时 + 初始化配置
        const initCode = `
// oddmisc Umami Runtime
${runtimeCode}

// 初始化
if (typeof window !== 'undefined') {
  __oddmiscRuntime.initUmamiRuntime(${JSON.stringify({ shareUrl: options.shareUrl })});
}
`;

        injectScript('page', initCode);
      }
    }
  };
}