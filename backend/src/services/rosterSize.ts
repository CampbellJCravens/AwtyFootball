// Which roster a game's Response% and Show% are measured against, and how big
// that roster was on the day.
//
// The roster for next year is settled in October/November. From the day the
// owner closes it, the people who are actually in the group are next year's
// roster, so that is the denominator, even though the game itself still belongs
// to the calendar year it was played in for every other stat.
//
// Size comes from the dues roster when the year has one (members on it that
// day), and from the club sheet's fixed numbers for the years before dues
// existed in the app.

export interface RosterYearLike {
  duesYear: number;
  rosterClosedAt: Date | null;
}

export interface RosterEntryLike {
  duesYear: number;
  joinedAt: Date | null;
  leftAt: Date | null;
}

export interface RosterOnDate {
  rosterYear: number;
  size: number | null;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** The roster year a game on `isoDate` (yyyy-mm-dd) is measured against. */
export function rosterYearFor(isoDate: string, configs: RosterYearLike[]): number {
  const year = Number(isoDate.slice(0, 4));
  const next = configs.find(c => c.duesYear === year + 1);
  return next?.rosterClosedAt && isoDate >= day(next.rosterClosedAt) ? year + 1 : year;
}

export function rosterOn(
  isoDate: string,
  configs: RosterYearLike[],
  entries: RosterEntryLike[],
  sheetSize: (year: number) => number | null,
): RosterOnDate {
  const rosterYear = rosterYearFor(isoDate, configs);
  const ofYear = entries.filter(e => e.duesYear === rosterYear);
  if (ofYear.length === 0) return { rosterYear, size: sheetSize(rosterYear) };
  const size = ofYear.filter(
    e => (!e.joinedAt || day(e.joinedAt) <= isoDate) && (!e.leftAt || day(e.leftAt) > isoDate),
  ).length;
  return { rosterYear, size };
}
