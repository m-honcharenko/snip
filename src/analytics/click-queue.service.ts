import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { createHmac } from 'node:crypto';
import { CLICKS_QUEUE, type ClickJobData } from './click.types.js';
import { redisConnectionOptions } from './redis-connection.js';

export type ClickInput = {
  code: string;
  ip?: string;
  userAgent?: string;
  referrer?: string;
};

const MAX_HEADER_LENGTH = 512;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class ClickQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ClickQueueService.name);
  readonly queue: Queue<ClickJobData>;
  private readonly ipSecret: string;

  constructor(config: ConfigService) {
    this.ipSecret = config.getOrThrow<string>('IP_HASH_SECRET');
    this.queue = new Queue<ClickJobData>(CLICKS_QUEUE, {
      connection: {
        ...redisConnectionOptions(config.getOrThrow<string>('REDIS_URL')),
        // Fail fast instead of piling up commands while Redis is down
        enableOfflineQueue: false,
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 60 * 60, count: 1000 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    });
    this.queue.on('error', (error) => {
      this.logger.warn(`Click queue error: ${errorMessage(error)}`);
    });
  }

  // Fire and forget: the redirect never waits for the queue.
  record(click: ClickInput): void {
    const data: ClickJobData = {
      code: click.code,
      clickedAt: new Date().toISOString(),
      referrer: click.referrer?.slice(0, MAX_HEADER_LENGTH) ?? null,
      userAgent: click.userAgent?.slice(0, MAX_HEADER_LENGTH) ?? null,
      ipHash: click.ip
        ? createHmac('sha256', this.ipSecret).update(click.ip).digest('hex')
        : null,
    };
    this.queue.add('click', data).catch((error: unknown) => {
      this.logger.warn(`Click event dropped: ${errorMessage(error)}`);
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
