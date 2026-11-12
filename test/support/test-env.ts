import 'dotenv/config';

export const TEST_DB_NAME = 'snip_test';
export const TEST_REDIS_DB = 1;

function withPath(url: string, path: string) {
  const parsed = new URL(url);
  parsed.pathname = path;
  return parsed.toString();
}

// Same server as development, but a separate database and a separate Redis db
const devDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://snip:snip@localhost:5432/snip';
const devRedisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const testEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: withPath(devDatabaseUrl, `/${TEST_DB_NAME}`),
  REDIS_URL: withPath(devRedisUrl, `/${TEST_REDIS_DB}`),
  IP_HASH_SECRET: process.env.IP_HASH_SECRET ?? 'e2e-secret-e2e-secret',
};
