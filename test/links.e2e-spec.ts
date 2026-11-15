import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { createTestApp, resetState } from './support/test-app.js';
import { waitUntil } from './support/wait-until.js';

const HN = 'https://news.ycombinator.com/item?id=1';

let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetState(app);
});

const http = () => request(app.getHttpServer());
const prisma = () => app.get(PrismaService);
const redis = () => app.get(RedisService).client;

async function createLink(url = 'https://example.com') {
  const res = await http().post('/links').send({ url }).expect(201);
  return res.body as {
    code: string;
    targetUrl: string;
    expiresAt: string | null;
    createdAt: string;
  };
}

// The API refuses past dates, so an expired link has to be written directly
function createExpiredLink(code = 'expired1') {
  return prisma().link.create({
    data: {
      code,
      targetUrl: 'https://example.com',
      expiresAt: new Date(Date.now() - 60_000),
    },
  });
}

describe('creating links', () => {
  it('returns the new link without internal fields', async () => {
    const res = await http()
      .post('/links')
      .send({ url: 'https://example.com/page' })
      .expect(201);

    expect(res.body).toMatchObject({
      targetUrl: 'https://example.com/page',
      expiresAt: null,
    });
    expect(res.body.code).toMatch(/^[0-9A-Za-z]{7}$/);
    expect(Number.isNaN(Date.parse(res.body.createdAt))).toBe(false);
    expect(res.body).not.toHaveProperty('id');
  });

  it('stores the expiration date', async () => {
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const res = await http()
      .post('/links')
      .send({ url: 'https://example.com', expiresAt })
      .expect(201);

    expect(res.body.expiresAt).toBe(expiresAt);
  });

  it.each([
    ['a non-http scheme', { url: 'ftp://example.com' }],
    ['a private address', { url: 'http://192.168.1.1' }],
    ['localhost', { url: 'http://localhost:3000' }],
    ['a missing url', {}],
    [
      'a bad date format',
      { url: 'https://example.com', expiresAt: 'tomorrow' },
    ],
  ])('rejects %s with the unified error format', async (_name, body) => {
    const res = await http().post('/links').send(body).expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      path: '/links',
    });
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('rejects an expiration date in the past', async () => {
    const res = await http()
      .post('/links')
      .send({
        url: 'https://example.com',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      })
      .expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      message: 'expiresAt must be in the future',
    });
  });

  it('answers 400 (not 500) for malformed JSON', async () => {
    const res = await http()
      .post('/links')
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(typeof res.body.message).toBe('string');
  });
});

