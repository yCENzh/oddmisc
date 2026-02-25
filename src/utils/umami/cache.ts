const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

export class CacheManager<T = any> {
  private memoryCache = new Map<string, { value: T; timestamp: number }>();
  private readonly CACHE_KEY: string;
  private readonly DEFAULT_TTL: number;

  constructor(namespace = 'default', ttl = 3600000) {
    this.CACHE_KEY = `cache-${namespace}`;
    this.DEFAULT_TTL = ttl;
  }

  private isExpired(timestamp: number): boolean {
    return Date.now() - timestamp >= this.DEFAULT_TTL;
  }

  get(key: string): T | null {
    const memCached = this.memoryCache.get(key);
    if (memCached && !this.isExpired(memCached.timestamp)) {
      return memCached.value;
    }
    if (memCached) {
      this.memoryCache.delete(key);
    }

    if (isBrowser) {
      try {
        const cached = localStorage.getItem(this.CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const cachedData = parsed[key];
          if (cachedData && !this.isExpired(cachedData.timestamp)) {
            this.memoryCache.set(key, cachedData);
            return cachedData.value;
          }
        }
      } catch {}
    }

    return null;
  }

  set(key: string, value: T): void {
    const timestamp = Date.now();
    this.memoryCache.set(key, { value, timestamp });

    if (isBrowser) {
      try {
        const cached = localStorage.getItem(this.CACHE_KEY);
        const cacheObj = cached ? JSON.parse(cached) : {};
        cacheObj[key] = { timestamp, value };
        localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheObj));
      } catch {}
    }
  }

  clear(): void {
    this.memoryCache.clear();
    if (isBrowser) {
      try {
        localStorage.removeItem(this.CACHE_KEY);
      } catch {}
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
      } catch {}
    }
  }
}