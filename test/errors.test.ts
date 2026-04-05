import { describe, it, expect } from 'vitest';
import { UmamiError, UmamiUrlError, UmamiAuthError, UmamiNetworkError } from '../src/errors';

describe('Custom Errors', () => {
  it('UmamiError should have correct properties', () => {
    const error = new UmamiError('test message', 'TEST_CODE', 500);
    expect(error.message).toBe('test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.status).toBe(500);
    expect(error.name).toBe('UmamiError');
  });

  it('UmamiUrlError should have INVALID_URL code', () => {
    const error = new UmamiUrlError('bad url');
    expect(error.code).toBe('INVALID_URL');
    expect(error.status).toBeUndefined();
    expect(error.name).toBe('UmamiUrlError');
  });

  it('UmamiAuthError should have AUTH_FAILED code', () => {
    const error = new UmamiAuthError('auth failed', 401);
    expect(error.code).toBe('AUTH_FAILED');
    expect(error.status).toBe(401);
    expect(error.name).toBe('UmamiAuthError');
  });

  it('UmamiNetworkError should have NETWORK_ERROR code', () => {
    const error = new UmamiNetworkError('network error', 503);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.status).toBe(503);
    expect(error.name).toBe('UmamiNetworkError');
  });

  it('all errors should be instances of Error', () => {
    expect(new UmamiUrlError('test')).toBeInstanceOf(Error);
    expect(new UmamiAuthError('test')).toBeInstanceOf(Error);
    expect(new UmamiNetworkError('test')).toBeInstanceOf(Error);
  });
});
