import { z } from 'zod';
import { isPublicHttpUrl } from './url-policy.js';

export const MAX_URL_LENGTH = 2048;

export const createLinkSchema = z.object({
  url: z
    .url({ protocol: /^https?$/ })
    .max(MAX_URL_LENGTH)
    .refine(isPublicHttpUrl, {
      message: 'URL must be a public http(s) address',
    }),
  expiresAt: z.iso.datetime().optional(),
});

export type CreateLinkInput = z.infer<typeof createLinkSchema>;
