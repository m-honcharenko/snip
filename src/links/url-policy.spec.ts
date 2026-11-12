import { describe, expect, it } from 'vitest';
import { isPublicHttpUrl } from './url-policy.js';

describe('isPublicHttpUrl', () => {
  it.each([
    'https://example.com',
    'http://example.com/path?x=1',
    'https://sub.example.co.uk',
    'https://8.8.8.8/',
    'http://172.32.0.1', // just outside 172.16.0.0/12
  ])('allows %s', (url) => {
    expect(isPublicHttpUrl(url)).toBe(true);
  });

  it.each([
    'ftp://example.com',
    'http://localhost:3000',
    'http://LOCALHOST',
    'http://localhost.',
    'http://app.localhost',
    'http://printer.local',
    'http://intranet',
    'http://127.0.0.1',
    'http://127.1',
    'http://2130706433',
    'http://0x7f000001',
    'http://10.0.0.5',
    'http://172.16.5.1',
    'http://192.168.1.1',
    'http://169.254.169.254',
    'http://0.0.0.0',
    'http://[::1]',
    'http://[fe80::1]',
    'http://[fd00::1]',
    'http://[::ffff:127.0.0.1]',
    'http://user:pass@example.com',
    'not an url',
    '',
  ])('blocks %s', (url) => {
    expect(isPublicHttpUrl(url)).toBe(false);
  });
});
