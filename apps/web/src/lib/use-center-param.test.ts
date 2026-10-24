import { describe, expect, it } from 'vitest';
import { withCenter } from './use-center-param';

describe('withCenter', () => {
  it("switches the page's center and keeps its other query params", () => {
    const params = withCenter(new URLSearchParams('centre=a&q=rakoto'), 'b');
    expect(params.toString()).toBe('centre=b&q=rakoto');
  });
});
