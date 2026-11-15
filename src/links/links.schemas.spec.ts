import { describe, expect, it } from 'vitest';
import {
  codeSchema,
  createLinkSchema,
  listLinksQuerySchema,
} from './links.schemas.js';

describe('codeSchema', () => {
  it.each(['aB3dE9k', 'a', 'my-alias_1', 'x'.repeat(64)])(
    'accepts %s',
    (code) => {
      expect(codeSchema.safeParse(code).success).toBe(true);
    },
  );

  it.each(['', 'bad.code', 'with space', 'ä', 'a/b', 'x'.repeat(65)])(
    'rejects %j',
    (code) => {
      expect(codeSchema.safeParse(code).success).toBe(false);
    },
  );
});

describe('listLinksQuerySchema', () => {
  it('applies defaults', () => {
    expect(listLinksQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('coerces strings to numbers', () => {
    expect(listLinksQuerySchema.parse({ page: '2', limit: '10' })).toEqual({
      page: 2,
      limit: 10,
    });
  });

  it.each([
    { page: '0' },
    { page: '1.5' },
    { page: 'abc' },
    { limit: '0' },
    { limit: '101' },
  ])('rejects %j', (query) => {
    expect(listLinksQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('createLinkSchema alias', () => {
  const parseAlias = (alias: unknown) =>
    createLinkSchema.safeParse({ url: 'https://example.com', alias });

  it('is optional', () => {
    expect(
      createLinkSchema.safeParse({ url: 'https://example.com' }).success,
    ).toBe(true);
  });

  it.each(['abc', 'docs', 'My-Docs_2026', 'a'.repeat(32)])(
    'accepts %s',
    (alias) => {
      const result = parseAlias(alias);
      expect(result.success).toBe(true);
      expect(result.data?.alias).toBe(alias);
    },
  );

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(33)],
    ['with a space', 'my docs'],
    ['with a slash', 'my/docs'],
    ['with a dot', 'my.docs'],
    ['with a non-ASCII letter', 'докс'],
    ['empty', ''],
  ])('rejects an alias that is %s', (_label, alias) => {
    expect(parseAlias(alias).success).toBe(false);
  });

  it('rejects a non-string alias', () => {
    expect(parseAlias(123).success).toBe(false);
  });

  it.each(['api', 'health', 'links', 'admin', 'API', 'Health', 'LiNkS'])(
    'rejects the reserved alias %s regardless of case',
    (alias) => {
      const result = parseAlias(alias);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('This alias is reserved');
    },
  );

  it('does not reject an alias that only contains a reserved word', () => {
    expect(parseAlias('api-docs').success).toBe(true);
  });
});
