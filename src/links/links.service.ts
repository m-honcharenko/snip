import {
  BadRequestException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateCode } from './code.generator.js';
import { LinkCacheService } from './link-cache.service.js';
import type { CreateLinkInput, ListLinksQuery } from './links.schemas.js';

const MAX_ATTEMPTS = 5;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function isExpired(expiresAt: Date | null) {
  return expiresAt !== null && expiresAt <= new Date();
}

@Injectable()
export class LinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LinkCacheService,
  ) {}

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

  async getByCodeOrThrow(code: string) {
    const link = await this.findByCode(code);
    if (!link) throw new NotFoundException('Link not found');
    return link;
  }

  // Hot path: Redis first (cache-aside), the database only on a miss.
  async resolveRedirect(code: string): Promise<string> {
    const cached = await this.cache.get(code);
    if (cached) {
      const expiresAt = cached.expiresAt ? new Date(cached.expiresAt) : null;
      if (isExpired(expiresAt)) throw new GoneException('Link has expired');
      return cached.targetUrl;
    }

    const link = await this.findByCode(code);
    if (!link) throw new NotFoundException('Link not found');
    if (isExpired(link.expiresAt)) throw new GoneException('Link has expired');

    await this.cache.set(code, {
      targetUrl: link.targetUrl,
      expiresAt: link.expiresAt?.toISOString() ?? null,
    });
    return link.targetUrl;
  }

  async deleteByCode(code: string): Promise<boolean> {
    const { count } = await this.prisma.link.deleteMany({ where: { code } });
    await this.cache.invalidate(code);
    return count > 0;
  }

  async list({ page, limit }: ListLinksQuery) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.link.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.link.count(),
    ]);
    return { items, total };
  }
}
