import { defineConfig } from 'tsup'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))

export default defineConfig([
  // 主库构建 (ESM + CJS)
  {
    entry: ['src/index.ts'],
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
  // 运行时客户端构建 (IIFE - 可直接在浏览器运行)
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
