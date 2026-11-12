import { describe, expect, it } from 'vitest';
import { CODE_LENGTH, generateCode } from './code.generator.js';
import { codeSchema } from './links.schemas.js';

describe('generateCode', () => {
  it('returns a string of CODE_LENGTH characters', () => {
    const code = generateCode();
    expect(typeof code).toBe('string');
    expect(code).toHaveLength(CODE_LENGTH);
  });

  it('uses only letters and digits', () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateCode()).toMatch(/^[0-9A-Za-z]+$/);
    }
  });

  it('does not repeat across 1000 generated codes', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateCode()));
    expect(codes.size).toBe(1000);
  });

  it('always produces codes that the redirect route accepts', () => {
    for (let i = 0; i < 1000; i++) {
      expect(codeSchema.safeParse(generateCode()).success).toBe(true);
    }
  });
});
