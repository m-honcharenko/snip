import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Link } from '../generated/prisma/client.js';
import {
  createLinkSchema,
  type ListLinksQuery,
  listLinksQuerySchema,
  type CreateLinkInput,
  codeSchema,
  type StatsQuery,
  statsQuerySchema,
} from './links.schemas.js';
import { LinksService } from './links.service.js';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ClickStatsService } from '../analytics/click-stats.service.js';

const LINK_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    code: { type: 'string', example: 'aB3dE9k' },
    targetUrl: { type: 'string', format: 'uri' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

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
  constructor(
    private readonly links: LinksService,
    private readonly clickStats: ClickStatsService,
  ) {}

  @Get(':code/stats')
  @ApiOperation({ summary: 'Click statistics for a link' })
  @ApiOkResponse({
    description: 'Totals, clicks per day and top referrers',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'aB3dE9k' },
        totalClicks: { type: 'integer', example: 42 },
        clicksInPeriod: { type: 'integer', example: 17 },
        period: {
          type: 'object',
          properties: {
            from: { type: 'string', format: 'date' },
            to: { type: 'string', format: 'date' },
            days: { type: 'integer', example: 30 },
          },
        },
        clicksByDay: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', format: 'date' },
              clicks: { type: 'integer' },
            },
          },
        },
        topReferrers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              referrer: {
                type: 'string',
                nullable: true,
                example: 'www.google.com',
              },
              clicks: { type: 'integer' },
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Malformed code or invalid days' })
  @ApiNotFoundResponse({ description: 'No link with this code' })
  async stats(
    @Param('code', { schema: codeSchema }) code: string,
    @Query({ schema: statsQuerySchema }) query: StatsQuery,
  ) {
    const link = await this.links.getByCodeOrThrow(code);
    return {
      code: link.code,
      ...(await this.clickStats.forLink(link.id, query.days)),
    };
  }

  @Post()
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Create a short link' })
  @ApiCreatedResponse({
    description: 'The link was created',
    schema: LINK_RESPONSE_SCHEMA,
  })
  @ApiBadRequestResponse({
    description: 'Invalid or non-public URL, or expiresAt is in the past',
  })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded: 10 links per minute per IP',
  })
  async create(@Body({ schema: createLinkSchema }) input: CreateLinkInput) {
    return toLinkResponse(await this.links.create(input));
  }

  @Get()
  @ApiOperation({ summary: 'List links, newest first' })
  @ApiOkResponse({
    description: 'A page of links',
    schema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: LINK_RESPONSE_SCHEMA },
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 20 },
        total: { type: 'integer', example: 42 },
        totalPages: { type: 'integer', example: 3 },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid page or limit' })
  async list(@Query({ schema: listLinksQuerySchema }) query: ListLinksQuery) {
    const { items, total } = await this.links.list(query);
    return {
      items: items.map(toLinkResponse),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get link metadata' })
  @ApiOkResponse({
    description: 'Link metadata (expired links are returned too)',
    schema: LINK_RESPONSE_SCHEMA,
  })
  @ApiBadRequestResponse({ description: 'Malformed link code' })
  @ApiNotFoundResponse({ description: 'No link with this code' })
  async get(@Param('code', { schema: codeSchema }) code: string) {
    return toLinkResponse(await this.links.getByCodeOrThrow(code));
  }

  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a link' })
  @ApiNoContentResponse({ description: 'The link was deleted' })
  @ApiBadRequestResponse({ description: 'Malformed link code' })
  @ApiNotFoundResponse({ description: 'No link with this code' })
  async remove(@Param('code', { schema: codeSchema }) code: string) {
    const deleted = await this.links.deleteByCode(code);
    if (!deleted) throw new NotFoundException('Link not found');
  }
}
