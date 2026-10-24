import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// `vitest run` does not read the repository .env, so TEST_DATABASE_URL from the README setup
// would be missing and every integration suite silently skipped. Exported variables still win.
const envFile = new URL('../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    // Integration tests share one database, so files run one after another.
    fileParallelism: false,
  },
});
