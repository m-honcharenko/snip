import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { RedisService } from '../../src/redis/redis.service.js';
import { TEST_DB_NAME } from './test-env.js';

// Never truncate anything that isn't the dedicated test database
function assertTestDatabase() {
  const path = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid')
    .pathname;
  if (path !== `/${TEST_DB_NAME}`) {
    throw new Error(`Refusing to run e2e tests against "${path}"`);
  }
}

export async function createTestApp() {
  assertTestDatabase();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

// Clean slate: empty tables; Redis keeps only the BullMQ keys (a live worker
// depends on them), everything else (cache, rate-limit counters) goes away
export async function resetState(app: INestApplication) {
  assertTestDatabase();
  await app.get(PrismaService)
    .$executeRaw`TRUNCATE TABLE "ClickEvent", "Link" RESTART IDENTITY CASCADE`;
  const redis = app.get(RedisService).client;
  const keys = (await redis.keys('*')).filter(
    (key) => !key.startsWith('bull:'),
  );
  if (keys.length > 0) await redis.del(...keys);
}
