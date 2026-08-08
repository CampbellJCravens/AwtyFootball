# PRD — Guest Dues Settlement

Status: **SUPERSEDED 2026-08-07 by `CLUB_DUES_PRD.md`.** Q1 was answered — dues
tracking covers the whole group, not just guests — so guest settlement becomes
a subset of the club-wide spec rather than its own feature. Kept for the
settlement-log design (date-cutoff model, two-clocks framing), which carries
over. **Do not build from this document; build from `CLUB_DUES_PRD.md`.**

⚠️ Also outdated here: this draft assumed the free trial was **lifetime**. The
owner confirmed it is **annual** (resets each dues year). The shipped code and
`CLUB_DUES_PRD.md` reflect the annual rule.
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-08-07
Deadline: **October 2026** — the annual collection moment.

Builds on `GUEST_NAMES_AND_HOSTS_PRD.md` (shipped 2026-08-07). The billable
column landed alongside this draft; everything below is what it does *not*
solve.

---

## Problem

The guest ledger counts appearances across all time. Collection happens
periodically. Nothing records that money has already changed hands, so the
ledger cannot distinguish "owes for 6 games" from "came 6 times, paid in the
spring."

The first collection is fine — every visit is unpaid, so all-time and
since-last-settled are the same number. **The second collection is where it
silently double-charges.** With dues collected each October, that means this
becomes wrong in October 2027 unless it is solved before then, and the
groundwork has to exist before the first collection so there's something to
mark as settled.

Two different clocks are being conflated:

| Clock | Question it answers | Basis | Status |
|---|---|---|---|
| **Trial exhaustion** | Has this person used their 2 free games? | Lifetime visits | ✅ Shipped — the `Billable` column |
| **Billing** | What do they owe *me, now*? | Visits since last settled | ❌ No representation |

The trial clock is correctly lifetime and must stay that way: it is about a
person deciding once whether they like the group, not an annual reset. The
billing clock is periodic. Conflating them is the defect.

## Business rules (owner, 2026-08-07)

- Member dues are collected **in October, for the following year**.
- Guests are **not charged for their first 2 games** — a trial to see whether
  they like the group.
