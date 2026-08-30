import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
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

let resolvedRuntimePath: string | null = null;

function getRuntimePath(): string {
  if (resolvedRuntimePath) return resolvedRuntimePath;

  // Astro/Vite 环境标准方式
  const resolved = import.meta.resolve('../runtime/client.global.js');
  resolvedRuntimePath = fileURLToPath(resolved);
  return resolvedRuntimePath;
}

function injectUmamiRuntime(shareUrl: string | false): string | undefined {
  if (!shareUrl) return;

  const runtimeCode = readFileSync(getRuntimePath(), 'utf-8');

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

        addWatchFile(getRuntimePath());
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

        addWatchFile(getRuntimePath());
      },
    },
  };
}