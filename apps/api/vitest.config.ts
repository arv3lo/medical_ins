import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one database, so files run one after another.
    fileParallelism: false,
  },
});
