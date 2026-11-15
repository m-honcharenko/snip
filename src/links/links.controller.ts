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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
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
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard, type AuthUser } from '../auth/jwt-auth.guard.js';

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
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired token' })
@UseGuards(JwtAuthGuard)
@Controller('links')
export class LinksController {
  constructor(
    private readonly links: LinksService,
    private readonly clickStats: ClickStatsService,
  ) {}

  @Get(':code/stats')
  @ApiOperation({ summary: 'Click statistics for one of your links' })
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
  @ApiNotFoundResponse({
    description: 'No link with this code, or it belongs to another user',
  })
  async stats(
    @CurrentUser() user: AuthUser,
    @Param('code', { schema: codeSchema }) code: string,
    @Query({ schema: statsQuerySchema }) query: StatsQuery,
  ) {
    const link = await this.links.getOwnedByCodeOrThrow(user.id, code);
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
    description:
      'Invalid or non-public URL, invalid or reserved alias, or expiresAt is in the past',
  })
  @ApiConflictResponse({ description: 'The alias is already taken' })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded: 10 links per minute per IP',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createLinkSchema }) input: CreateLinkInput,
  ) {
    return toLinkResponse(await this.links.create(user.id, input));
  }

  @Get()
  @ApiOperation({ summary: 'List your links, newest first' })
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
  async list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listLinksQuerySchema }) query: ListLinksQuery,
  ) {
    const { items, total } = await this.links.listOwned(user.id, query);
    return {
      items: items.map(toLinkResponse),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get metadata of one of your links' })
  @ApiOkResponse({
    description: 'Link metadata (expired links are returned too)',
    schema: LINK_RESPONSE_SCHEMA,
  })
  @ApiBadRequestResponse({ description: 'Malformed link code' })
  @ApiNotFoundResponse({
    description: 'No link with this code, or it belongs to another user',
  })
  async get(
    @CurrentUser() user: AuthUser,
    @Param('code', { schema: codeSchema }) code: string,
  ) {
    return toLinkResponse(
      await this.links.getOwnedByCodeOrThrow(user.id, code),
    );
  }

  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one of your links' })
  @ApiNoContentResponse({ description: 'The link was deleted' })
  @ApiBadRequestResponse({ description: 'Malformed link code' })
  @ApiNotFoundResponse({
    description: 'No link with this code, or it belongs to another user',
  })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('code', { schema: codeSchema }) code: string,
  ) {
    const deleted = await this.links.deleteOwnedByCode(user.id, code);
    if (!deleted) throw new NotFoundException('Link not found');
  }
}
