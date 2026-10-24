import { buildApp } from './app.js';
import { createDb } from './db/client.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const { db, client } = createDb(env.DATABASE_URL);
const app = await buildApp({ db, env });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await client.end();
    process.exit(0);
  });
}

await app.listen({ host: '0.0.0.0', port: env.API_PORT });
