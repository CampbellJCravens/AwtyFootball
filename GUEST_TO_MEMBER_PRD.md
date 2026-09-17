# PRD — Promoting a guest to a member

Status: **BUILT 2026-09-17** on `feat/link-number-to-guest` (stacked on the number-linking work, which supplies `Guest.phone`). Both packages typecheck clean, frontend prod build passes, 8/8 promotion + 9/9 slot assertions pass. **Not pushed, not deployed, schema NOT applied.**
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-09-17
Deadline: **before this dues collection** — Amelia converts at the end of the month.

## Problem

Guests are a trial funnel, and the pricing says so: the first two games each
dues year are free, everything after bills per game, **uncapped** — the code's
own comment explains the balance is deliberately never capped at the membership
price "because an accruing balance is what makes going yearly the obviously
cheaper choice." The dues report already computes `shouldConvert` when a guest's
balance passes `memberAmount`, and `GuestLedgerTab` renders a **convert** badge.

**Nothing can act on that badge.** There is no guest-to-member path in the
codebase. Converting by hand means creating a `Player`, and that strands the
person's history in three places at once:

- visits and `DuesPayment` rows stay attached to the `Guest` record,
- her number stays on `Guest.phone`, where the member vote path never looks
  (see `WHATSAPP_GUEST_LINKING_PRD.md`),
- the guest ledger keeps billing her per game forever, because nothing tells it
  she stopped being a guest.

That is a split identity — the exact failure `Guest.normalizedName` uniqueness
exists to prevent, arrived at from the other direction.

## Success criteria

- One action on the convert badge turns a guest into a member, in one
  transaction, with a preview of exactly what will change before it runs.
- Her per-game guest billing **stops** for the dues year she converts in.
- Money she already paid as a guest **credits against her member dues** — it is
  not collected twice and not silently lost.
- Her WhatsApp number keeps working, now on the member path.
- Her past games still read "Amelia", because they already do.
- The guest ledger shows her as converted, not as an open balance, and the
  convert badge is gone.

## Behaviour

**Trigger.** The convert badge in `GuestLedgerTab` (and the `convert` filter in
`DuesTab`) becomes a button: **Make a member**. It opens a confirm step showing
the preview, because this writes across four tables.

**Preview shows:** the name the `Player` will get; whether it creates a new
player or attaches to an existing one; the phone being moved; the count of
guest visits being retired from billing and what that removes from the ledger;
the payments being re-pointed and their total; the `DuesRosterEntry` that will
be created and for how much.

**On confirm, in one transaction:**

1. **Player.** Create `Player { name, onRoster: true, memberSince: <dues year> }`
   — or attach to an existing player the admin picked in the preview.
2. **Phone.** Move `Guest.phone` to `Player.phone`, clearing it on the guest, so
   `syncPollToRsvps` finds her on the member path. If a *different* player
   already holds that number, stop and say so rather than guessing.
3. **Link.** `Guest.promotedPlayerId` + `Guest.promotedAt` + `Guest.promotedYear`.
   The guest row is kept: it is the history of how she got here, and the visits
   hang off it.
4. **Stop the guest meter.** `computeGuestLedger` treats visits in
   `promotedYear` and later as **not billable** (`billableVisits: null`, the
   shape the unnamed-aggregate row already uses). Earlier dues years are
   untouched — a debt from a previous year is not forgiven by joining now.
5. **Credit her payments.** For `duesYear = promotedYear`, set `playerId` on her
   `DuesPayment` rows, **keeping `guestId`** for provenance. `computeDuesYearReport`
   reads `if (p.playerId) … else if (p.guestId)`, so this credits the member and
   stops crediting the guest with no double counting and no lost audit trail.
   Prior years' payments stay as guest payments.
6. **Roster her.** Create `DuesRosterEntry { duesYear, playerId, amountOwed:
   memberAmount, joinedAt: now }`. Without this she lands in the "unrostered
   payments" list instead of the member table.

## Deliberately not in scope

- **Rewriting history attribution.** Her past games stay attributed to the
  `GuestN` slot they were played in. They already *display* her name —
  `displayName` resolves it per game from `GuestVisit`, so nothing needs
  rewriting to read correctly. Making those appearances count as *member* stats
  would mean rewriting `teamAssignments` and `goals` inside stored per-game
  JSON that has no foreign keys — the same structure that previously produced
  orphaned player ids. If that is ever wanted, it is a separate, explicit
  backfill with a dry run, not a side effect of clicking convert.
