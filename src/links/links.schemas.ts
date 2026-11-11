import { z } from 'zod';
import { isPublicHttpUrl } from './url-policy.js';

export const MAX_URL_LENGTH = 2048;

export const createLinkSchema = z.object({
  url: z
    .url({ protocol: /^https?$/ })
    .max(MAX_URL_LENGTH)
    .refine(isPublicHttpUrl, {
      message: 'URL must be a public http(s) address',
    })
    .describe('Public http(s) URL to shorten'),
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
