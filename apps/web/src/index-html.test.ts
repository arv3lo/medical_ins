import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';

describe('index.html', () => {
  // A strict CSP (script-src 'self', roadmap P6.2) refuses inline scripts.
  it('has no inline script', () => {
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.filter((tag) => !/\ssrc=/.test(tag))).toEqual([]);
  });
});
