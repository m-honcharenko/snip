import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  IP_HASH_SECRET: z.string().min(16),
  LINK_CACHE_ENABLED: z.enum(['true', 'false']).default('true'),
  CLICK_TRACKING_ENABLED: z.enum(['true', 'false']).default('true'),
});
