# PRD — Roster close-out drives Response% and Show%

Status: DRAFT, awaiting sign-off. Owner: Morgan-Sean. Drafted 2026-11-12.
Owner decision already taken (2026-11-12): option **B** — after the roster for next year is closed, Response% and Show% are measured against the new roster; goals, awards, streaks, reports and guest billing stay on the calendar year.

## Problem
1. The roster size per year is a hand-edited table in code (`ROSTER_BY_YEAR`, `backend/src/routes/stats.ts:1216`). Every November someone has to be told a number and ship a deploy.
2. The number already exists in the app. The 2027 dues roster holds 64 entries, 25 marked left, 39 active: exactly the figure the owner supplied by hand.
3. Between close-out (October/November) and 31 December, games are still measured against the old roster. A turnout of 20 reads as 36% against 2026's 55 and 51% against the 39 who are actually in the group.
4. "Closed" is not recorded anywhere. For 2027, members were marked left on six separate days between 30 Sep and 12 Nov 2026, so the close cannot be inferred from the data; it has to be stated.

## What does not change
- **A game in November 2026 is a 2026 game** for goals, assists, awards, achievements, Highlander, monthly and yearly reports, and guest billing. Only the Response% / Show% denominator moves.
- Stored sheet rates still win where they exist (history before the app); this only touches live-computed rates.
- Years with no dues roster (2018–2026) keep their numbers from the existing table.

## Success criteria
1. Closing the 2027 roster in the Dues tab needs no code change and no deploy for stats to use it.
2. Every game on or after the close date is measured against the members active in the 2027 dues roster on that game's date. Game #46 (14 Nov 2026) reads against 39.
3. Games before the close date read exactly as they do today (55 for 2026).
4. Re-opening the roster (undo) restores the old behaviour with no data lost.
5. Field Stats shows where the roster changed, so a jump in the percentages is explained on the page.
6. `ROSTER_BY_YEAR` never needs a new entry again.

## Design
- **Schema (additive, nullable):** `DuesYearConfig.rosterClosedAt DateTime?`. Pushed to prod BEFORE the code deploys.
- **Dues tab (admin):** on the year's header, "Close the 2027 roster" with a date (defaults to today) and a confirm line stating the effect: "Games from <date> are measured against N members." Once closed it shows "Roster closed <date> · N members" with Change date / Re-open.
- **Which roster a game uses:** for a game on date D in calendar year Y: if year Y+1 has `rosterClosedAt` and D is on or after it, use Y+1's roster; otherwise Y's.
- **Roster size on a date:** if that year has dues roster entries, count entries with (`joinedAt` null or on/before D) and (`leftAt` null or after D). Otherwise fall back to `ROSTER_BY_YEAR`. One pure function, `rosterSizeOn(date, configs, entries)`, with assertions.
- **Field Stats:** the row group keeps its calendar year. A thin divider row "2027 roster · 39 members from 14 Nov" sits above the first game measured against the new roster.
- **Remove** the hand-added `2027: 39` from the table once the dues-driven path is live, so there is one source.

## Scope
In: the column, the close / change / re-open control, the size function and its use in `GET /api/stats/field-stats`, the divider, assertions.
Out: moving any other stat to the roster year; changing who counts as having responded or shown; the Reliability tab and turnout projection (they use their own active-window logic); backfilling a close date for earlier years.

## Constraints
- Additive column pushed first; the build no longer accepts data loss, so a wrong schema change stops the deploy.
- Not merged on a Saturday morning. Game #46 is on 14 Nov.
- Both packages type-check; assertions run in CI.

## Plan
1. Branch off `main`: schema + `rosterSizeOn` + assertions + endpoint use.
2. Dues tab control + Field Stats divider.
3. `prisma db push` (additive) to prod, then merge and deploy; verify with the public field-stats endpoint that pre-close games are unchanged.
4. Owner closes the 2027 roster in the app; verify game #46 reads against 39.

## Risks
- **Mid-year movement changes past percentages slightly.** Because size is counted on each game's date, marking someone left later does not rewrite earlier games, but correcting a `leftAt` date after the fact does. Acceptable; it is the true roster.
- **The 17 dues-exempt members are in the 39.** They are on the roster and expected to respond, so they count. If the owner wants only billed members, the number would be 22 and the rule needs to say so.
- **A close date set too early** re-measures games already played. The confirm line shows the first affected game before saving.

## Open questions
1. Close date for 2027: today, 12 Nov 2026, so game #46 on 14 Nov is the first measured against 39? Or an earlier date (the first members were marked left on 30 Sep)?
2. Do the 17 dues-exempt members (alumni and school dads) count in the roster size? The 39 you gave includes them, so the draft says yes.
