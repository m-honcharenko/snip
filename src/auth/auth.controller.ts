import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { type Credentials, credentialsSchema } from './auth.schemas.js';
import { AuthService } from './auth.service.js';

const TOKEN_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    accessToken: {
      type: 'string',
      description: 'JWT, send it as "Authorization: Bearer <token>"',
    },
  },
};

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Create an account and get an access token' })
  @ApiCreatedResponse({
    description: 'The account was created',
    schema: TOKEN_RESPONSE_SCHEMA,
  })
  @ApiBadRequestResponse({ description: 'Invalid email or password' })
  @ApiConflictResponse({ description: 'The email is already registered' })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded: 10 requests per minute per IP',
  })
  register(@Body({ schema: credentialsSchema }) input: Credentials) {
    return this.auth.register(input);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in and get an access token' })
  @ApiOkResponse({
    description: 'The credentials are correct',
    schema: TOKEN_RESPONSE_SCHEMA,
  })
  @ApiBadRequestResponse({ description: 'Invalid email or password format' })
  @ApiUnauthorizedResponse({ description: 'Wrong email or password' })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded: 10 requests per minute per IP',
  })
  login(@Body({ schema: credentialsSchema }) input: Credentials) {
    return this.auth.login(input);
  }
}
