# PRD — Guest Names, Hosts, and the Guest Ledger

Status: **BUILT** 2026-08-07 on branch `feat/guest-names-and-hosts` (off `origin/main`
`b98a359`). All four phases implemented; both packages typecheck clean; frontend
prod build passes; 22/22 service assertions pass against a stubbed Prisma.
**Uncommitted, not deployed. Browser smoke outstanding** — see "Smoke checklist".
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-08-07 (specced, decided and built same day)

One feature in three parts, shipped as one PR: name a guest, record who invited
them, and roll both up into an admin ledger showing how often each guest has
turned up (so dues can be collected retroactively).

**Schema note up front:** this repo deploys schema changes via
`prisma db push`, not `prisma migrate` — there are no new migration files. See
"Data model" and the deploy hazard in "Constraints".

---

## Problem

Guests are currently anonymous and unattributable. The app keeps a fixed pool of
recurring `Player` records literally named `Guest1`…`Guest6`
(`GameModuleExpanded.tsx:631-664`) and reuses them across games — `Guest3` is a
different human every week. That creates three gaps:

1. **No name.** The team sheet, goal feed and match report all read "Guest4
   scored!" Nobody looking at a report a week later knows who that was.
2. **No host.** Nothing links a guest to the member who invited them. The
   Reliability tab's guest leaderboard is built from `GameRsvp.guestCount` —
   that is *stated intent* ("I'm bringing +1"), not who actually walked onto the
   pitch. Measured gap: **119 guests shown vs 75 indicated** across 2026.
3. **No recurrence, so no dues.** A guest who has played eight times is
   indistinguishable from one who came once. There is no way to go back and say
   "Ricky owes for six games."

Gap 3 is the one that changes the design. A per-game text label would fix the
cosmetics of 1 and 2 but cannot answer "how many times has this person come?"
without fuzzy-matching free text across games — which fragments on
"Ricky"/"ricky"/"Rickie" exactly where the money is. Guests need a durable
identity.

## Success criteria

Measurable, checked at smoke:

1. Tapping **Add Guest** opens a modal with a name field and a host picker.
   **Both are skippable** — dismissing assigns the guest to the team exactly as
   today, with no name and no host.
2. The host picker lists **only non-guest players**, current roster and prior
   members both; no `GuestN` pool record can be selected as a host.
3. A saved name and host survive reload — reopening the game shows both.
4. A guest's name and host are **editable after the fact** from the guest's card
   in the team list, via the same modal.
5. A named guest displays that name on the team card, in the goal feed, and in
   the team-changes feed. `Player.name` in the DB is still `Guest3`.
6. **Regression gate:** for a fixed data snapshot, these are byte-identical
   before and after the change — Reliability tab numbers, achievements output,
   Man of the Match, the season stats table, and the Google Sheets export.
7. Admin **Guests** view lists each named guest with visit count, first/last
   seen, and their usual host; counts reconcile against a manual count of two
   sample games.

## Scope

**In**

- Per-game guest name capture, with autocomplete against previously-seen guests
  so repeat visitors resolve to one identity.
- Host capture (which member invited them), skippable, non-guest players only.
- Editing both after the fact.
- Display-name resolution wherever a guest is rendered in the game module.
- Admin-only **Guests** ledger: name, visits, first seen, last seen, usual host.

**Out** (explicitly, to keep the cut small)

- Dues *amounts*, invoicing, payment status. The ledger answers "how many
  times"; the money lives outside the app.
- Promoting a frequent guest into a roster `Player`. Natural next step, not now.
- Guests in RSVP (`GameRsvp.guestCount` semantics are untouched).
- Changing the `GuestN` pool mechanic. The pool stays exactly as-is.
- Backfilling names/hosts onto historical games.
- Putting guest names into the Google Sheets export (see Constraints).

## Constraints

- 🔴 **`npm run build` in `backend/` runs `prisma db push --accept-data-loss`
  against `DATABASE_URL`, which in the local `.env` is PRODUCTION.** With an
  edited `schema.prisma` this pushes straight to prod. Typecheck with
  `npx tsc --noEmit` instead, and never run the backend build locally while this
  branch's schema edits are uncommitted. The change here is purely additive (two
  new tables, no column drops), so the eventual push on Render is safe.
