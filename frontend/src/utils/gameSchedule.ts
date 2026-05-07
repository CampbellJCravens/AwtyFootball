// Returns the default kickoff for a newly-created game: the next Saturday at
// 08:45 in the user's local timezone.
//
// Saturday counts as "still today" all day — even after 08:45 — so an admin
// who creates a game on Saturday afternoon still sees a default of that
// morning's slot. Only on Sunday does the default roll forward to the
// upcoming Saturday.
export function nextSaturdayKickoff(now: Date = new Date()): Date {
  const day = now.getDay(); // 0 Sun … 6 Sat
  const daysUntilSat = day === 6 ? 0 : day === 0 ? 6 : 6 - day;
  const target = new Date(now);
  target.setDate(now.getDate() + daysUntilSat);
  target.setHours(8, 45, 0, 0);
  return target;
}

// Two timestamps share a "slot" if they fall in the same minute. Seconds and
// millis are ignored so trivial differences in how times were generated
// don't accidentally treat games as distinct.
export function sameSlot(a: Date | string, b: Date | string): boolean {
  const ta = typeof a === 'string' ? new Date(a).getTime() : a.getTime();
  const tb = typeof b === 'string' ? new Date(b).getTime() : b.getTime();
  return Math.floor(ta / 60000) === Math.floor(tb / 60000);
}

// Format a Date as the local-timezone strings <input type="date"> and
// <input type="time"> expect ("YYYY-MM-DD" and "HH:MM").
export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toTimeInputValue(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function fromDateAndTimeInput(dateValue: string, timeValue: string): Date {
  const [y, m, d] = dateValue.split('-').map(Number);
  const [hh, mm] = timeValue.split(':').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}
