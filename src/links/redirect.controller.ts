import {
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Redirect,
  Req,
} from '@nestjs/common';
import {
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ClickQueueService } from '../analytics/click-queue.service.js';
import { codeSchema } from './links.schemas.js';
import { LinksService } from './links.service.js';

@ApiTags('redirect')
@Controller()
export class RedirectController {
  constructor(
    private readonly links: LinksService,
    private readonly clicks: ClickQueueService,
  ) {}

  @Get(':code')
  @Redirect()
  @ApiOperation({ summary: 'Redirect to the original URL' })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: 'Redirect to the target URL (see the Location header)',
  })
  @ApiNotFoundResponse({ description: 'No link with this code' })
  @ApiGoneResponse({ description: 'The link has expired' })
  async redirect(@Param('code') code: string, @Req() req: Request) {
    // A code in the wrong format can't exist: answer 404 without hitting Redis or the database
    if (!codeSchema.safeParse(code).success) {
      throw new NotFoundException('Link not found');
    }
    const url = await this.links.resolveRedirect(code);
    this.clicks.record({
      code,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      referrer: req.get('referer'),
    });
    return { url, statusCode: HttpStatus.FOUND };
  }
}
