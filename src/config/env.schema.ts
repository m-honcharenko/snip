import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  IP_HASH_SECRET: z.string().min(16),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'Use a number and a unit, for example 15m, 1h or 7d')
    .default('1h'),
  LINK_CACHE_ENABLED: z.enum(['true', 'false']).default('true'),
  CLICK_TRACKING_ENABLED: z.enum(['true', 'false']).default('true'),
});
