import { customAlphabet } from 'nanoid';

const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const CODE_LENGTH = 7;

export const generateCode = customAlphabet(ALPHABET, CODE_LENGTH);
