import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { StandardSchemaValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
