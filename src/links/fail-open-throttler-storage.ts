import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';

// If Redis is unavailable, the rate limiter lets the request through
// instead of turning every POST /links into a 500.
export class FailOpenThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(FailOpenThrottlerStorage.name);

  constructor(private readonly inner: ThrottlerStorage) {}

  async increment(...args: Parameters<ThrottlerStorage['increment']>) {
    try {
      return await this.inner.increment(...args);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Rate limiter unavailable, allowing request: ${reason}`);
      const ttl = args[1];
      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
