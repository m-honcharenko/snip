import { Module } from '@nestjs/common';
import { ClickQueueService } from './click-queue.service.js';
import { ClicksProcessor } from './clicks.processor.js';

@Module({
  providers: [ClickQueueService, ClicksProcessor],
  exports: [ClickQueueService],
})
export class AnalyticsModule {}
