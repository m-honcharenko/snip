import { Module } from '@nestjs/common';
import { ClickQueueService } from './click-queue.service.js';
import { ClickStatsService } from './click-stats.service.js';
import { ClicksProcessor } from './clicks.processor.js';

@Module({
  providers: [ClickQueueService, ClickStatsService, ClicksProcessor],
  exports: [ClickQueueService, ClickStatsService],
})
export class AnalyticsModule {}
