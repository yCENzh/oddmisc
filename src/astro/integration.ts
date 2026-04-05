import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { AstroIntegration, HookParameters } from 'astro';

export interface UmamiIntegrationOptions {
  /** 设为 false 则跳过集成 */
  shareUrl: string | false;
}

export interface OddmiscIntegrationOptions {
  umami?: UmamiIntegrationOptions;
}

type AstroConfigSetupParams = HookParameters<'astro:config:setup'>;

function injectUmamiRuntime(shareUrl: string | false) {
  if (!shareUrl) return;

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
  __oddmiscRuntime.initUmamiRuntime(${JSON.stringify({ shareUrl })});
}
`;

  return initCode;
}

export function umami(options: UmamiIntegrationOptions): AstroIntegration {
  return {
    name: 'oddmisc-umami-integration',
    hooks: {
      'astro:config:setup': ({ injectScript }: AstroConfigSetupParams) => {
        const code = injectUmamiRuntime(options.shareUrl);
        if (code) injectScript('page', code);
      }
    }
  };
}

export function oddmisc(options: OddmiscIntegrationOptions = {}): AstroIntegration {
  return {
    name: 'oddmisc-integration',
    hooks: {
      'astro:config:setup': ({ injectScript }: AstroConfigSetupParams) => {
        if (options.umami) {
          const code = injectUmamiRuntime(options.umami.shareUrl);
          if (code) injectScript('page', code);
        }
      }
    }
  };
}
