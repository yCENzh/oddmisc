import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export interface UmamiIntegrationOptions {
  shareUrl: string | false;  // 设为 false 则跳过
}

export function umami(options: UmamiIntegrationOptions) {
  // shareUrl 为 false 时跳过
  if (!options.shareUrl) {
    return {
      name: 'oddmisc-umami-integration',
      hooks: {}
    };
  }

  return {
    name: 'oddmisc-umami-integration',
    hooks: {
      'astro:config:setup': ({ injectScript }: any) => {
        let runtimeCode = '';
        try {
          const __dirname = dirname(fileURLToPath(import.meta.url));
          const runtimePath = join(__dirname, './runtime/client.global.js');
          runtimeCode = readFileSync(runtimePath, 'utf-8');
        } catch {
          console.warn('[oddmisc] 无法读取运行时文件，使用备用方案');
        }

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