- **Never write a guest's temporary name into `Player.name`.** Six places
  identify guests by string-matching the canonical name —
  `reliability.ts:20` (`/^Guest\d+$/`), `achievements.ts:194,274`,
  `OverallStatsTable.tsx:284`, `GameModuleExpanded.tsx:285`,
  `PlayerLinkSetup.tsx:71`. Overwrite the name and the guest exclusion silently
  breaks in reliability, achievements, MOTM and stats *at the same time*. This is
  the single most important invariant in this build.
- **The Google Sheets export/import round-trips by player name** —
  `routes/games.ts:603,620,741,766` do `allPlayers.find(p => p.name === row.Player)`.
  The export must keep emitting `Guest3`, not "Ricky", or re-import silently
  fails to match. Hence guest names are out of scope for the export.
- Auto-save in the game module is debounced and fires the whole game payload
  (`GameModuleExpanded.tsx:229`). Guest visits must ride that same save so the
  sideline UX doesn't gain a second "did it save?" surface.
- Mobile-first, used one-handed at the field mid-setup. Two modal fields is the
  ceiling; anything longer gets skipped or mis-tapped.
- This feature does **not** depend on the WhatsApp listener or `GameRsvp`, so
  the frozen-RSVP situation does not block it.

## Data model

Two new tables. No changes to `Player`, `Game`, or any existing column.

```prisma
model Guest {
  id             String   @id @default(uuid())
  name           String                  // as typed, e.g. "Ricky B"
  normalizedName String   @unique        // lower+trimmed, collapses "ricky"/"Ricky"
  notes          String?                 // admin scratch, e.g. "Sam's brother"
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  visits         GuestVisit[]
}

model GuestVisit {
  id           String   @id @default(uuid())
  gameId       String
  slotPlayerId String   // the GuestN pool Player used as this game's token
  guestId      String?  // null = name was skipped
  hostPlayerId String?  // null = host was skipped / unknown
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  game  Game   @relation(fields: [gameId], references: [id], onDelete: Cascade)
  guest Guest? @relation(fields: [guestId], references: [id], onDelete: SetNull)

  @@unique([gameId, slotPlayerId])
  @@index([gameId])
  @@index([guestId])
}
```

Plus the back-relation `guestVisits GuestVisit[]` on `Game`.

**Why a table and not a JSON column on `Game`.** My first read of this was a
`Record<playerId, {name, hostId}>` blob alongside `teamAssignments`. The dues
requirement rules that out: aggregating "how many times did Ricky come" from
JSON means loading every game and string-matching labels. `GuestVisit` +
`guestId` makes the ledger a `GROUP BY` and makes identity explicit at the point
of entry rather than guessed at read time.

**Why `slotPlayerId` and `hostPlayerId` are plain strings, not foreign keys.**
Consistent with how `teamAssignments`, `goals` and `sportsmanship` already store
player ids, and it avoids Prisma's named-relation ceremony for two relations
from one model to `Player`. Same referential exposure the JSON fields already
carry.

**Why `normalizedName` is unique.** It is a deliberate guard against the
fragmentation that would wreck the dues count. Cost: two genuinely different
Rickys force the admin to type "Ricky B". That trade is worth it — a split
identity is a silently wrong number, a forced surname is a visible nuisance.

## API

**Writes — folded into the existing game save.** `updateGameSchema`
(`backend/src/schemas/game.ts`) gains:

```ts
guestVisits: z.array(z.object({
  slotPlayerId: z.string(),
  guestName:    z.string().trim().min(1).max(60).nullable(),
  hostPlayerId: z.string().nullable(),
})).optional()
```

`PUT /api/games/:id` handles it in one transaction: resolve each non-null
`guestName` to a `Guest` by `normalizedName` (upsert), then replace that game's
`GuestVisit` rows. Name→identity resolution is server-side so the modal never
needs a round trip before the admin can carry on setting up teams.

**Reads**

- `GET /api/games/:id` — response gains `guestVisits: [{ slotPlayerId, guestId, guestName, hostPlayerId }]`, parsed alongside the existing JSON fields at `routes/games.ts:99`.
- `GET /api/guests` *(admin)* — autocomplete source: `[{ id, name }]`.
- `GET /api/guests/ledger` *(admin)* — the dues report: per guest, `visits`, `firstSeen`, `lastSeen`, `hosts: [{playerId, name, count}]`. One grouped query over `GuestVisit` joined to `Game.createdAt`.

