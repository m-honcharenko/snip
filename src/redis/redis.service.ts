import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

const STARTUP_WAIT_MS = 2000;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      // Fail fast instead of queueing commands while Redis is down:
      // the cache must never slow down or break a redirect.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.client.on('error', (error) => {
      this.logger.warn(`Redis error: ${error.message}`);
    });
  }

  // Give the connection a moment to become ready, but never block startup for long:
  // the app works without Redis (cache misses go to the database).
  async onModuleInit() {
    if (this.client.status === 'ready') return;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.client.off('ready', finish);
        resolve();
      };
      const timer = setTimeout(finish, STARTUP_WAIT_MS);
      this.client.once('ready', finish);
    });
  }

  ping() {
    return this.client.ping();
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
