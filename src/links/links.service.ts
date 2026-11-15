import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../common/is-unique-violation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateCode } from './code.generator.js';
import { LinkCacheService } from './link-cache.service.js';
import type { CreateLinkInput, ListLinksQuery } from './links.schemas.js';

const MAX_ATTEMPTS = 5;

function isExpired(expiresAt: Date | null) {
  return expiresAt !== null && expiresAt <= new Date();
}

@Injectable()
export class LinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LinkCacheService,
  ) {}

  async create(userId: number, input: CreateLinkInput) {
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('expiresAt must be in the future');
    }

    // A custom alias is taken or it is not: no retries. The lookup gives the
    // common case a clean 409 without a failed insert. It is not enough on its
    // own (two requests can pass it at the same time), so the unique index
    // stays the source of truth and its violation is mapped to the same 409.
    if (input.alias) {
      if (await this.findByCode(input.alias)) {
        throw new ConflictException('Alias is already taken');
      }
      try {
        return await this.prisma.link.create({
          data: {
            code: input.alias,
            targetUrl: input.url,
            expiresAt,
            userId,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException('Alias is already taken');
        }
        throw error;
      }
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.link.create({
          data: {
            code: generateCode(),
            targetUrl: input.url,
            expiresAt,
            userId,
          },
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

  // A link of another user looks the same as a missing one: 404, not 403
  async getOwnedByCodeOrThrow(userId: number, code: string) {
    const link = await this.prisma.link.findFirst({ where: { code, userId } });
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

  async deleteOwnedByCode(userId: number, code: string): Promise<boolean> {
    const { count } = await this.prisma.link.deleteMany({
      where: { code, userId },
    });
    // Nothing was deleted: the link is missing or belongs to someone else, and
    // a stranger must not be able to evict another user's cache entry
    if (count === 0) return false;
    await this.cache.invalidate(code);
    return true;
  }

  async listOwned(userId: number, { page, limit }: ListLinksQuery) {
    const where = { userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.link.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.link.count({ where }),
    ]);
    return { items, total };
  }
}
