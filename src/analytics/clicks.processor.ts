import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLICKS_QUEUE, type ClickJobData } from './click.types.js';
import { redisConnectionOptions } from './redis-connection.js';

@Injectable()
export class ClicksProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClicksProcessor.name);
  private worker?: Worker<ClickJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<ClickJobData>(
      CLICKS_QUEUE,
      (job) => this.handle(job),
      {
        connection: redisConnectionOptions(
          this.config.getOrThrow<string>('REDIS_URL'),
        ),
        concurrency: 5,
      },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`Click worker error: ${error.message}`);
    });
    this.worker.on('failed', (job, error) => {
      const reason = error.message.trim().split('\n')[0];
      this.logger.warn(
        `Click job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${reason}`,
      );
    });
  }

  private async handle(job: Job<ClickJobData>) {
    const { code, clickedAt, referrer, userAgent, ipHash } = job.data;
    const link = await this.prisma.link.findUnique({
      where: { code },
      select: { id: true },
    });
    // The link was deleted before its click was processed: nothing to record
    if (!link) return;
    await this.prisma.clickEvent.create({
      data: {
        linkId: link.id,
        clickedAt: new Date(clickedAt),
        referrer,
        userAgent,
        ipHash,
      },
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
