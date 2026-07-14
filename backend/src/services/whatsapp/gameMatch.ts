/**
 * Best-effort matching of a WhatsApp poll to a Game by the date in the poll
 * title (e.g. "Football Sun Jul 20?", "RSVP 7/20", "Game 20 July").
 *
 * Games are weekly, and Game.createdAt is the game date. We parse a date from
 * the title and match the closest game within a few days. If the title has no
 * confidently-parseable date, we return null and leave it for an admin to link
 * manually — auto-match is a convenience, not the source of truth.
 */
import prisma from '../../prisma';

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MATCH_WINDOW_DAYS = 4; // weekly games ⇒ a ±4-day window is unambiguous

/** Extract a date from free text, or null. Assumes US month/day ordering. */
export function parseDateFromTitle(title: string, now = new Date()): Date | null {
  const text = title.toLowerCase();
  const year = now.getFullYear();

  const build = (y: number, m: number, d: number): Date | null => {
    if (m < 0 || m > 11 || d < 1 || d > 31) return null;
    const dt = new Date(y, m, d);
    // Titles usually omit the year; if the date reads as far in the past,
    // assume they mean next year's occurrence.
    if (dt.getTime() < now.getTime() - 180 * DAY_MS) dt.setFullYear(y + 1);
    return dt;
  };

  // ISO: 2026-07-20
  let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return build(+m[1], +m[2] - 1, +m[3]);

  // Month name + day: "jul 20", "july 20th"
  m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/);
  if (m) return build(year, MONTHS[m[1]], +m[2]);

  // Day + month name: "20 july", "20th jul"
  m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  if (m) return build(year, MONTHS[m[2]], +m[1]);

  // Numeric M/D or M/D/Y (US ordering); if first field > 12 treat as D/M.
  m = text.match(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/);
  if (m) {
    let mm = +m[1], dd = +m[2];
    if (mm > 12 && dd <= 12) [mm, dd] = [dd, mm];
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year;
    return build(y, mm - 1, dd);
  }

  return null;
}

/** Same calendar day distance in days between two dates (local time). */
function dayDistance(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.abs(Math.round((da.getTime() - db.getTime()) / DAY_MS));
}

/**
 * Find the gameId whose date best matches the poll title, or null if the title
 * has no parseable date or no game falls within the match window.
 */
export async function findGameForPollTitle(title: string): Promise<string | null> {
  const target = parseDateFromTitle(title);
  if (!target) return null;

  const games = await prisma.game.findMany({
    select: { id: true, createdAt: true },
  });
  if (games.length === 0) return null;

  let best: { id: string; dist: number } | null = null;
  for (const g of games) {
    const dist = dayDistance(target, g.createdAt);
    if (best === null || dist < best.dist) best = { id: g.id, dist };
  }

  return best && best.dist <= MATCH_WINDOW_DAYS ? best.id : null;
}