- From the **3rd game onward, guests are charged per game**.
- The trial is **lifetime per person**, not per year. *(Assumed from "come twice
  to see if they like the group"; confirm in Q2.)*

## Success criteria

1. For any guest, the ledger shows **what they owe now** — billable visits not
   yet settled — distinct from their lifetime totals.
2. Marking a guest settled is one action and records **when** and **how many
   visits** it covered.
3. A settled guest's owed count drops to 0 and climbs again from their next
   appearance. Their lifetime visit count and trial status are unaffected.
4. Settlement history is inspectable — for any guest, when they last settled
   and what it covered. No silent overwrites.
5. Re-running collection in a later period never re-bills a settled visit.
6. Existing ledger behaviour (visits, billable, first/last seen, usual host) is
   unchanged.

## Scope

**In**

- Recording that a guest has settled up to a point in time.
- An "owes now" figure distinct from lifetime billable.
- Settlement history per guest.
- A collection view: everyone who currently owes, ready to work through.

**Out**

- **Member annual dues** — pending Q1. If in, it is a separate PRD, not this one.
- Payment processing, invoicing, reminders. This records that money arrived; it
  does not move money.
- Per-visit payment records (over-engineered at this scale — see Data model).
- Promoting a guest to a member. Tracked separately as an open thread.

## Constraints

- **`npm run build` in `backend/` pushes schema to PROD** (`prisma db push
  --accept-data-loss`). Use `npx tsc --noEmit` to typecheck. For the schema
  change, reuse the recipe that worked on 2026-08-07: `npx prisma migrate diff
  --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma
  --script` to preview the SQL, then bare `npx prisma db push` with **no**
  `--accept-data-loss` — the bare command refuses anything destructive, so it
  can only succeed on an additive change.
- Money figures raise the stakes on correctness. Once the app displays an
  amount owed, it becomes the record people argue from. See Q3.
- **Unnamed guest visits can never be billed.** They aren't attributable to a
  person, so they cannot accrue toward a trial or a debt. This is a revenue
  leak, not a display quirk — see "Naming discipline".
- Admin-only throughout, like the rest of the ledger.

## Data model

One new table, one optional convenience field. No changes to `Guest` counts or
`GuestVisit`.

```prisma
model GuestSettlement {
  id        String   @id @default(uuid())
  guestId   String
  // Visits with a game date <= this are considered paid. A date, not a visit
  // list: it survives a visit being edited or a game being re-dated, and it is
  // what "we squared up through the summer" actually means.
  through   DateTime
  visits    Int      // how many billable visits this covered, recorded at the time
  note      String?  // "cash", "venmo", "wrote off — brought 3 mates"
  settledAt DateTime @default(now())
  settledBy String?  // admin userId

  guest Guest @relation(fields: [guestId], references: [id], onDelete: Cascade)

  @@index([guestId])
}
```

**Owed now** = billable visits whose game date is after the guest's latest
`GuestSettlement.through`, with no settlement meaning all billable visits are
owed.

**Why a settlement log, not a flag on `Guest`.** A `settledThrough` column
alone would be overwritten each collection, destroying the record of what was
collected when. The log costs one extra table and makes criterion 4 free. It
also means a mistaken settlement is deleted rather than reconstructed from
memory.

**Why a date, not a list of paid visit ids.** Per-visit payment records are the
textbook answer and the wrong one here: at ~a handful of guests and weekly
games, they add a join and a reconciliation surface to solve a problem that a
cutoff date solves exactly. Revisit only if partial payments become real.

**Trial interaction — the subtle bit.** The 2 free games come off the
*lifetime* count, not each period. A guest who came twice last year and twice
this year has 4 lifetime visits, 2 billable, and if both pre-date the last
settlement, owes nothing. Getting this wrong in either direction either bills
someone for their trial or gives them a fresh trial every year.

## API

- `GET /api/guests/ledger` — each row gains `owedVisits: number | null` and
  `lastSettledThrough: string | null`. Existing fields unchanged.
- `POST /api/guests/:id/settlements` *(admin)* — `{ through, note? }`. Server
  computes and stores `visits` covered. Returns the updated row.
- `DELETE /api/guests/:id/settlements/:settlementId` *(admin)* — undo a
  mistake. Needed: this is a money record entered on a phone.
- `GET /api/guests/:id/settlements` *(admin)* — history for one guest.

## Frontend

- **Guests tab** gains an `Owes` column, emphasised over lifetime `Billable`,
  since that's the number you act on. Default sort moves to owed descending.
- **Row tap** opens a guest detail sheet: visit list with dates, settlement
  history, and a **Mark settled** action defaulting `through` to today.
- **Collection mode** — filter to "owes > 0", so October is a worklist you can
  page through rather than a table you scan.

## Plan

**Phase 0** — `GuestSettlement` model; preview the SQL with `migrate diff`,
then bare `db push`. Typecheck. No UI.

**Phase 1** — settlement write + undo routes; `owedVisits` on the ledger.
Verify the owed calculation against a stubbed Prisma before any UI exists —
this is the arithmetic that decides what people are asked to pay, and it has
four cases worth pinning: no settlement, settlement before all visits,
settlement mid-history, and settlement covering everything.

**Phase 2** — `Owes` column, guest detail sheet, Mark settled.

**Phase 3** — collection mode filter.

**Effort:** roughly a day, similar shape to the guest-names build. Phase 1 is
the part that must be right.

## Naming discipline (operational, not a code change)

An unnamed guest visit is invisible to both clocks. Their third game looks like
their first, and nobody is billable. The naming prompt is therefore the
revenue mechanism, not bookkeeping tidiness.

Options if leakage shows up in practice, cheapest first:

1. Leave as is; see how often names actually get skipped.
2. Make the name field harder to skip — e.g. Skip requires a second tap.
3. Surface unnamed visits in the ledger as a "who was this?" queue, editable
   after the fact from the game.

Recommend (1) until there's evidence, then (3) — it recovers revenue already
lost, where (2) only prevents future loss and adds sideline friction.

## Open questions

1. 🔴 **BLOCKING — does "dues tracking" mean guests only, or members too?** You
   collect annual dues from ~55 members each October. That is a different
   feature: per-member payment status, a year dimension, a roster-wide
   collection view, and a much higher cost of being wrong. This PRD covers
   guest per-game charges only. If members are in scope, say so and I'll spec
   it separately — the two share a "who owes what" view but almost nothing else.
2. **Is the 2-game trial lifetime or per-year?** Assumed lifetime, and the
   shipped `Billable` column already computes it that way. One-line change if
   wrong, but it changes what people are charged.
3. **Money in the app, or just counts?** Recording a per-game rate lets the app
   show "owes $45" instead of "owes 3 games". More useful, and a bigger
   commitment: it becomes the number people argue from, and rate changes need
   history or old settlements silently re-price. *Recommend counts only for v1,
   with the rate living in your head or a note field.*
4. **Partial payments** — someone pays for 2 of 4 owed games. The date-cutoff
   model handles this only if the paid games are the oldest. Real problem or
   theoretical? *Recommend assuming it's theoretical until it isn't.*
5. **Write-offs** — a guest who brings three future members is worth comping.
   Is that a settlement with a `note`, or does it need its own type so it
   doesn't look like collected cash in a future total?
6. **Does promotion to member settle the guest debt?** Ties to the open
   guest→member promotion thread. Probably a policy call, not a code one.

---

## Sign-off

- [ ] Q1 answered — guests only, or members too
- [ ] Q2 confirmed — trial is lifetime
- [ ] Q3 decided — counts vs money
- [ ] Data model (settlement log, date cutoff) approved
