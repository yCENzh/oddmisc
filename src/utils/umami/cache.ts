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
    // 内存缓存
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key)!;
    }
    
    // localStorage 缓存
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const cachedData = parsed[key];
        if (cachedData && Date.now() - cachedData.timestamp < this.DEFAULT_TTL) {
          return cachedData.value;
        }
      }
    } catch {
      // ignore
    }
    
    return null;
  }

  set(key: string, value: T): void {
    // 内存缓存
    this.memoryCache.set(key, value);
    
    // localStorage 缓存
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      const cacheObj = cached ? JSON.parse(cached) : {};
      
      cacheObj[key] = {
        timestamp: Date.now(),
        value: value
      };
      
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheObj));
    } catch {
      // ignore
    }
  }

  clear(): void {
    this.memoryCache.clear();
    try {
      localStorage.removeItem(this.CACHE_KEY);
    } catch {
      // ignore
    }
  }

  delete(key: string): void {
    this.memoryCache.delete(key);
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        const cacheObj = JSON.parse(cached);
        delete cacheObj[key];
        localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheObj));
      }
    } catch {
      // ignore
    }
  }
}