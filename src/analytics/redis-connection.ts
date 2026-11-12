import type { ConnectionOptions as TlsOptions } from 'node:tls';

// A plain object on purpose, not ioredis' RedisOptions: BullMQ ships its own copy
// of ioredis, and the types of two copies don't match each other.
export type QueueRedisConnection = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: TlsOptions;
};

// BullMQ manages its own connections, so we hand it plain options parsed from REDIS_URL.
export function redisConnectionOptions(url: string): QueueRedisConnection {
  const parsed = new URL(url);
  const db =
    parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined;
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.username && { username: decodeURIComponent(parsed.username) }),
    ...(parsed.password && { password: decodeURIComponent(parsed.password) }),
    ...(db !== undefined && !Number.isNaN(db) && { db }),
    ...(parsed.protocol === 'rediss:' && { tls: {} }),
  };
}
