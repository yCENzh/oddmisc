import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { AstroIntegration, HookParameters } from 'astro';

export interface UmamiIntegrationOptions {
  shareUrl: string | false;
  /** @default 'head-inline' - 'head-inline'=全站单次注入到head(推荐), 'page'=每页注入 */
  inject?: 'head-inline' | 'page';
}

export interface OddmiscIntegrationOptions {
  umami?: UmamiIntegrationOptions;
}

type AstroConfigSetupParams = HookParameters<'astro:config:setup'>;

function getRuntimePath(): string {
  try {
    // 使用 import.meta.resolve 正确解析包内路径（Vite/Rollup 支持）
    const resolved = import.meta.resolve('../runtime/client.global.js');
    return fileURLToPath(resolved);
  } catch {
    // 降级：开发环境或打包时相对路径
    const __dirname = dirname(fileURLToPath(import.meta.url));
    return join(__dirname, '../runtime/client.global.js');
  }
}

function injectUmamiRuntime(shareUrl: string | false): string | undefined {
  if (!shareUrl) return;

  let runtimeCode = '';
  try {
    const runtimePath = getRuntimePath();
    runtimeCode = readFileSync(runtimePath, 'utf-8');
  } catch {
    console.warn('[oddmisc] 无法读取运行时文件，已跳过客户端注入');
    return;
  }

  return `
// oddmisc Umami Runtime
${runtimeCode}

if (typeof window !== 'undefined' && typeof __oddmiscRuntime !== 'undefined') {
  __oddmiscRuntime.initUmamiRuntime(${JSON.stringify({ shareUrl })});
}
`;
}

export function umami(options: UmamiIntegrationOptions): AstroIntegration {
  const injectMode = options.inject ?? 'head-inline';
  return {
    name: 'oddmisc-umami-integration',
    hooks: {
      'astro:config:setup': ({ injectScript, addWatchFile }: AstroConfigSetupParams) => {
        const code = injectUmamiRuntime(options.shareUrl);
        if (!code) return;

        if (injectMode === 'head-inline') {
          injectScript('head-inline', code);
        } else {
          injectScript('page', code);
        }

        const runtimePath = getRuntimePath();
        addWatchFile(runtimePath);
      },
    },
  };
}

export function oddmisc(options: OddmiscIntegrationOptions = {}): AstroIntegration {
  return {
    name: 'oddmisc-integration',
    hooks: {
      'astro:config:setup': ({ injectScript, addWatchFile }: AstroConfigSetupParams) => {
        if (!options.umami) return;

        const code = injectUmamiRuntime(options.umami.shareUrl);
        if (!code) return;

        const injectMode = options.umami.inject ?? 'head-inline';
        if (injectMode === 'head-inline') {
          injectScript('head-inline', code);
        } else {
          injectScript('page', code);
        }

        const runtimePath = getRuntimePath();
        addWatchFile(runtimePath);
      },
    },
  };
}