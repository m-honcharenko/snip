import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { type AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard.js';

function createGuard(verifyAsync = vi.fn()) {
  const guard = new JwtAuthGuard({ verifyAsync } as unknown as JwtService);
  const run = (authorization?: string) => {
    const request: AuthenticatedRequest = { headers: { authorization } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { request, result: guard.canActivate(context) };
  };
  return { run, verifyAsync };
}

describe('JwtAuthGuard', () => {
  it('lets a valid token in and exposes the user id', async () => {
    const { run, verifyAsync } = createGuard(
      vi.fn().mockResolvedValue({ sub: '5' }),
    );

    const { request, result } = run('Bearer good-token');

    await expect(result).resolves.toBe(true);
    expect(verifyAsync).toHaveBeenCalledWith('good-token');
    expect(request.user).toEqual({ id: 5 });
  });

  it('accepts the scheme in any case', async () => {
    const { run } = createGuard(vi.fn().mockResolvedValue({ sub: '5' }));

    await expect(run('bearer good-token').result).resolves.toBe(true);
  });

  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['another scheme', 'Basic abc'],
    ['a scheme without a token', 'Bearer'],
    ['a scheme and a blank token', 'Bearer '],
  ])('rejects %s without verifying anything', async (_label, header) => {
    const { run, verifyAsync } = createGuard();

    await expect(run(header).result).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a token that fails verification', async () => {
    const { run } = createGuard(
      vi.fn().mockRejectedValue(new Error('expired')),
    );

    const { request, result } = run('Bearer bad-token');

    await expect(result).rejects.toThrow('Invalid or expired token');
    expect(request.user).toBeUndefined();
  });

  it.each([
    ['a missing sub', {}],
    ['a non-numeric sub', { sub: 'abc' }],
    ['a numeric (not string) sub', { sub: 5 }],
    ['a zero sub', { sub: '0' }],
    ['a negative sub', { sub: '-1' }],
    ['a fractional sub', { sub: '1.5' }],
  ])('rejects a token with %s', async (_label, payload) => {
    const { run } = createGuard(vi.fn().mockResolvedValue(payload));

    await expect(run('Bearer token').result).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
