import { describe, it, expect, beforeEach } from 'vitest';
import { CacheManager } from '../src/utils/umami/cache';

describe('CacheManager', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager('test', 3600000);
    cache.clear();
  });

  it('should set and get a value', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return null for non-existent key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should delete a key', () => {
    cache.set('key1', 'value1');
    cache.delete('key1');
    expect(cache.get('key1')).toBeNull();
  });

  it('should clear all keys', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBeNull();
  });

  it('should return cached value from memory on subsequent calls', () => {
    cache.set('key1', { nested: true });
    const result = cache.get('key1');
    expect(result).toEqual({ nested: true });
  });
});
