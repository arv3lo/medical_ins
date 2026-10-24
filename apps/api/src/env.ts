import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    API_PORT: z.coerce.number().int().positive().default(3000),
    SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
    /** Reverse proxies in front of the API whose X-Forwarded-For is trusted (1 behind Caddy). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    /** Defaults to Secure in production, so a forgotten setting never sends the cookie over HTTP. */
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
  }));

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
