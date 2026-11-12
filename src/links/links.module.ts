import { Module } from '@nestjs/common';
import { LinksController } from './links.controller.js';
import { RedirectController } from './redirect.controller.js';
import { LinksService } from './links.service.js';
import { LinkCacheService } from './link-cache.service.js';

@Module({
  controllers: [LinksController, RedirectController],
  providers: [LinksService, LinkCacheService],
})
export class LinksModule {}