describe('redirects', () => {
  it('redirects with 302 and caches the link', async () => {
    const link = await createLink('https://example.com/target');

    await http()
      .get(`/${link.code}`)
      .expect(302)
      .expect('Location', 'https://example.com/target');

    const ttl = await redis().ttl(`link:${link.code}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3600);
  });

  it('serves from the cache when the database row is gone', async () => {
    const link = await createLink();
    await http().get(`/${link.code}`).expect(302);

    // Remove the row behind the service's back, so the cache is not invalidated
    await prisma().link.deleteMany({ where: { code: link.code } });

    await http()
      .get(`/${link.code}`)
      .expect(302)
      .expect('Location', 'https://example.com');
  });

  it('caps the cache TTL at the link expiration', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const res = await http()
      .post('/links')
      .send({ url: 'https://example.com', expiresAt })
      .expect(201);

    await http().get(`/${res.body.code}`).expect(302);

    const ttl = await redis().ttl(`link:${res.body.code}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('answers 404 for an unknown code in the unified format', async () => {
    const res = await http().get('/nope123').expect(404);

    expect(res.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      message: 'Link not found',
      path: '/nope123',
    });
  });

  it('answers 404 for a malformed code', async () => {
    await http().get('/bad.code').expect(404);
  });

  it('answers 410 for an expired link', async () => {
    await createExpiredLink();

    const res = await http().get('/expired1').expect(410);

    expect(res.body).toMatchObject({
      statusCode: 410,
      message: 'Link has expired',
    });
  });
});

describe('metadata, list and delete', () => {
  it('returns link metadata, expired links included', async () => {
    const link = await createLink();
    await createExpiredLink();

    const res = await http().get(`/links/${link.code}`).expect(200);
    expect(res.body).toEqual(link);

    const expired = await http().get('/links/expired1').expect(200);
    expect(expired.body.code).toBe('expired1');
    expect(new Date(expired.body.expiresAt).getTime()).toBeLessThan(Date.now());
  });

  it('answers 404 for unknown metadata and 400 for a malformed code', async () => {
    await http().get('/links/nope123').expect(404);
    await http().get('/links/bad.code').expect(400);
  });

  it('lists links newest first with pagination', async () => {
    for (const n of [1, 2, 3]) {
      await createLink(`https://example.com/${n}`);
    }

    const first = await http().get('/links?limit=2').expect(200);
    expect(first.body).toMatchObject({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(
      first.body.items.map((item: { targetUrl: string }) => item.targetUrl),
    ).toEqual(['https://example.com/3', 'https://example.com/2']);

    const second = await http().get('/links?limit=2&page=2').expect(200);
    expect(
      second.body.items.map((item: { targetUrl: string }) => item.targetUrl),
    ).toEqual(['https://example.com/1']);

    const beyond = await http().get('/links?page=99').expect(200);
    expect(beyond.body.items).toEqual([]);
    expect(beyond.body.total).toBe(3);
  });

  it('rejects invalid pagination parameters', async () => {
    await http().get('/links?page=0').expect(400);
    await http().get('/links?limit=1000').expect(400);
    await http().get('/links?limit=abc').expect(400);
  });

  it('deletes a link and drops it from the cache', async () => {
    const link = await createLink();
    await http().get(`/${link.code}`).expect(302);
    expect(await redis().exists(`link:${link.code}`)).toBe(1);

    await http().delete(`/links/${link.code}`).expect(204);

    expect(await redis().exists(`link:${link.code}`)).toBe(0);
    await http().get(`/links/${link.code}`).expect(404);
    await http().get(`/${link.code}`).expect(404);
    await http().delete(`/links/${link.code}`).expect(404);
  });

  it('answers 400 when deleting with a malformed code', async () => {
    await http().delete('/links/bad.code').expect(400);
  });
});

describe('custom aliases', () => {
  const createWithAlias = (alias: string, url = 'https://example.com/a') =>
    http().post('/links').send({ url, alias });

  it('creates a link under the alias and redirects through it', async () => {
    const res = await createWithAlias('docs').expect(201);

    expect(res.body).toMatchObject({
      code: 'docs',
      targetUrl: 'https://example.com/a',
      expiresAt: null,
    });
    await http()
      .get('/docs')
      .expect(302)
      .expect('Location', 'https://example.com/a');
    await http().get('/links/docs').expect(200);
  });

  it('stores the expiration date together with the alias', async () => {
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const res = await http()
      .post('/links')
      .send({ url: 'https://example.com', alias: 'docs', expiresAt })
      .expect(201);

    expect(res.body).toMatchObject({ code: 'docs', expiresAt });
  });

  it('answers 409 for a taken alias and keeps the first link', async () => {
    await createWithAlias('docs', 'https://example.com/first').expect(201);

    const res = await createWithAlias(
      'docs',
      'https://example.com/second',
    ).expect(409);

    expect(res.body).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      message: 'Alias is already taken',
      path: '/links',
    });
    await http()
      .get('/docs')
      .expect(302)
      .expect('Location', 'https://example.com/first');
  });

  it('answers 409 when the alias is a generated code of an existing link', async () => {
    const link = await createLink();

    await createWithAlias(link.code).expect(409);
  });

  it('lets exactly one of two simultaneous requests take the alias', async () => {
    const results = await Promise.all([
      createWithAlias('race', 'https://example.com/one'),
      createWithAlias('race', 'https://example.com/two'),
    ]);

    expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(await prisma().link.count({ where: { code: 'race' } })).toBe(1);
  });

  it('treats aliases that differ only in case as different links', async () => {
    await createWithAlias('Docs', 'https://example.com/upper').expect(201);
    await createWithAlias('docs', 'https://example.com/lower').expect(201);

    await http()
      .get('/Docs')
      .expect(302)
      .expect('Location', 'https://example.com/upper');
    await http()
      .get('/docs')
      .expect(302)
      .expect('Location', 'https://example.com/lower');
  });

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(33)],
    ['containing a dot', 'my.docs'],
    ['containing a space', 'my docs'],
    ['reserved', 'admin'],
    ['reserved in another case', 'API'],
    ['reserved: health', 'health'],
    ['reserved: links', 'links'],
  ])('rejects an alias that is %s', async (_name, alias) => {
    const res = await createWithAlias(alias).expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      message: 'Validation failed',
      path: '/links',
    });
    expect(await prisma().link.count()).toBe(0);
  });

  it('frees the alias when the link is deleted', async () => {
    await createWithAlias('docs', 'https://example.com/old').expect(201);
    await http().get('/docs').expect(302);

    await http().delete('/links/docs').expect(204);
    await http().get('/docs').expect(404);

    await createWithAlias('docs', 'https://example.com/new').expect(201);
    await http()
      .get('/docs')
      .expect(302)
      .expect('Location', 'https://example.com/new');
  });
});

