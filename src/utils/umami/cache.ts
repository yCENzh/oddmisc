// 检测是否在浏览器环境
const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

// 通用缓存管理器
export class CacheManager<T = any> {
  private memoryCache = new Map<string, T>();
  private readonly CACHE_KEY: string;
  private readonly DEFAULT_TTL: number;

  constructor(namespace = 'default', ttl = 3600000) {
    this.CACHE_KEY = `cache-${namespace}`;
    this.DEFAULT_TTL = ttl;
  }

  get(key: string): T | null {
    // 内存缓存（SSR 和浏览器都可用）
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key)!;
    }
    
    // localStorage 缓存（仅浏览器环境）
    if (isBrowser) {
      try {
        const cached = localStorage.getItem(this.CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const cachedData = parsed[key];
          if (cachedData && Date.now() - cachedData.timestamp < this.DEFAULT_TTL) {
            // 命中 localStorage 缓存时，同步到内存缓存
            this.memoryCache.set(key, cachedData.value);
            return cachedData.value;
          }
        }
      } catch {
        // localStorage 访问失败时忽略
      }
    }
    
    return null;
  }

  set(key: string, value: T): void {
    // 内存缓存（SSR 和浏览器都可用）
    this.memoryCache.set(key, value);
    
    // localStorage 缓存（仅浏览器环境）
    if (isBrowser) {
      try {
        const cached = localStorage.getItem(this.CACHE_KEY);
        const cacheObj = cached ? JSON.parse(cached) : {};
        
        cacheObj[key] = {
          timestamp: Date.now(),
          value: value
        };
        
        localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheObj));
      } catch {
        // localStorage 访问失败时忽略
      }
    }
  }

  clear(): void {
    this.memoryCache.clear();
    if (isBrowser) {
      try {
        localStorage.removeItem(this.CACHE_KEY);
      } catch {
        // localStorage 访问失败时忽略
      }
    }
  }

  delete(key: string): void {
    this.memoryCache.delete(key);
    if (isBrowser) {
      try {
        const cached = localStorage.getItem(this.CACHE_KEY);
        if (cached) {
          const cacheObj = JSON.parse(cached);
          delete cacheObj[key];
          localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheObj));
        }
      } catch {
        // localStorage 访问失败时忽略
      }
    }
  }
}