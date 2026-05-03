const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

export class CacheManager<T = unknown> {
  private memoryCache = new Map<string, { value: T; timestamp: number }>();
  private readonly cacheKey: string;
  private readonly ttl: number;
  private storageCache: Record<string, { value: T; timestamp: number }> | null = null;

  constructor(namespace = 'default', ttl = 3600000) {
    this.cacheKey = `cache-${namespace}`;
    this.ttl = ttl;
  }

  private loadStorage(): Record<string, { value: T; timestamp: number }> {
    if (this.storageCache !== null) {
      return this.storageCache;
    }
    if (!isBrowser) {
      this.storageCache = {};
    } else {
      try {
        const cached = localStorage.getItem(this.cacheKey);
        this.storageCache = cached ? JSON.parse(cached) : {};
      } catch {
        this.storageCache = {};
      }
    }
    return this.storageCache!;
  }

  private saveStorage(): void {
    if (!isBrowser || this.storageCache === null) return;
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(this.storageCache));
    } catch {}
  }

  private isExpired(timestamp: number): boolean {
    return Date.now() - timestamp >= this.ttl;
  }

  get(key: string): T | null {
    const memCached = this.memoryCache.get(key);
    if (memCached && !this.isExpired(memCached.timestamp)) {
      return memCached.value;
    }
    if (memCached) {
      this.memoryCache.delete(key);
    }

    const storage = this.loadStorage();
    const stored = storage[key];
    if (stored && !this.isExpired(stored.timestamp)) {
      this.memoryCache.set(key, stored);
      return stored.value;
    }
    if (stored) {
      delete storage[key];
      this.saveStorage();
    }

    return null;
  }

  set(key: string, value: T): void {
    const timestamp = Date.now();
    const entry = { value, timestamp };
    this.memoryCache.set(key, entry);

    const storage = this.loadStorage();
    storage[key] = entry;
    this.saveStorage();
  }

  clear(): void {
    this.memoryCache.clear();
    this.storageCache = null;
    if (isBrowser) {
      try {
        localStorage.removeItem(this.cacheKey);
      } catch {}
    }
  }

  delete(key: string): void {
    this.memoryCache.delete(key);
    const storage = this.loadStorage();
    if (key in storage) {
      delete storage[key];
      this.saveStorage();
    }
  }
}
