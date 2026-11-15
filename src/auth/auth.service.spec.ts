import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { hashPassword } from './password.js';

function uniqueViolation() {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
  });
}

function createService() {
  const prisma = { user: { findUnique: vi.fn(), create: vi.fn() } };
  const jwt = { signAsync: vi.fn().mockResolvedValue('signed-token') };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
  );
  return { service, prisma, jwt };
}

const credentials = { email: 'nick@example.com', password: 'correct-password' };

describe('AuthService.register', () => {
  it('stores a hash, never the password, and returns a token', async () => {
    const { service, prisma, jwt } = createService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 7 });

    await expect(service.register(credentials)).resolves.toEqual({
      accessToken: 'signed-token',
    });

    const { data } = prisma.user.create.mock.calls[0]![0];
    expect(data.email).toBe('nick@example.com');
    expect(data.passwordHash).toMatch(/^scrypt\$/);
    expect(data.passwordHash).not.toContain('correct-password');
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: '7' });
  });

  it('answers 409 for a registered email without creating anything', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({ id: 1 });

    await expect(service.register(credentials)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('answers 409 when another sign-up takes the email first', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(uniqueViolation());

    await expect(service.register(credentials)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('passes other database errors through', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(new Error('connection lost'));

    await expect(service.register(credentials)).rejects.toThrow(
      'connection lost',
    );
  });
});

describe('AuthService.login', () => {
  it('returns a token for the right password', async () => {
    const { service, prisma, jwt } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 3,
      passwordHash: await hashPassword('correct-password'),
    });

    await expect(service.login(credentials)).resolves.toEqual({
      accessToken: 'signed-token',
    });
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: '3' });
  });

  it('answers 401 for a wrong password', async () => {
    const { service, prisma, jwt } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 3,
      passwordHash: await hashPassword('another-password'),
    });

    await expect(service.login(credentials)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('answers 401 with the same message for an unknown email', async () => {
    const { service, prisma, jwt } = createService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.login(credentials)).rejects.toThrow(
      'Invalid email or password',
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
