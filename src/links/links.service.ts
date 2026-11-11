import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateCode } from './code.generator.js';
import type { CreateLinkInput } from './links.schemas.js';

const MAX_ATTEMPTS = 5;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

@Injectable()
export class LinksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateLinkInput) {
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('expiresAt must be in the future');
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.link.create({
          data: { code: generateCode(), targetUrl: input.url, expiresAt },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new InternalServerErrorException('Could not generate a unique code');
  }

  findByCode(code: string) {
    return this.prisma.link.findUnique({ where: { code } });
  }
}
