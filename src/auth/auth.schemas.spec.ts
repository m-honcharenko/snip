import { describe, expect, it } from 'vitest';
import { credentialsSchema } from './auth.schemas.js';

describe('credentialsSchema', () => {
  it('trims and lower-cases the email', () => {
    const result = credentialsSchema.parse({
      email: '  Nick@Example.COM ',
      password: 'long-enough',
    });

    expect(result.email).toBe('nick@example.com');
  });

  it('keeps the password as it is', () => {
    const result = credentialsSchema.parse({
      email: 'nick@example.com',
      password: '  spaces stay  ',
    });

    expect(result.password).toBe('  spaces stay  ');
  });

  it.each([
    ['a missing email', { password: 'long-enough' }],
    ['a malformed email', { email: 'nick', password: 'long-enough' }],
    ['an empty email', { email: '', password: 'long-enough' }],
    [
      'an email over 254 characters',
      { email: `${'a'.repeat(250)}@example.com`, password: 'long-enough' },
    ],
    ['a missing password', { email: 'nick@example.com' }],
    ['a short password', { email: 'nick@example.com', password: '1234567' }],
    [
      'a long password',
      { email: 'nick@example.com', password: 'a'.repeat(129) },
    ],
    [
      'a non-string password',
      { email: 'nick@example.com', password: 12345678 },
    ],
  ])('rejects %s', (_label, input) => {
    expect(credentialsSchema.safeParse(input).success).toBe(false);
  });

  it('accepts the length limits', () => {
    expect(
      credentialsSchema.safeParse({
        email: 'nick@example.com',
        password: 'a'.repeat(8),
      }).success,
    ).toBe(true);
    expect(
      credentialsSchema.safeParse({
        email: 'nick@example.com',
        password: 'a'.repeat(128),
      }).success,
    ).toBe(true);
  });
});
