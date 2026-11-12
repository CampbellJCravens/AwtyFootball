/*
 * Who may write which Player fields.
 *
 * Members are anonymous by design: someone picks their player on their own
 * device and, with no sign-in, RSVPs, uploads their photo and adds their phone.
 * Those stay open. Everything else on a player now decides money or attribution
 * (isAlumni is the dues exemption, phone is whose WhatsApp votes count), so it
 * is admin-only.
 */
const ANYONE_CREATE = new Set(['name']);
const ANYONE_UPDATE = new Set(['pictureUrl', 'phone']);

/** Fields in `data` the caller may not write. Empty = allowed. */
export function refusedPlayerFields(opts: {
  isAdmin: boolean;
  mode: 'create' | 'update';
  data: Record<string, unknown>;
  /** update only: the player already has a phone on file. */
  hasPhone?: boolean;
}): string[] {
  if (opts.isAdmin) return [];
  const allowed = opts.mode === 'create' ? ANYONE_CREATE : ANYONE_UPDATE;
  return Object.keys(opts.data).filter(key => {
    if (opts.data[key] === undefined) return false;
    if (!allowed.has(key)) return true;
    // Adding a missing number is self-service; replacing or clearing one moves
    // someone's WhatsApp votes, so that takes an admin.
    return key === 'phone' && !!opts.hasPhone;
  });
}