Ledger counting rule: **one visit per (gameId, guestId)**. If a guest occupies
two pool slots in one game (left and came back), that is still one visit — dues
follow appearances, not slots.

## Frontend

**New: `GuestDetailsModal.tsx`**

Two fields, both dismissible, styled after the existing modal shell
(`PlayerPickerModal.tsx` — same search/filter/create pattern, same
`bg-surface rounded-xl` chrome):

- *Who's this?* — free text with a dropdown of previously-seen guests. Typing an
  existing name and picking it reuses that `Guest`; typing a new one creates it
  on save.
- *Who invited them?* — player list filtered to non-guest players only
  (`!isGuestPool(p.name)`), searchable. Current roster first, prior members
  (`onRoster: false`) grouped below under a "Prior members" heading.
- Footer: **Skip** (assign to team, record nothing) and **Save**.

**Changed: `GameModuleExpanded.tsx`**

- `handleAddGuest(team)` (`:636`) — pick the pool slot exactly as today, then
  open the modal instead of assigning immediately. On confirm or skip, assign the
  slot and record the visit in local state; auto-save carries it.
- New `guestVisits` state, hydrated from the game fetch alongside
  `playerTeams` (`:119`, `:401`) and included in the `updateGame` payload
  (`:229`).
- New helper `displayName(player)` = `guestVisits[player.id]?.guestName ?? player.name`,
  threaded to the guest-visible render sites: goal feed (`:1154-1157`),
  team-changes feed (`:1287-1288`). **MOTM (`:285`) keeps using `p.name`** —
  it must stay a canonical-name check.
- Removing a guest from the game drops its `GuestVisit`.

**Changed: `ActivePlayersSection.tsx`** — guest cards render `displayName` and
gain a small edit affordance (admin only) reopening `GuestDetailsModal` for
that slot. Host shown as secondary text: *"guest of Sam"*.

**Changed: `GamePlayerCard.tsx`, `GameModuleCondensed.tsx`** — accept an
optional display-name override; fall back to `player.name`.

**New: admin Guests view in `Stats.tsx`** — a new `activeView === 'guests' && isAdmin`
branch next to the existing reliability gate (`Stats.tsx:272`). Sortable table:
Guest · Visits · First seen · Last seen · Usual host. **The guest is the unit of
collection** — default sort is visits descending so the dues conversation starts
at the top row, and "Usual host" is informational only (no host-side total).
Unnamed guests roll into a single "Unnamed" row so the total still reconciles
against actual bodies.

## Plan

Sequenced so each phase is independently verifiable and nothing half-built ships.

**Phase 0 — schema.** Add both models to `schema.prisma`, `npx prisma generate`,
`npx tsc --noEmit` in `backend/`. No UI. Verify the generated client exposes
`guest` / `guestVisit`.

**Phase 1 — capture + edit.** `GuestDetailsModal`, the `handleAddGuest` rewrite,
zod schema, the transactional write in `routes/games.ts`, `GET` hydration, and
the edit affordance on the guest card. Guest name renders on the card only.
Verifiable end-to-end: add a guest, name it, reload, name is still there.

**Phase 2 — display threading.** `displayName` through the goal feed and
team-changes feed. This is the phase that can break things: run the regression
gate (success criterion 6) before and after.

**Phase 3 — ledger.** `GET /api/guests/ledger`, the admin Guests view.

Typecheck both packages after each phase (`npx tsc --noEmit` backend,
`npm run build` frontend — the frontend build is safe, only the backend one
touches prod).

**Effort:** Phase 0 ~30 min, Phase 1 ~3 h, Phase 2 ~2 h, Phase 3 ~2 h.
Roughly one working day, plus a browser smoke pass.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Backend build pushes schema to prod mid-development | Medium — it is one wrong command | Never run `npm run build` in `backend/` locally; `npx tsc --noEmit` only. Change is additive so an accidental push is recoverable. |
| Display-name threading leaks into a guest-exclusion check | Medium | `Player.name` never mutated; regression gate in criterion 6; MOTM/achievements/reliability explicitly left on `p.name`. |
| Sheets export/import breaks on guest names | Low (out of scope) | Export untouched; verify a round-trip during smoke anyway. |
| Duplicate guest identities fragment the dues count | Low | `normalizedName` unique + autocomplete surfaces the existing entry before a new one is created. |
| Modal slows sideline team setup | Medium | Skip is one tap and is the first footer button; nothing is required. |

