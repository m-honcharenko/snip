const DAY_MS = 24 * 60 * 60 * 1000;

export type DayRow = { day: string; clicks: number };

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

// First day of a window that ends today and is `days` days long (inclusive)
export function windowStart(days: number, now: Date = new Date()): Date {
  return new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// SQL returns only the days that had clicks; charts need the empty days too
export function fillDays(
  rows: DayRow[],
  days: number,
  now: Date = new Date(),
): { date: string; clicks: number }[] {
  const counts = new Map(rows.map((row) => [row.day, row.clicks]));
  const start = windowStart(days, now);
  return Array.from({ length: days }, (_, index) => {
    const date = isoDate(new Date(start.getTime() + index * DAY_MS));
    return { date, clicks: counts.get(date) ?? 0 };
  });
}
