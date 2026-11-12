import { StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { ClickQueueService } from './analytics/click-queue.service.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());

  if (process.env.NODE_ENV !== 'production') {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');
    createBullBoard({
      queues: [
        new BullMQAdapter(app.get(ClickQueueService).queue, {
          readOnlyMode: true,
        }),
      ],
      serverAdapter,
    });
    app.use('/admin/queues', serverAdapter.getRouter());
  }

  const config = new DocumentBuilder()
    .setTitle('Snip')
    .setDescription('URL shortener API with click analytics')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api', app, () =>
    SwaggerModule.createDocument(app, config),
  );

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
