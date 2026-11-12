import {
  Controller,
  Get,
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
    // A code in the wrong format can't exist: answer 404 without hitting Redis or the database
    if (!codeSchema.safeParse(code).success) {
      throw new NotFoundException('Link not found');
    }
    const url = await this.links.resolveRedirect(code);
    return { url, statusCode: HttpStatus.FOUND };
  }
}
