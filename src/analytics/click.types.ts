export const CLICKS_QUEUE = 'clicks';

export type ClickJobData = {
  code: string;
  clickedAt: string;
  referrer: string | null;
  userAgent: string | null;
  ipHash: string | null;
};