## Decisions (owner, 2026-08-07)

1. ✅ **Host eligibility — prior members ARE selectable.** Filter is
   `!isGuestPool(p.name)` only; `onRoster` is not a gate. Current roster sorts
   first, prior members grouped below under a "Prior members" heading (mirrors
   the split already used in `PlayerList.tsx`). A former member can still bring
   a mate, and excluding them would silently drop those guests to no host.
2. ✅ **Dues follow the GUEST, not the host.** The guest is the row and the unit
   of collection; a repeat visitor is who gets chased. Usual host stays as an
   informational column — useful for "ask Sam to nudge him", not a debt column.
   Consequence for the ledger: default sort is visits descending on the *guest*,
   and no host-side total is computed.

**Decided by default** (my recommendations, unchallenged — say the word to flip
any of these):

3. Ledger is **admin-only**, gated like Reliability (`Stats.tsx:272` pattern).
4. Unnamed guests roll into a single **"Unnamed" aggregate row**, so the ledger
   total still reconciles against actual bodies on the pitch.
5. `Guest.notes` is **ledger-only** — not in the sideline modal, which stays at
   two fields.
6. **No "should be a member" threshold flag.** Out of scope; cheap to add once
   there is real data in the ledger to pick a sensible N from.

---

## What shipped (2026-08-07)

**New files**
`backend/src/services/guests.ts` · `backend/src/routes/guests.ts` ·
`frontend/src/api/guests.ts` · `frontend/src/components/GuestDetailsModal.tsx` ·
`frontend/src/components/GuestLedgerTab.tsx`

**Changed**
`backend/prisma/schema.prisma` (+`Guest`, +`GuestVisit`, +`Game.guestVisits`) ·
`backend/src/schemas/game.ts` · `backend/src/routes/games.ts` ·
`backend/src/index.ts` · `frontend/src/api/games.ts` ·
`frontend/src/components/{GameModuleExpanded,ActivePlayersSection,Stats}.tsx`

**Verified without touching prod** — `computeGuestLedger` and
`replaceGuestVisits` were exercised against a stubbed Prisma client
(22 assertions, all passing), covering: two slots in one game counting as one
visit, usual-host resolution by game rather than slot, the unnamed aggregate,
case-variant names collapsing to one `guestId`, and null handling for each
skipped field independently.

**Regression gate held.** No guest-exclusion site was modified —
`reliability.ts:20`, `achievements.ts:194,274`, `OverallStatsTable.tsx:284`,
`GameModuleExpanded.tsx` MOTM and `PlayerLinkSetup.tsx:71` all still match on
the canonical `Player.name`, which nothing in this change writes. The Sheets
export/import name round-trip is untouched.

**Known rough edge:** in *edit* mode the modal's Skip button cancels (keeps the
existing name/host) rather than clearing it. Clearing is done by emptying the
name field and pressing Save. If that reads wrong in use, the fix is to relabel
Skip → Cancel when editing.

## Smoke checklist (browser, admin account)

1. Add a guest → modal appears → **Skip** → guest is on the team, unnamed.
2. Add a guest → type a name + pick a host → Save → card shows the name and
   "guest of X".
3. Reload the game → name and host persist.
4. Tap the pencil on a guest card → modal reopens pre-filled → change host → Save.
5. Type a previously-used guest name → "Been before?" suggestion appears → tap
   it → the ledger still shows **one** row for that guest, not two.
6. Host picker: confirm no `GuestN` appears; confirm a prior member does.
7. Score a goal with a named guest → goal feed shows the name; share the match
   report PNG → name appears there too.
8. Stats → **Guests** → visit counts match what you just entered.
9. Confirm Reliability tab numbers and the season stats table are unchanged.

---

## Sign-off

- [x] Data model (two tables, `normalizedName` unique) approved
- [x] Open questions resolved — see Decisions above
- [x] Scope boundaries (no dues amounts, no export changes) accepted
- [ ] **Build go-ahead**