describe('click statistics', () => {
  it('counts the clicks written by the worker', async () => {
    const link = await createLink();
    await http().get(`/${link.code}`).set('Referer', HN).expect(302);
    await http().get(`/${link.code}`).set('Referer', HN).expect(302);
    await http().get(`/${link.code}`).expect(302);

    const row = await prisma().link.findUniqueOrThrow({
      where: { code: link.code },
    });
    await waitUntil(
      async () =>
        (await prisma().clickEvent.count({ where: { linkId: row.id } })) === 3,
    );

    const res = await http().get(`/links/${link.code}/stats`).expect(200);

    expect(res.body).toMatchObject({
      code: link.code,
      totalClicks: 3,
      clicksInPeriod: 3,
      period: { days: 30 },
    });
    expect(res.body.clicksByDay).toHaveLength(30);
    expect(res.body.clicksByDay[29]).toEqual({
      date: new Date().toISOString().slice(0, 10),
      clicks: 3,
    });
    expect(res.body.topReferrers).toEqual([
      { referrer: 'news.ycombinator.com', clicks: 2 },
      { referrer: null, clicks: 1 },
    ]);
  });

  it('honours the days parameter', async () => {
    const link = await createLink();

    const res = await http()
      .get(`/links/${link.code}/stats?days=7`)
      .expect(200);

    expect(res.body.clicksByDay).toHaveLength(7);
    expect(res.body.totalClicks).toBe(0);
  });

  it('does not record clicks for 404 and 410 redirects', async () => {
    await createExpiredLink();

    await http().get('/nope123').expect(404);
    await http().get('/expired1').expect(410);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(await prisma().clickEvent.count()).toBe(0);
  });

  it('rejects unknown links and invalid parameters', async () => {
    const link = await createLink();

    await http().get('/links/nope123/stats').expect(404);
    await http().get(`/links/${link.code}/stats?days=0`).expect(400);
    await http().get(`/links/${link.code}/stats?days=400`).expect(400);
  });
});

describe('rate limiting', () => {
  it('allows 10 creations per minute and then answers 429', async () => {
    for (let i = 0; i < 10; i++) {
      await http()
        .post('/links')
        .send({ url: `https://example.com/${i}` })
        .expect(201);
    }

    const limited = await http()
      .post('/links')
      .send({ url: 'https://example.com/over' })
      .expect(429);

    expect(limited.body).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
      path: '/links',
    });
  });

  it('does not limit redirects, lists or the health check', async () => {
    const link = await createLink();

    for (let i = 0; i < 15; i++) {
      await http().get(`/${link.code}`).expect(302);
    }
    await http().get('/links').expect(200);
    await http().get('/health').expect(200);
  });
});
