import { describe, it, expect } from 'vitest';
import { parseShareUrl } from '../src/utils/umami/url-parser';
import { UmamiUrlError } from '../src/errors';

describe('parseShareUrl', () => {
  it('should parse standard umami share URL', () => {
    const result = parseShareUrl('https://umami.example.com/share/abc123def456');
    expect(result.apiBase).toBe('https://umami.example.com/api');
    expect(result.shareId).toBe('abc123def456');
  });

  it('should parse cloud.umami.is URL', () => {
    const result = parseShareUrl('https://cloud.umami.is/analytics/us/share/xyz789abc012');
    expect(result.apiBase).toBe('https://cloud.umami.is/analytics/us/api');
    expect(result.shareId).toBe('xyz789abc012');
  });

  it('should throw UmamiUrlError for invalid URL', () => {
    expect(() => parseShareUrl('not-a-url')).toThrow(UmamiUrlError);
  });

  it('should throw UmamiUrlError for URL without share path', () => {
    expect(() => parseShareUrl('https://umami.example.com/dashboard')).toThrow(UmamiUrlError);
  });

  it('should throw UmamiUrlError for URL with empty share ID', () => {
    expect(() => parseShareUrl('https://umami.example.com/share/')).toThrow(UmamiUrlError);
  });
});
