import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

interface UmamiIntegrationOptions {
  /** 设为 false 则跳过集成 */
  shareUrl: string | false;
}

export function umami(options: UmamiIntegrationOptions) {
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

if (typeof window !== 'undefined') {
  __oddmiscRuntime.initUmamiRuntime(${JSON.stringify({ shareUrl: options.shareUrl })});
}
`;

        injectScript('page', initCode);
      }
    }
  };
}

export type { UmamiIntegrationOptions };