- Merging duplicate guest identities (`Taymour` / `Taymur`). `renameGuest`
  already merges; that is its own job.
- Demotion. A member who stops paying is `onRoster = false`, which exists.

## Edge cases that must not be guessed

| Case | Behaviour |
|---|---|
| A `Player` with that name already exists | Preview offers **attach to this player** or **create a second**. Never silently attach — two real Ameliass is a possibility, and the wrong choice merges two humans. |
| Another player already has her phone | Refuse, naming the player. A number is one person. |
| Guest already promoted | The action is gone; the ledger row reads "member since <year>". |
| No `DuesYearConfig` for the year | Refuse with "open the dues year first" — `memberAmount` is what step 6 needs. |
| Guest has no phone | Fine. Steps 2 is skipped. |
| She has unpaid guest games from a **previous** dues year | Left owing. Flagged in the preview so it is a decision, not a surprise. |

## Reversibility

Promotion writes across four tables, so:

- the preview is the confirm step, and it names every row that changes;
- the new `Player`, `DuesRosterEntry` and the re-pointed payment ids are returned
  and logged, so an undo is a short, targeted script rather than a hunt;
- `Guest.promotedPlayerId` is the single flag that makes it reversible: clearing
  it, deleting the roster entry, and nulling `playerId` on the re-pointed
  payments restores the previous state exactly. Worth shipping as a documented
  script even if there is no UI for it.

## Data model

```prisma
model Guest {
  // …
  promotedPlayerId String?   @unique  // became a member; the Player they became
  promotedAt       DateTime?
  promotedYear     Int?               // dues year the meter stopped in
}
```

Applied with `prisma db push`, per this repo's convention. Note the deploy
script runs `prisma db push --accept-data-loss`, so merging to `main` applies it.

## Plan

1. Schema + `promoteGuest(guestId, opts)` service with the preview as a separate
   pure function, so the preview and the write cannot drift.
2. Ledger and dues changes (steps 4–5), which is where double-charging would hide.
3. UI on the convert badge.
4. Assertions against a stubbed Prisma, as with `guest-slot-assertions.cjs`:
   billing stops in the right year and only that year, payments credit once, a
   phone collision refuses, an existing name offers a choice.

Depends on `feat/link-number-to-guest` for `Guest.phone`.

## Decided (owner, 2026-09-17)

1. **Full member amount.** No pro-rating. Discounts stay a human decision,
   recorded in the roster entry's `note`, rather than a formula nobody
   remembers in month nine.
2. **Keep both facts, lead with the first appearance.** `Player.memberSince` is
   the dues year she FIRST TURNED UP — she has been showing up, and that is what
   tenure means here. The year she actually joined is kept separately as
   `Guest.promotedYear`, and the ledger shows it ("member since 2026").
3. **A game in progress is left as played**; membership starts from the next
   one. Applying it live would have to move her off the slot and rewrite
   `teamAssignments` — plus re-point goals already recorded against that slot —
   in a game that is actively auto-saving, which is the write pattern behind
   `gotcha-afc-autosave-wipes-on-failed-load`. One extra guest appearance is a
   far cheaper cost than a corrupted live game.

## Built

- `Guest.promotedPlayerId @unique` / `promotedAt` / `promotedYear`.
- `planPromotion()` and `promoteGuest()` in `services/guests.ts` — the write runs
  off the same plan the confirm screen shows, so they cannot drift.
- `computeGuestLedger` stops billing from `promotedYear` on, **year-scoped**:
  earlier dues years still bill. The annual free trial still applies to the years
  that remain billable.
- Payments for the joining year get `playerId` set while **keeping `guestId`**.
  `computeDuesYearReport` reads `if (playerId) … else if (guestId)`, so this
  credits the member, stops crediting the guest, double-counts nothing and keeps
  the audit trail.
- `DuesRosterEntry` created at the full member amount with `joinedAt` and a note
  naming the guest she converted from.
- `GET /guests/:id/promotion` (the plan) and `POST /guests/:id/promote`.
- The **convert** badge is now a button opening a confirm sheet that itemises
  every change, including earlier-year debt that is NOT cleared and a warning
  when the name already belongs to a player. Converted guests read
  "member since <year>" instead.

`scripts/guest-promotion-assertions.cjs` covers the money rules: joining stops
the meter for that year and after, last year's debt survives, the trial still
applies to the years that remain billable, and the ledger reports the promotion.
