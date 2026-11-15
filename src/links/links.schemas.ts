import { z } from 'zod';
import { isPublicHttpUrl } from './url-policy.js';

export const MAX_URL_LENGTH = 2048;

// Paths that already belong to the app. Express routing is case-insensitive,
// so the check lowercases the alias.
const RESERVED_ALIASES = new Set(['api', 'health', 'links', 'admin']);

export const createLinkSchema = z.object({
  url: z
    .url({ protocol: /^https?$/ })
    .max(MAX_URL_LENGTH)
    .refine(isPublicHttpUrl, {
      message: 'URL must be a public http(s) address',
    })
    .describe('Public http(s) URL to shorten'),
  alias: z
    .string()
    .min(3)
    .max(32)
    .regex(
      /^[A-Za-z0-9_-]+$/,
      'Alias may contain only letters, digits, "-" and "_"',
    )
    .refine((value) => !RESERVED_ALIASES.has(value.toLowerCase()), {
      message: 'This alias is reserved',
    })
    .describe('Custom short code (3 to 32 characters), optional')
    .optional(),
  expiresAt: z.iso
    .datetime()
    .describe('Expiration date (ISO 8601), must be in the future')
    .optional(),
});

export type CreateLinkInput = z.infer<typeof createLinkSchema>;

export const listLinksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListLinksQuery = z.infer<typeof listLinksQuerySchema>;

export const codeSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid link code')
  .describe('Short link code');

export const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type StatsQuery = z.infer<typeof statsQuerySchema>;
