import {
  StandardSchemaValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';

// Shared by main.ts and the e2e tests so both run the same pipeline
export function configureApp(app: INestApplication) {
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
}
