import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { fillDays, isoDate, windowStart, type DayRow } from './stats.utils.js';

type ReferrerRow = { referrer: string | null; clicks: number };

@Injectable()
export class ClickStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async forLink(linkId: number, days: number) {
    const start = windowStart(days);
    // "clickedAt" is a timestamp without time zone (always UTC): pass the bound as
    // text and cast it, so the result doesn't depend on the session time zone.
    const since = start.toISOString();

    const [totalClicks, dayRows, topReferrers] = await Promise.all([
      this.prisma.clickEvent.count({ where: { linkId } }),
      this.prisma.$queryRaw<DayRow[]>`
        SELECT to_char("clickedAt", 'YYYY-MM-DD') AS day, count(*)::int AS clicks
        FROM "ClickEvent"
        WHERE "linkId" = ${linkId} AND "clickedAt" >= ${since}::timestamp
        GROUP BY 1
        ORDER BY 1`,
      this.prisma.$queryRaw<ReferrerRow[]>`
        SELECT substring("referrer" from '^[A-Za-z][A-Za-z0-9+.-]*://([^/:?#]+)') AS referrer,
              count(*)::int AS clicks
        FROM "ClickEvent"
        WHERE "linkId" = ${linkId} AND "clickedAt" >= ${since}::timestamp
        GROUP BY 1
        ORDER BY clicks DESC, referrer ASC NULLS LAST
        LIMIT 10`,
    ]);

    return {
      totalClicks,
      period: { from: isoDate(start), to: isoDate(new Date()), days },
      clicksInPeriod: dayRows.reduce((sum, row) => sum + row.clicks, 0),
      clicksByDay: fillDays(dayRows, days),
      topReferrers,
    };
  }
}
