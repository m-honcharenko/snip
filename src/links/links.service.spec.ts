import {
  BadRequestException,
  ConflictException,
  GoneException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { generateCode } from './code.generator.js';
import type { LinkCacheService } from './link-cache.service.js';
import { LinksService } from './links.service.js';

vi.mock('./code.generator.js', () => ({ generateCode: vi.fn() }));

const HOUR_MS = 60 * 60 * 1000;
const USER_ID = 1;

function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    code: 'abc1234',
    targetUrl: 'https://example.com',
    expiresAt: null,
    userId: USER_ID,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function uniqueViolation() {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
  });
}

function createService() {
  const prisma = {
    link: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const cache = { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() };
  const service = new LinksService(
    prisma as unknown as PrismaService,
    cache as unknown as LinkCacheService,
  );
  return { service, prisma, cache };
}

beforeEach(() => {
  vi.mocked(generateCode).mockReset();
  vi.mocked(generateCode).mockReturnValue('abc1234');
});

describe('LinksService.create', () => {
  it('stores the link with a generated code', async () => {
    const { service, prisma } = createService();
    prisma.link.create.mockResolvedValue(makeLink());

    const link = await service.create(USER_ID, { url: 'https://example.com' });

    expect(link.code).toBe('abc1234');
    expect(prisma.link.create).toHaveBeenCalledWith({
      data: {
        code: 'abc1234',
        targetUrl: 'https://example.com',
        expiresAt: null,
        userId: USER_ID,
      },
    });
  });

  it('records the owner on a generated-code link and on an alias link', async () => {
    const { service, prisma } = createService();
    prisma.link.findUnique.mockResolvedValue(null);
    prisma.link.create.mockResolvedValue(makeLink());

    await service.create(42, { url: 'https://example.com' });
    await service.create(42, { url: 'https://example.com', alias: 'docs' });

    expect(prisma.link.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ userId: 42 }),
    });
    expect(prisma.link.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ code: 'docs', userId: 42 }),
    });
  });

  it('converts expiresAt to a Date', async () => {
    const { service, prisma } = createService();
    prisma.link.create.mockResolvedValue(makeLink());
    const expiresAt = new Date(Date.now() + HOUR_MS);

    await service.create(USER_ID, {
      url: 'https://example.com',
      expiresAt: expiresAt.toISOString(),
    });

    expect(prisma.link.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ expiresAt }),
    });
  });

  it('rejects an expiresAt in the past without touching the database', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create(USER_ID, {
        url: 'https://example.com',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.link.create).not.toHaveBeenCalled();
  });

  it('retries with a new code after a unique violation', async () => {
    const { service, prisma } = createService();
    vi.mocked(generateCode)
      .mockReturnValueOnce('first00')
      .mockReturnValueOnce('second0');
    prisma.link.create
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce(makeLink({ code: 'second0' }));

    const link = await service.create(USER_ID, { url: 'https://example.com' });

    expect(link.code).toBe('second0');
    expect(prisma.link.create).toHaveBeenCalledTimes(2);
    expect(prisma.link.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ code: 'second0' }),
    });
  });

  it('gives up after 5 attempts', async () => {
    const { service, prisma } = createService();
    prisma.link.create.mockRejectedValue(uniqueViolation());

    await expect(
      service.create(USER_ID, { url: 'https://example.com' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(prisma.link.create).toHaveBeenCalledTimes(5);
  });

  it('does not retry other database errors', async () => {
    const { service, prisma } = createService();
    prisma.link.create.mockRejectedValue(new Error('connection lost'));

    await expect(
      service.create(USER_ID, { url: 'https://example.com' }),
    ).rejects.toThrow('connection lost');
    expect(prisma.link.create).toHaveBeenCalledTimes(1);
  });

  it('does not treat a non-object error as a unique violation', async () => {
    const { service, prisma } = createService();
    prisma.link.create.mockRejectedValue('boom');

    await expect(
      service.create(USER_ID, { url: 'https://example.com' }),
    ).rejects.toBe('boom');
    expect(prisma.link.create).toHaveBeenCalledTimes(1);
  });

  it('does not treat null as a unique violation', async () => {
    const { service, prisma } = createService();
    prisma.link.create.mockRejectedValue(null);

    await expect(
      service.create(USER_ID, { url: 'https://example.com' }),
    ).rejects.toBeNull();
    expect(prisma.link.create).toHaveBeenCalledTimes(1);
  });
});

describe('LinksService.create with an alias', () => {
  it('stores the link under the alias without generating a code', async () => {
    const { service, prisma } = createService();
    prisma.link.findUnique.mockResolvedValue(null);
    prisma.link.create.mockResolvedValue(makeLink({ code: 'docs' }));

    const link = await service.create(USER_ID, {
      url: 'https://example.com',
      alias: 'docs',
    });

    expect(link.code).toBe('docs');
    expect(generateCode).not.toHaveBeenCalled();
    expect(prisma.link.findUnique).toHaveBeenCalledWith({
      where: { code: 'docs' },
    });
    expect(prisma.link.create).toHaveBeenCalledWith({
      data: {
        code: 'docs',
        targetUrl: 'https://example.com',
        expiresAt: null,
        userId: USER_ID,
      },
    });
  });

  it('answers 409 for a taken alias without inserting', async () => {
    const { service, prisma } = createService();
    prisma.link.findUnique.mockResolvedValue(makeLink({ code: 'docs' }));

    await expect(
      service.create(USER_ID, { url: 'https://example.com', alias: 'docs' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.link.create).not.toHaveBeenCalled();
  });

  it('answers 409 when another request takes the alias first', async () => {
    const { service, prisma } = createService();
    prisma.link.findUnique.mockResolvedValue(null);
    prisma.link.create.mockRejectedValue(uniqueViolation());

    await expect(
      service.create(USER_ID, { url: 'https://example.com', alias: 'docs' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.link.create).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to a generated code', async () => {
    const { service, prisma } = createService();
    prisma.link.findUnique.mockResolvedValue(null);
    prisma.link.create.mockRejectedValue(uniqueViolation());

    await expect(
      service.create(USER_ID, { url: 'https://example.com', alias: 'docs' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(generateCode).not.toHaveBeenCalled();
  });

  it('passes other database errors through', async () => {
    const { service, prisma } = createService();
    prisma.link.findUnique.mockResolvedValue(null);
    prisma.link.create.mockRejectedValue(new Error('connection lost'));

    await expect(
      service.create(USER_ID, { url: 'https://example.com', alias: 'docs' }),
    ).rejects.toThrow('connection lost');
  });

  it('stores the expiry together with the alias', async () => {
    const { service, prisma } = createService();
    prisma.link.findUnique.mockResolvedValue(null);
    prisma.link.create.mockResolvedValue(makeLink({ code: 'docs' }));
    const expiresAt = new Date(Date.now() + HOUR_MS);

    await service.create(USER_ID, {
      url: 'https://example.com',
      alias: 'docs',
      expiresAt: expiresAt.toISOString(),
    });

    expect(prisma.link.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'docs', expiresAt }),
    });
  });
});

describe('LinksService.getOwnedByCodeOrThrow', () => {
  it('returns the link of its owner', async () => {
    const { service, prisma } = createService();
    prisma.link.findFirst.mockResolvedValue(makeLink());

    await expect(
      service.getOwnedByCodeOrThrow(USER_ID, 'abc1234'),
    ).resolves.toMatchObject({ code: 'abc1234' });
    expect(prisma.link.findFirst).toHaveBeenCalledWith({
      where: { code: 'abc1234', userId: USER_ID },
    });
  });

  it('throws NotFoundException for an unknown code or another owner', async () => {
    const { service, prisma } = createService();
    prisma.link.findFirst.mockResolvedValue(null);

    await expect(
      service.getOwnedByCodeOrThrow(USER_ID, 'nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('LinksService.resolveRedirect', () => {
  it('serves a cache hit without touching the database', async () => {
    const { service, prisma, cache } = createService();
    cache.get.mockResolvedValue({
      targetUrl: 'https://cached.example.com',
      expiresAt: null,
    });

    await expect(service.resolveRedirect('abc1234')).resolves.toBe(
      'https://cached.example.com',
    );
    expect(prisma.link.findUnique).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('answers 410 for an expired cache entry', async () => {
    const { service, cache } = createService();
    cache.get.mockResolvedValue({
      targetUrl: 'https://example.com',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(service.resolveRedirect('abc1234')).rejects.toBeInstanceOf(
      GoneException,
    );
  });

  it('loads a cache miss from the database and caches it', async () => {
    const { service, prisma, cache } = createService();
    const expiresAt = new Date(Date.now() + HOUR_MS);
    cache.get.mockResolvedValue(null);
    prisma.link.findUnique.mockResolvedValue(makeLink({ expiresAt }));

    await expect(service.resolveRedirect('abc1234')).resolves.toBe(
      'https://example.com',
    );
    expect(cache.set).toHaveBeenCalledWith('abc1234', {
      targetUrl: 'https://example.com',
      expiresAt: expiresAt.toISOString(),
    });
  });

  it('caches a link without an expiry with expiresAt null', async () => {
    const { service, prisma, cache } = createService();
    cache.get.mockResolvedValue(null);
    prisma.link.findUnique.mockResolvedValue(makeLink());

    await service.resolveRedirect('abc1234');

    expect(cache.set).toHaveBeenCalledWith('abc1234', {
      targetUrl: 'https://example.com',
      expiresAt: null,
    });
  });

  it('answers 404 for an unknown code and caches nothing', async () => {
    const { service, prisma, cache } = createService();
    cache.get.mockResolvedValue(null);
    prisma.link.findUnique.mockResolvedValue(null);

    await expect(service.resolveRedirect('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('answers 410 for an expired link and caches nothing', async () => {
    const { service, prisma, cache } = createService();
    cache.get.mockResolvedValue(null);
    prisma.link.findUnique.mockResolvedValue(
      makeLink({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(service.resolveRedirect('abc1234')).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(cache.set).not.toHaveBeenCalled();
  });
});

describe('LinksService.deleteOwnedByCode', () => {
  it('reports a deletion and invalidates the cache', async () => {
    const { service, prisma, cache } = createService();
    prisma.link.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.deleteOwnedByCode(USER_ID, 'abc1234')).resolves.toBe(
      true,
    );
    expect(prisma.link.deleteMany).toHaveBeenCalledWith({
      where: { code: 'abc1234', userId: USER_ID },
    });
    expect(cache.invalidate).toHaveBeenCalledWith('abc1234');
  });

  it('reports false and leaves the cache alone when nothing was deleted', async () => {
    const { service, prisma, cache } = createService();
    prisma.link.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.deleteOwnedByCode(USER_ID, 'nope')).resolves.toBe(
      false,
    );
    expect(cache.invalidate).not.toHaveBeenCalled();
  });
});

describe('LinksService.listOwned', () => {
  it('computes skip and take from page and limit', async () => {
    const { service, prisma } = createService();
    prisma.$transaction.mockResolvedValue([[makeLink()], 25]);

    const result = await service.listOwned(USER_ID, { page: 3, limit: 10 });

    expect(result).toEqual({ items: [makeLink()], total: 25 });
    expect(prisma.link.count).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(prisma.link.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 20,
      take: 10,
    });
  });
});
