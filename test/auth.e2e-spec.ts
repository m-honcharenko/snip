import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, resetState } from './support/test-app.js';

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

const credentials = { email: 'nick@example.com', password: 'correct-password' };
const JWT_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;

describe('registration', () => {
  it('creates an account and returns a token that works', async () => {
    const res = await http()
      .post('/auth/register')
      .send(credentials)
      .expect(201);

    expect(res.body.accessToken).toMatch(JWT_PATTERN);
    await http()
      .get('/links')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
  });

  it('stores a hash, never the password', async () => {
    await http().post('/auth/register').send(credentials).expect(201);

    const user = await prisma().user.findUniqueOrThrow({
      where: { email: credentials.email },
    });
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(user.passwordHash).not.toContain(credentials.password);
  });

  it('normalizes the email', async () => {
    await http()
      .post('/auth/register')
      .send({ ...credentials, email: '  Nick@Example.COM ' })
      .expect(201);

    await http().post('/auth/login').send(credentials).expect(200);
  });

  it('answers 409 for a registered email, in any case', async () => {
    await http().post('/auth/register').send(credentials).expect(201);

    const res = await http()
      .post('/auth/register')
      .send({ ...credentials, email: 'NICK@example.com' })
      .expect(409);

    expect(res.body).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      message: 'Email is already registered',
      path: '/auth/register',
    });
    expect(await prisma().user.count()).toBe(1);
  });

  it('lets exactly one of two simultaneous sign-ups win', async () => {
    const results = await Promise.all([
      http().post('/auth/register').send(credentials),
      http().post('/auth/register').send(credentials),
    ]);

    expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(await prisma().user.count()).toBe(1);
  });

  it.each([
    ['a missing email', { password: 'correct-password' }],
    ['a malformed email', { email: 'nick', password: 'correct-password' }],
    ['a short password', { email: 'nick@example.com', password: '1234567' }],
    ['a missing password', { email: 'nick@example.com' }],
  ])('rejects %s with the unified error format', async (_name, body) => {
    const res = await http().post('/auth/register').send(body).expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      message: 'Validation failed',
      path: '/auth/register',
    });
    expect(res.body.details.length).toBeGreaterThan(0);
    expect(await prisma().user.count()).toBe(0);
  });
});

describe('login', () => {
  beforeEach(async () => {
    await http().post('/auth/register').send(credentials).expect(201);
  });

  it('returns a token that works', async () => {
    const res = await http().post('/auth/login').send(credentials).expect(200);

    expect(res.body.accessToken).toMatch(JWT_PATTERN);
    await http()
      .get('/links')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
  });

  it('answers 401 with the same message for a wrong password and an unknown email', async () => {
    const wrongPassword = await http()
      .post('/auth/login')
      .send({ ...credentials, password: 'wrong-password' })
      .expect(401);
    const unknownEmail = await http()
      .post('/auth/login')
      .send({ ...credentials, email: 'nobody@example.com' })
      .expect(401);

    expect(wrongPassword.body).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid email or password',
      path: '/auth/login',
    });
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('rejects a malformed body with 400', async () => {
    await http().post('/auth/login').send({ email: 'nick' }).expect(400);
  });

  it('allows 10 attempts per minute and then answers 429', async () => {
    for (let i = 0; i < 10; i++) {
      await http()
        .post('/auth/login')
        .send({ ...credentials, password: 'wrong-password' })
        .expect(401);
    }

    const limited = await http()
      .post('/auth/login')
      .send(credentials)
      .expect(429);

    expect(limited.body).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
      path: '/auth/login',
    });
  });
});
