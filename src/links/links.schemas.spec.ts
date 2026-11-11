import { describe, expect, it } from 'vitest';
import { codeSchema, listLinksQuerySchema } from './links.schemas.js';

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
