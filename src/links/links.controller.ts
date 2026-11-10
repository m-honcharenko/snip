import { Body, Controller, Post } from '@nestjs/common';
import type { Link } from '../generated/prisma/client.js';
import { LinksService } from './links.service.js';
import { createLinkSchema, type CreateLinkInput } from './links.schemas.js';

function toLinkResponse(link: Link) {
  return {
    code: link.code,
    targetUrl: link.targetUrl,
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
  };
}

@Controller('links')
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Post()
  async create(@Body({ schema: createLinkSchema }) input: CreateLinkInput) {
    return toLinkResponse(await this.links.create(input));
  }
}
