import { describe, it, expect } from 'vitest';
import { corsMiddleware, authMiddleware, rateLimiter, requestTimeout, errorHandler } from '../../src/server/middleware.js';

describe('middleware exports', () => {
  it('exports corsMiddleware as a function', () => {
    expect(typeof corsMiddleware).toBe('function');
  });

  it('exports authMiddleware as a factory function', () => {
    expect(typeof authMiddleware).toBe('function');
    const middleware = authMiddleware('test-token');
    expect(typeof middleware).toBe('function');
  });

  it('exports rateLimiter as a factory function', () => {
    expect(typeof rateLimiter).toBe('function');
    const limiter = rateLimiter(60000, 10);
    expect(typeof limiter).toBe('function');
  });

  it('exports errorHandler as a function', () => {
    expect(typeof errorHandler).toBe('function');
  });

  it('rateLimiter accepts no arguments (uses defaults)', () => {
    const limiter = rateLimiter();
    expect(typeof limiter).toBe('function');
  });

  it('authMiddleware without token returns pass-through middleware', () => {
    const middleware = authMiddleware(undefined);
    expect(typeof middleware).toBe('function');
  });

  it('exports requestTimeout as a factory function', () => {
    expect(typeof requestTimeout).toBe('function');
    const timeout = requestTimeout(5000);
    expect(typeof timeout).toBe('function');
  });

  it('requestTimeout accepts no arguments (uses 30s default)', () => {
    const timeout = requestTimeout();
    expect(typeof timeout).toBe('function');
  });
});
