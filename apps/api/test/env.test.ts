import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env.js';

const DATABASE_URL = 'postgres://medins:medins@localhost:5432/medins';

describe('loadEnv', () => {
  it('makes the session cookie Secure by default in production', () => {
    expect(loadEnv({ NODE_ENV: 'production', DATABASE_URL }).COOKIE_SECURE).toBe(true);
  });

  it('allows plain HTTP by default in development', () => {
    expect(loadEnv({ NODE_ENV: 'development', DATABASE_URL }).COOKIE_SECURE).toBe(false);
  });

  it('keeps an explicit COOKIE_SECURE', () => {
    const env = loadEnv({ NODE_ENV: 'production', DATABASE_URL, COOKIE_SECURE: 'false' });
    expect(env.COOKIE_SECURE).toBe(false);
  });
});
