import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager } from '../src/utils/umami/cache';

describe('CacheManager TTL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires values after the configured TTL', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const cache = new CacheManager('ttl-test', 1000);
    cache.clear();

    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');

    vi.setSystemTime(new Date('2024-01-01T00:00:02Z'));
    expect(cache.get('k')).toBeNull();
  });

  it('keeps values while within the TTL window', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const cache = new CacheManager('ttl-test-2', 5000);
    cache.clear();

    cache.set('k', { n: 1 });
    vi.setSystemTime(new Date('2024-01-01T00:00:03Z'));
    expect(cache.get('k')).toEqual({ n: 1 });
  });
});
