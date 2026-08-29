# oddmisc

杂七杂八的小工具 npm 包。当前主要提供 Umami 分享链接的统计读取能力，包括 Node / 浏览器通用的 `UmamiClient`、纯浏览器运行时，以及一个开箱即用的 Astro 集成。

[![npm version](https://img.shields.io/npm/v/oddmisc.svg)](https://www.npmjs.com/package/oddmisc)
[![License](https://img.shields.io/npm/l/oddmisc.svg)](./LICENSE)

## 特性

- **零运行时依赖**：仅依赖平台自带的 `fetch` / `URL` / `localStorage`。
- **双端通用**：同一份 API 同时可在 Node 与浏览器中使用。
- **内存 + localStorage 双级缓存**：默认 1 小时 TTL，内置 LRU 淘汰，浏览器刷新后仍然命中缓存。
- **Astro 集成**：一行配置自动向页面注入运行时客户端，并挂载到 `window.oddmisc`。
- **完整类型声明**：CJS / ESM 双格式输出，附带 `.d.ts`。

## 安装

```bash
npm install oddmisc
# 或
pnpm add oddmisc
# 或
yarn add oddmisc
```

## 快速开始

### 在 Node / 通用环境中使用

```ts
import { createUmamiClient } from 'oddmisc';

const client = createUmamiClient({
  shareUrl: 'https://your-umami-instance.com/share/<shareId>'
});

// 按路径查询页面统计
const page = await client.getPageStats('/about');
console.log(page.pageviews, page.visitors, page.visits);

// 按完整 URL 查询
const pageByUrl = await client.getPageStatsByUrl('https://site.example/about');

// 站点整体统计
const site = await client.getSiteStats();
```

所有查询都会被缓存，命中缓存时返回值上会带有 `_fromCache: true` 字段，可据此判断来源。调用 `client.clearCache()` 可清空缓存。

除了基础统计，还可以读取在线访客、时间序列、TopN 维度聚合等：

```ts
// 当前在线访客（实时，不缓存）
const live = await client.getActiveVisitors();

// 按小时聚合的 pageviews / sessions 序列
const series = await client.getPageviews({
  startAt: Date.now() - 24 * 3600_000,
  endAt: Date.now(),
  unit: 'hour',
  timezone: 'Asia/Shanghai'
});

// Top 10 路径 / 国家 / 浏览器
const topPaths = await client.getMetrics('path', { limit: 10 });
const topCountries = await client.getMetrics('country', { limit: 10 });

// 网站元信息 / 可用数据区间
const info = await client.getWebsite();
const range = await client.getDateRange();
```

### Astro 集成

推荐使用 `oddmisc()` 统一入口，通过嵌套配置管理所有模块：

```js
import { defineConfig } from 'astro/config';
import { oddmisc } from 'oddmisc/astro';

export default defineConfig({
  integrations: [
    oddmisc({
      umami: {
        shareUrl: 'https://your-umami-instance.com/share/<shareId>'
      }
    })
  ]
});
```

也可以直接使用 `umami()` 单模块入口（向下兼容）：

```js
import { umami } from 'oddmisc/astro';

export default defineConfig({
  integrations: [
    umami({
      shareUrl: 'https://your-umami-instance.com/share/<shareId>'
    })
  ]
});
```

如需临时禁用注入，将 `shareUrl` 设为 `false` 即可：

```js
oddmisc({ umami: { shareUrl: false } });
// 或
umami({ shareUrl: false });
```

集成会向每个页面注入一段自包含的运行时脚本，并在 `window` 上挂载 `oddmisc` 命名空间：

```js
// 站点级统计
const site = await window.oddmisc.getSiteStats();

// 指定页面
const about = await window.oddmisc.getPageStats('/about');

// 直接访问底层 client
const client = window.oddmisc.umami;
```

脚本初始化完成后会派发 `oddmisc-ready` 事件：

```js
window.addEventListener('oddmisc-ready', (e) => {
  e.detail.client.getSiteStats().then(console.log);
});
```

## API 参考

### `createUmamiClient(config)` / `new UmamiClient(config)`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `shareUrl` | `string` | Umami 分享链接，必填。支持自部署与 `cloud.umami.is` 形式 |

返回的 `UmamiClient` 实例提供：

| 方法 | 说明 |
| --- | --- |
| `getPageStats(path, options?)` | 按 `path` 查询（底层等价于 `path=eq.<path>`） |
| `getPageStatsByUrl(url, options?)` | 按完整 URL 查询 |
| `getSiteStats(options?)` | 站点整体统计 |
| `getActiveVisitors()` | 当前在线访客数（实时，不缓存） |
| `getPageviews({ startAt, endAt, unit, timezone }?)` | 按时间聚合的 `pageviews` / `sessions` 序列 |
| `getMetrics(type, { startAt, endAt, limit }?)` | TopN 维度聚合 |
| `getWebsite()` | 网站元信息（`name` / `domain` 等） |
| `getDateRange()` | 此分享可用的数据范围 |
| `clearCache()` | 清空内存 + localStorage 缓存，以及已缓存的 share token |

`options` 支持 `startAt` / `endAt`（毫秒时间戳），默认 `startAt=0`，`endAt` 按 5 分钟对齐的当前时间。

`getMetrics(type)` 支持的维度：`path`、`referrer`、`browser`、`os`、`device`、`country`、`region`、`city`、`event`、`title`、`language`、`screen`、`tag`。

统一的统计返回结构：

```ts
interface StatsResult {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces?: number;
  totaltime?: number;
  comparison?: {
    pageviews?: number;
    visitors?: number;
    visits?: number;
    bounces?: number;
    totaltime?: number;
  };
  _fromCache?: boolean;
}
```

### 运行时 `initUmamiRuntime(config)`

若不使用 Astro，可以自行调用 `initUmamiRuntime({ shareUrl })` 在浏览器中挂载客户端：

```ts
import { initUmamiRuntime } from 'oddmisc';
initUmamiRuntime({ shareUrl: 'https://.../share/<id>' });
```

挂载完成后会触发 `oddmisc-ready` 事件，`detail.client` 即为挂在 `window.oddmisc` 上的对象。

### 错误类型

所有错误都继承自 `UmamiError`（带 `code` 与可选 `status`）：

- `UmamiUrlError` — `code: 'INVALID_URL'`，无效分享链接。
- `UmamiAuthError` — `code: 'AUTH_FAILED'`，401，通常意味着 token 过期或失效。
- `UmamiNetworkError` — `code: 'NETWORK_ERROR'`，上游返回非预期状态码（如 shareId 不存在返回 404）。
- `UmamiTimeoutError` — `code: 'TIMEOUT'`，请求超时（默认 10s）。

### 工具类

- `parseShareUrl(shareUrl)` — 解析分享链接，返回 `{ apiBase, shareId }`。
- `CacheManager` — 通用的内存 + localStorage 双级缓存，可在其它场景复用。

## 支持的 Umami URL 格式

- `https://umami.example.com/share/<shareId>`
- `https://cloud.umami.is/analytics/us/share/<shareId>`
- `https://umami.example.com/analytics/share/<shareId>`

## 浏览器兼容性

现代浏览器（Chrome 60+、Firefox 60+、Safari 12+）；需要 `fetch`、`URL`、`AbortController`、`localStorage`。

## 开发

```bash
pnpm install
pnpm build           # 使用 tsup 构建 dist/
pnpm test            # 运行 vitest 单元测试
pnpm test:coverage   # 生成覆盖率报告
```

## License

MIT © yCENzh
