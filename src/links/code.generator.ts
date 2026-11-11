import { customAlphabet } from 'nanoid';

const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const CODE_LENGTH = 7;

// Codes are random (nanoid, base62, 7 chars ≈ 3.5e12 combinations) rather than
// base62 of the auto-increment ID: random codes can't be enumerated or guessed
// from a neighbour's link, and can be generated before the INSERT.
// A collision is possible but rare: the unique index on Link.code catches it,
// and LinksService retries with a new code on a unique violation (P2002).
export const generateCode = customAlphabet(ALPHABET, CODE_LENGTH);
