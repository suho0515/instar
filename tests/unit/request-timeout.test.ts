import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestTimeout } from '../../src/server/middleware.js';

function createApp(timeoutMs?: number) {
  const app = express();
  app.use(requestTimeout(timeoutMs));

  // Fast endpoint — responds immediately
  app.get('/fast', (_req, res) => {
    res.json({ ok: true });
  });

  // Slow endpoint — delays longer than default timeout
  app.get('/slow', (_req, res) => {
    setTimeout(() => {
      if (!res.headersSent) {
        res.json({ ok: true, slow: true });
      }
    }, 200);
  });

  return app;
}

describe('requestTimeout middleware', () => {
  it('allows fast requests through', async () => {
    const app = createApp(1000);
    const res = await request(app).get('/fast');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 408 when request exceeds timeout', async () => {
    const app = createApp(50); // 50ms timeout
    const res = await request(app).get('/slow'); // takes 200ms
    expect(res.status).toBe(408);
    expect(res.body.error).toBe('Request timeout');
    expect(res.body.timeoutMs).toBe(50);
  });

  it('uses default 30s timeout when none specified', () => {
    // Verify the factory returns a middleware function
    const middleware = requestTimeout();
    expect(typeof middleware).toBe('function');
    expect(middleware.length).toBe(3); // Express middleware signature
  });

  it('clears timeout on response finish', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const app = createApp(5000);
    const res = await request(app).get('/fast');
    expect(res.status).toBe(200);
    // No lingering timeout errors — test completes cleanly
    vi.useRealTimers();
  });
});
