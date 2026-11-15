import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(await verifyPassword('correct horse battery staple', hash)).toBe(
      true,
    );
    expect(await verifyPassword('correct horse battery stapl', hash)).toBe(
      false,
    );
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('stores the algorithm and its parameters, not the password', async () => {
    const hash = await hashPassword('secret-password');

    expect(hash).toMatch(
      /^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/,
    );
    expect(hash).not.toContain('secret-password');
  });

  it('salts every hash differently', async () => {
    const [first, second] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);

    expect(first).not.toBe(second);
    expect(await verifyPassword('same-password', first)).toBe(true);
    expect(await verifyPassword('same-password', second)).toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['plain text', 'not-a-hash'],
    ['another algorithm', 'bcrypt$32768$8$1$c2FsdA==$aGFzaA=='],
    ['too few parts', 'scrypt$32768$8$1$c2FsdA=='],
    ['an empty hash', 'scrypt$32768$8$1$c2FsdA==$'],
    ['non-numeric parameters', 'scrypt$a$b$c$c2FsdA==$aGFzaA=='],
  ])('rejects a stored value that is %s', async (_label, stored) => {
    expect(await verifyPassword('whatever', stored)).toBe(false);
  });
});
