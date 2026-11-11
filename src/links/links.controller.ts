import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Link } from '../generated/prisma/client.js';
import { createLinkSchema, type CreateLinkInput } from './links.schemas.js';
import { LinksService } from './links.service.js';

function toLinkResponse(link: Link) {
  return {
    code: link.code,
    targetUrl: link.targetUrl,
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
  };
}

@ApiTags('links')
@Controller('links')
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a short link' })
  @ApiCreatedResponse({
    description: 'The link was created',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'aB3dE9k' },
        targetUrl: { type: 'string', format: 'uri' },
        expiresAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid or non-public URL, or expiresAt is in the past',
  })
  async create(@Body({ schema: createLinkSchema }) input: CreateLinkInput) {
    return toLinkResponse(await this.links.create(input));
  }
}
