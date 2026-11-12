import { Module } from '@nestjs/common';
import { ClickQueueService } from './click-queue.service.js';

@Module({
  providers: [ClickQueueService],
  exports: [ClickQueueService],
})
export class AnalyticsModule {}
