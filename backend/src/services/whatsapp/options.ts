/**
 * Poll-option parsing for the WhatsApp listener.
 *
 * The group's poll options map onto our RSVP model (status + guestCount).
 * Because guests are capped at 2, the recommended option set is:
 *   "In" / "In +1" / "In +2" / "Maybe" / "Out"
 * but the parser is deliberately tolerant of common variants so the group
 * isn't forced into exact wording.
 */

export type RsvpStatus = 'yes' | 'maybe' | 'no';

export interface ParsedOption {
  status: RsvpStatus;
  guestCount: number; // 0..2
}

/** Canonical option labels we suggest the group use (for docs / admin UI). */
export const SUGGESTED_POLL_OPTIONS = ['In', 'In +1', 'In +2', 'Maybe', 'Out'] as const;

const YES_WORDS = ['in', 'yes', 'yep', 'yeah', 'going', 'attending', 'present', '✅', '👍'];
const MAYBE_WORDS = ['maybe', 'tentative', 'perhaps', 'possibly', 'unsure', 'depends', '🤷'];
const NO_WORDS = ['out', 'no', 'nope', "can't", 'cant', 'cannot', 'not', 'absent', '❌', '👎'];

const GUEST_CAP = 2;

/**
 * Parse a raw poll option label into { status, guestCount }, or null if it
 * doesn't look like an RSVP option (so unknown options are ignored, not
 * misclassified).
 */
export function parsePollOption(raw: string): ParsedOption | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  // Guest count: "+1", "+ 2", "plus 1", "(2 guests)"…
  let guestCount = 0;
  const plusMatch = text.match(/(?:\+|\bplus\b)\s*(\d+)/);
  if (plusMatch) guestCount = parseInt(plusMatch[1], 10);
  if (!Number.isFinite(guestCount) || guestCount < 0) guestCount = 0;
  if (guestCount > GUEST_CAP) guestCount = GUEST_CAP;

  const hasAny = (words: string[]) => words.some((w) => text.includes(w));

  // Order matters: check "no/out" and "maybe" before "in", since "not in"
  // contains "in". Word-boundary-ish containment keeps it simple and tolerant.
  if (hasAny(NO_WORDS)) return { status: 'no', guestCount: 0 };
  if (hasAny(MAYBE_WORDS)) return { status: 'maybe', guestCount: 0 };
  if (hasAny(YES_WORDS)) return { status: 'yes', guestCount };

  return null;
}
