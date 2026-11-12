import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service.js';

export type CachedLink = {
  targetUrl: string;
  expiresAt: string | null;
};

const KEY_PREFIX = 'link:';
const MAX_TTL_SECONDS = 60 * 60;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class LinkCacheService {
  private readonly logger = new Logger(LinkCacheService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    // A switch for benchmarks: with the cache off, every redirect goes to Postgres
    this.enabled = config.get<string>('LINK_CACHE_ENABLED') !== 'false';
  }

  async get(code: string): Promise<CachedLink | null> {
    if (!this.enabled) return null;
    try {
      const raw = await this.redis.client.get(KEY_PREFIX + code);
      return raw ? (JSON.parse(raw) as CachedLink) : null;
    } catch (error) {
      this.logger.warn(`Cache read failed: ${errorMessage(error)}`);
      return null;
    }
  }

  async set(code: string, value: CachedLink) {
    if (!this.enabled) return;
    const ttl = this.ttlSeconds(value.expiresAt);
    if (ttl <= 0) return;
    try {
      await this.redis.client.set(
        KEY_PREFIX + code,
        JSON.stringify(value),
        'EX',
        ttl,
      );
    } catch (error) {
      this.logger.warn(`Cache write failed: ${errorMessage(error)}`);
    }
  }

  // Stays active even when the cache is switched off: a stale entry written earlier
  // must still disappear when its link is deleted
  async invalidate(code: string) {
    try {
      await this.redis.client.del(KEY_PREFIX + code);
    } catch (error) {
      this.logger.warn(`Cache invalidation failed: ${errorMessage(error)}`);
    }
  }

  private ttlSeconds(expiresAt: string | null) {
    if (!expiresAt) return MAX_TTL_SECONDS;
    const remaining = Math.ceil(
      (new Date(expiresAt).getTime() - Date.now()) / 1000,
    );
    return Math.min(MAX_TTL_SECONDS, remaining);
  }
}
