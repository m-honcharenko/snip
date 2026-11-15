import { z } from 'zod';

export const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(254))
    .describe('Email address, stored in lower case'),
  password: z
    .string()
    .min(8)
    .max(128)
    .describe('Password, 8 to 128 characters'),
});

export type Credentials = z.infer<typeof credentialsSchema>;
