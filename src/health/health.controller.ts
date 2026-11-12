import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Service, database and Redis health check' })
  @ApiOkResponse({
    description: 'The database is up; status is "degraded" if Redis is down',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ok', 'degraded'], example: 'ok' },
        db: { type: 'string', example: 'up' },
        redis: { type: 'string', enum: ['up', 'down'], example: 'up' },
      },
    },
  })
  @ApiServiceUnavailableResponse({ description: 'The database is unreachable' })
  async check() {
    const [db, redis] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);
    if (db.status === 'rejected') {
      throw new ServiceUnavailableException('Database is unreachable');
    }
    const redisUp = redis.status === 'fulfilled';
    return {
      status: redisUp ? 'ok' : 'degraded',
      db: 'up',
      redis: redisUp ? 'up' : 'down',
    };
  }
}
