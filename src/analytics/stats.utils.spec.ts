import { describe, expect, it } from 'vitest';
import { fillDays, isoDate, windowStart } from './stats.utils.js';

const NOW = new Date('2026-11-12T15:30:00.000Z');

describe('windowStart', () => {
  it('starts days-1 days before today at UTC midnight', () => {
    expect(windowStart(3, NOW).toISOString()).toBe('2026-11-10T00:00:00.000Z');
  });

  it('a one-day window starts today', () => {
    expect(isoDate(windowStart(1, NOW))).toBe('2026-11-12');
  });
});

describe('fillDays', () => {
  it('fills the days without clicks with zeros', () => {
    expect(fillDays([{ day: '2026-11-11', clicks: 4 }], 3, NOW)).toEqual([
      { date: '2026-11-10', clicks: 0 },
      { date: '2026-11-11', clicks: 4 },
      { date: '2026-11-12', clicks: 0 },
    ]);
  });

  it('ignores rows outside the window', () => {
    expect(fillDays([{ day: '2026-10-01', clicks: 9 }], 2, NOW)).toEqual([
      { date: '2026-11-11', clicks: 0 },
      { date: '2026-11-12', clicks: 0 },
    ]);
  });

  it('crosses a month boundary correctly', () => {
    const march = new Date('2026-03-02T00:00:00.000Z');
    expect(fillDays([], 3, march).map((day) => day.date)).toEqual([
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });
});
