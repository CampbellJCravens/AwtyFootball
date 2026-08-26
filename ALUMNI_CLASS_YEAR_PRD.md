# PRD — Alumni Class Year and Alumni Filter

Status: **APPROVED 2026-08-23, building.**
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-08-23

---

## Problem

`Player.isAlumni` is a boolean and nothing more. The club has **16 alumni**
(15 on the current roster, 1 former) and no record of when any of them
graduated, so there is no way to say "class of 2019" or to pull up the alumni as
a group. Two asks:

1. A place on an alumni player's profile to record the year they graduated.
2. A way to filter the player list down to alumni.

## What already exists, and what this must not disturb

- **`isAlumni`** drives two things and both stay untouched: the alumni-% column
  in Field Stats, and the **dues exemption** (`dues.ts:299-300` — alumni are
  billed $0, deliberately, "alumni are exempt by nature"). The 2027 roster
  already prices 14 alumni at zero against the $6,000 target.
- ⚠️ **`memberSince` is NOT a graduation year.** It is the first dues year,
  hand-seeded, set on 52 of 69 players. Morgan-Sean reads `since 2010`, Milad
  `since 2026`. Conflating the two would corrupt dues tenure, so this is a
  **new, separate field**.

## Success criteria

- An admin can set and clear a graduation year on any alumni player.
- The year shows on that player's profile.
- The player list can be narrowed to alumni in one tap.
- A non-alumni player has nowhere to enter a year, and nothing about their
  profile changes.
- Dues, the alumni-% stat, and roster membership all behave exactly as today.

## Design

### The field

`Player.graduationYear Int?` — nullable, because 16 of 16 start unknown and a
blank must read as "not entered yet" rather than a wrong number.

**Shown only when `isAlumni` is true.** A graduation year on a non-alumnus is
meaningless and an empty field invites someone to fill it in.

Validation: **1950 – current year + 10**, or empty. The upper bound allows a
current student who has already been marked alumni-to-be; the lower is a
sanity floor. Out of range is refused with a message, never silently coerced.

### Where it is edited

`EditPlayerModal`, directly under the existing Alumni toggle, appearing when
Alumni is selected. That modal is now scrollable (`60f41e4`), so adding a field
no longer risks pushing Save off-screen — but this is the form that just broke
that way, so the addition goes below the toggle and above the buttons, and the
smoke check includes reaching Save on a phone.

### Where it is displayed

`PlayerProfile`, in the hero block beside the name — `Class of 2019` — rendered
only when both `isAlumni` and `graduationYear` are set. Visible to anyone who
can see the profile; **editable by admins only**, matching every other player
edit (the pencil is behind `showActions={isAdmin}`).

### The filter

A single **Alumni** chip beside the existing search box in `PlayerList`, which
today filters by name only. Tapping it narrows both the Current Roster and Prior
Members sections; the counts in the section headers follow. Tapping again
clears it.

**Search also matches the year** — typing `2019` finds the class of 2019
alongside anyone with 2019 in their name. Free, and it is what someone will try.

## Scope

**In.** The column, the conditional field in the edit modal, the profile line,
the filter chip, and year-aware search.

**Out.** A class-year column in Field Stats or any award. Grouping the roster by
class. Anything tying graduation year to dues — the exemption is on `isAlumni`
and stays there. Backfilling years by guesswork.

## Migration

Additive, one nullable column, no data touched. Use the established recipe from
`GUEST_NAMES_AND_HOSTS_PRD.md`:

1. `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script` — expect exactly one `ALTER TABLE ... ADD COLUMN`, no DROP.
2. **Bare `npx prisma db push`, never `--accept-data-loss`.** The bare command
   refuses anything destructive, which is the safety catch.
3. Verify player count unchanged (69) before and after.

🔴 **The standing trap applies:** `npm run build` in `backend/` runs
`prisma db push --accept-data-loss` against `DATABASE_URL`, which is production
in the local `.env`. Typecheck with `npx tsc --noEmit` instead, and let the push
be a deliberate step.

**Deploy order matters.** The column must exist in production before a frontend
that sends `graduationYear` reaches anyone — same ordering risk as the
`secondHalfStart` enum. Schema push first, backend next, frontend last.

## Plan

| Phase | Work | Verify |
| --- | --- | --- |
| 0 | Schema column + zod + players route serialize/accept | `migrate diff` shows one additive ALTER; bare push; `/health` commit marker moves |
| 1 | Edit modal field, gated on the Alumni toggle | Range validation rejects 1899 and accepts empty |
| 2 | Profile line + filter chip + year-aware search | `tsc --noEmit` both packages, frontend prod build |

Estimate: half a day, most of it phase 2. Phase 3 (seeding) dropped — owner
enters the years himself.

## Resolved (owner, 2026-08-23)

1. 🔑 **`isAlumni` is doing double duty on purpose and stays that way.** It means
   "school-affiliated and therefore dues-exempt", which is broader than
   "graduated": "Dad - Deno" and "Dad - Yasek" are dads of the school whose
   *children* are alumni, and the owner is explicit that **they should be exempt
   either way**. Do not split or rename the flag.

   The design consequence is the important one: **a blank class year is a
   normal, permanent state for some alumni, not missing data.** Nothing may
   nag, badge, or report it as incomplete, and the field is labelled as a class
   year rather than phrased as though everyone graduated.
2. **The profile line is public** — a school year, not contact information, on a
   profile that already shows achievements and percentiles.
3. **No seeding.** The owner will enter years by hand; he only needs the ability.
   Phase 3 is dropped.

## Sign-off

- [x] Owner approved scope, 2026-08-23
- [x] All three questions answered
- [ ] Schema pushed and verified before the frontend ships
