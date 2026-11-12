import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { RedisService } from '../redis/redis.service.js';
import { FailOpenThrottlerStorage } from './fail-open-throttler-storage.js';
import { LinkCacheService } from './link-cache.service.js';
import { LinksController } from './links.controller.js';
import { LinksService } from './links.service.js';
import { RedirectController } from './redirect.controller.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        // 10 requests per minute per IP; applied only where ThrottlerGuard is used
        throttlers: [{ limit: 10, ttl: seconds(60) }],
        storage: new FailOpenThrottlerStorage(
          new ThrottlerStorageRedisService(redis.client),
        ),
      }),
    }),
    AnalyticsModule,
  ],
  controllers: [LinksController, RedirectController],
  providers: [LinksService, LinkCacheService],
})
export class LinksModule {}
