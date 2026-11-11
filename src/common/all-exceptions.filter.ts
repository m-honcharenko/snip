import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';

type NormalizedError = {
  statusCode: number;
  message: string;
  details?: string[];
};

function clientErrorStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { status, statusCode } = exception as {
    status?: unknown;
    statusCode?: unknown;
  };
  const value = status ?? statusCode;
  return typeof value === 'number' && value >= 400 && value < 500
    ? value
    : undefined;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const { statusCode, message, details } = this.normalize(exception);

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message,
      ...(details && { details }),
      path: request.originalUrl,
    });
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();
      const raw =
        typeof body === 'string'
          ? body
          : (body as { message?: unknown }).message;
      if (Array.isArray(raw)) {
        return {
          statusCode,
          message: 'Validation failed',
          details: raw.map(String),
        };
      }
      return {
        statusCode,
        message: typeof raw === 'string' ? raw : exception.message,
      };
    }

    // Errors from Express middleware, e.g. malformed JSON in the request body
    const clientStatus = clientErrorStatus(exception);
    if (clientStatus) {
      return {
        statusCode: clientStatus,
        message: exception instanceof Error ? exception.message : 'Bad request',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }
}
