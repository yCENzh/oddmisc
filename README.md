# oddmisc

杂七杂八奇怪小工具 npm 包

[![npm version](https://img.shields.io/npm/v/oddmisc.svg)](https://www.npmjs.com/package/oddmisc)
[![License](https://img.shields.io/npm/l/oddmisc.svg)](https://github.com/yCENzh/oddmisc/blob/main/LICENSE)

## 安装

```bash
npm install oddmisc
# 或
pnpm add oddmisc
# 或
yarn add oddmisc
```

## 快速开始

### 基本使用

```javascript
import { createUmamiClient } from 'oddmisc';

// 创建客户端
const client = createUmamiClient({
  shareUrl: 'https://your-umami-instance.com/share/your-share-id'
});

// 获取页面访问统计
const stats = await client.getPageStats('/about');
console.log(`页面浏览量: ${stats.pageviews}, 访客数: ${stats.visitors}`);

// 获取网站整体统计
const siteStats = await client.getSiteStats();
console.log(`总浏览量: ${siteStats.pageviews}, 总访客数: ${siteStats.visitors}`);
```

### Astro 集成

在 `astro.config.mjs` 中配置：

```javascript
import { defineConfig } from 'astro/config';
import { umami } from 'oddmisc';

export default defineConfig({
  integrations: [
    umami({
      shareUrl: 'https://your-umami-instance.com/share/your-share-id',
      timezone: 'Asia/Shanghai',
      enableCache: true,
      cacheTTL: 3600000 // 1小时
    })
  ]
});
```

然后在前端代码中使用：

```javascript
// 全局可用
const stats = await window.oddmisc.getStats('/some-page');
const siteStats = await window.oddmisc.getSiteStats();
```

## API 参考

### UmamiClient

#### 构造函数
```javascript
const client = createUmamiClient(config);
```

#### 配置选项
```javascript
const config = {
  shareUrl: 'https://umami.example.com/share/abc123', // 必需
  timezone: 'Asia/Shanghai',  // 可选，默认 'Asia/Shanghai'
  enableCache: true,          // 可选，默认 true
  cacheTTL: 3600000           // 可选，默认 1小时(毫秒)
};
```

#### 方法

- `getPageStats(path, options)` - 获取指定页面统计
- `getPageStatsByUrl(url, options)` - 通过 URL 获取页面统计
- `getSiteStats(options)` - 获取网站整体统计
- `clearCache()` - 清除缓存
- `getConfig()` - 获取当前配置
- `updateConfig(newConfig)` - 更新配置

### Astro 集成

```javascript
umami(options: UmamiIntegrationOptions)
```

选项：
```javascript
interface UmamiIntegrationOptions {
  shareUrl: string;      // Umami 分享链接
  timezone?: string;     // 时区，默认 'Asia/Shanghai'
  enableCache?: boolean; // 启用缓存，默认 true
  cacheTTL?: number;     // 缓存时间，单位毫秒
}
```

## 支持的 Umami URL 格式

- `https://umami.example.com/share/abc123`
- `https://cloud.umami.is/analytics/us/share/abc123`
- `https://umami.example.com/analytics/share/abc123`

## 浏览器兼容性

- 现代浏览器（Chrome 60+, Firefox 60+, Safari 12+）
- 支持 localStorage 的环境

## License

MIT © yCENzh

## 贡献

欢迎提交 Issue 和 Pull Request！

## 相关链接

- [Umami 官网](https://umami.is/)
- [GitHub 仓库](https://github.com/yCENzh/oddmisc)