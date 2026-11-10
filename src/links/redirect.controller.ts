import {
  Controller,
  Get,
  GoneException,
  HttpStatus,
  NotFoundException,
  Param,
  Redirect,
} from '@nestjs/common';
import { LinksService } from './links.service.js';

@Controller()
export class RedirectController {
  constructor(private readonly links: LinksService) {}

  @Get(':code')
  @Redirect()
  async redirect(@Param('code') code: string) {
    const link = await this.links.findByCode(code);
    if (!link) throw new NotFoundException('Link not found');
    if (link.expiresAt && link.expiresAt <= new Date()) {
      throw new GoneException('Link has expired');
    }
    return { url: link.targetUrl, statusCode: HttpStatus.FOUND };
  }
}
