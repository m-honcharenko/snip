import { z } from 'zod';

export const MAX_URL_LENGTH = 2048;

export const createLinkSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(MAX_URL_LENGTH),
  expiresAt: z.iso.datetime().optional(),
});

export type CreateLinkInput = z.infer<typeof createLinkSchema>;
