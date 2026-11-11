import {
  Controller,
  Get,
  GoneException,
  HttpStatus,
  NotFoundException,
  Param,
  Redirect,
} from '@nestjs/common';
import {
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { codeSchema } from './links.schemas.js';
import { LinksService } from './links.service.js';

@ApiTags('redirect')
@Controller()
export class RedirectController {
  constructor(private readonly links: LinksService) {}

  @Get(':code')
  @Redirect()
  @ApiOperation({ summary: 'Redirect to the original URL' })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: 'Redirect to the target URL (see the Location header)',
  })
  @ApiNotFoundResponse({ description: 'No link with this code' })
  @ApiGoneResponse({ description: 'The link has expired' })
  async redirect(@Param('code') code: string) {
    // A code in the wrong format can't exist: answer 404 without hitting the database
    if (!codeSchema.safeParse(code).success) {
      throw new NotFoundException('Link not found');
    }
    const link = await this.links.findByCode(code);
    if (!link) throw new NotFoundException('Link not found');
    if (link.expiresAt && link.expiresAt <= new Date()) {
      throw new GoneException('Link has expired');
    }
    return { url: link.targetUrl, statusCode: HttpStatus.FOUND };
  }
}
