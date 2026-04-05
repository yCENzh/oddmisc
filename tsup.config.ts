import { defineConfig } from 'tsup'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/astro/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: true,
    define: {
      PKG_VERSION: JSON.stringify(pkg.version)
    }
  },
  {
    entry: ['src/runtime/client.ts'],
    format: ['iife'],
    outDir: 'dist/runtime',
    globalName: '__oddmiscRuntime',
    dts: false,
    splitting: false,
    sourcemap: false,
    minify: true,
    clean: false,
    define: {
      PKG_VERSION: JSON.stringify(pkg.version)
    }
  }
])
