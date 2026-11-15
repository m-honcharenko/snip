import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt from node:crypto: memory-hard, no native dependency to build.
// The parameters are stored in every hash, so they can be raised later
// without breaking the passwords that are already saved.
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;

function derive(
  password: string,
  salt: Buffer,
  keyLength: number,
  cost: number,
  blockSize: number,
  parallelization: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      {
        N: cost,
        r: blockSize,
        p: parallelization,
        // scrypt needs about 128 * N * r bytes; the default limit is lower
        maxmem: 256 * cost * blockSize,
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

// Format: scrypt$N$r$p$salt$hash (salt and hash are base64)
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(
    password,
    salt,
    KEY_LENGTH,
    COST,
    BLOCK_SIZE,
    PARALLELISM,
  );
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, cost, blockSize, parallelization, salt, hash] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const expected = Buffer.from(hash, 'base64');
  const params = [Number(cost), Number(blockSize), Number(parallelization)];
  if (expected.length === 0 || !params.every(Number.isSafeInteger)) {
    return false;
  }

  const actual = await derive(
    password,
    Buffer.from(salt, 'base64'),
    expected.length,
    params[0]!,
    params[1]!,
    params[2]!,
  );
  return timingSafeEqual(actual, expected);
}
