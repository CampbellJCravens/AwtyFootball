# PRD — Club Dues Tracking

Status: **DRAFT — awaiting sign-off.** Larger than anything in the guest work;
read the Scope warning before approving.
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-08-07
Deadline: **October 2026** — the annual collection.

Supersedes the guest-only `GUEST_DUES_SETTLEMENT_PRD.md`, which becomes a
subset of this. Builds on the shipped guest ledger.

---

## Problem

Dues are collected each October for the year ahead, from the whole group, and
tracked nowhere. Three separate things are currently invisible:

1. **Who has paid for next year.** No record of payment, method, or date.
2. **Who is actually staying.** Paying dues *is* the signal that someone wants
   another season. The `onRoster` flag is set by hand afterwards, from memory.
3. **How long someone has been with the group.** Tenure isn't recorded, so it
   can't be shown or celebrated.

Guests sit inside this, not beside it: a guest who keeps coming eventually
converts to a paying member, and that conversion is the funnel this should
make visible.

## The scope warning

This is materially bigger than the guest work. That was one screen and two
tables against a handful of people. This touches **~55 members**, holds
**money records**, and produces the roster for next season. Three consequences
worth accepting deliberately:

- **A wrong number here is a wrong conversation with a real person.** The guest
  ledger being off by one was an awkward moment; the dues page being off is a
  dispute about money someone says they paid.
- **It becomes the system of record.** Once it exists, it is what you'll trust
  over your own memory. That is the point, and it's also why it has to be
  right the first October it's used.
- **It has a hard deadline.** October is not movable, and a half-built dues
  page in October is worse than a spreadsheet, because it looks authoritative.

If that feels like too much before October, the fallback is in "Smallest
viable cut" below — it is genuinely useful and about a fifth of the work.

## Business rules (owner, 2026-08-07)

- Dues are collected **in October for the following year**.
- The **dues year runs 1 Oct – 30 Sep**, labelled by the year it covers: a game
  in Oct 2026 belongs to dues year 2027. *(Assumed from "October for the
  following year" — confirm in Q1; it is already live in the guest billable
  calc.)*
- **Guests get 2 free games per dues year**, then pay per game. The allowance
  **resets annually**.
- Payment methods in use: **Venmo, cash, PayPal, Zelle**.
- People fall into three buckets: **current player**, **returning player**
  (was on a past roster, not the current one), **guest**.
- Payment history should feed a **"years with the group"** stat per player,
  which could drive an achievement.

## Success criteria

1. For a given dues year, one page shows every person who owes, what they've
   paid, how, and when.
2. Recording a payment is one action: person, amount, method, date.
3. Each person's bucket (current / returning / guest) is visible and filterable,
   so the October chase can be worked in passes.
4. A guest who converts keeps their history — their guest visits and their
   first membership year are both visible on one record.
5. "Years with the group" is derivable per player and correct for people who
   predate the app (see Q3).
6. Payment records are auditable: who recorded it, when, and edits don't
   silently overwrite history.
7. The guest ledger's existing counts are unchanged by any of this.

## Scope

**In**

- A dues year concept, and payment records against it.
- An admin **Dues** page: roster for the year, status per person, record
  payment with method, filter by bucket and status.
- Bucket classification driven by existing `Player.onRoster` plus the `Guest`
  table.
- Guest → member conversion that preserves guest history.
- "Years with the group" per player, seeded for pre-app tenure.
- Guest per-game charges folded in, replacing the standalone settlement spec.

**Out**

- Taking payment. No Venmo/PayPal/Zelle integration — this records that money
  arrived, out of band, by whatever means. Integration is a different risk
  class entirely and needs its own conversation.
- Reminders, emails, automated chasing.
- Partial-payment plans, pro-rata mid-year joins (see Q5).
- Changing how `onRoster` works today; the dues page proposes flips, it
  doesn't silently perform them.

## Data model

```prisma
// One payment event. Points at EITHER a Player or a Guest, never both.
model DuesPayment {
  id         String   @id @default(uuid())
  duesYear   Int      // the year covered, e.g. 2027
  playerId   String?
  guestId    String?
  amount     Decimal? @db.Decimal(10, 2) // null = recorded without an amount
  method     String   // "venmo" | "cash" | "paypal" | "zelle" | "other"
  paidAt     DateTime
  note       String?
  recordedBy String?  // admin userId
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  guest Guest? @relation(fields: [guestId], references: [id], onDelete: SetNull)

  @@index([duesYear])
  @@index([playerId])
  @@index([guestId])
}
```

Plus on `Player`:

```prisma
  memberSince Int?  // first dues year, hand-seeded for pre-app tenure
```

**Why one table, not separate member/guest payment tables.** The October
conversation is one list, and splitting it makes the "who still owes me" query
a union for no benefit. `playerId` xor `guestId` is enforced in the service
layer rather than a DB constraint, matching how this codebase already handles
its invariants.

**Why `Decimal`, not `Float`.** Money in a float will eventually produce a
total that doesn't match the sum of its parts, and this is a record people
will check. Nullable because Q4 may land on counts-only.

**Why `memberSince` is hand-seeded.** Tenure cannot be derived — per-player
rosters exist only from 2025, and the club goes back to 2018. Anyone who
predates the app would show as a rookie. One integer per player, entered once.

**Bucket derivation** — not stored, computed: `Player.onRoster === true` →
current; `Player.onRoster === false` → returning; a `Guest` row with no linked
Player → guest.

## Guest → member conversion

Answers the truncated question from 2026-08-07 and PRD Q6 of the settlement
spec.

Conversion creates a `Player` and links the `Guest` to it (`Guest.playerId`).
Two decisions this forces, both flagged in Open questions:

- **Does their on-pitch history migrate?** It now *can* — `GuestVisit` records
  which human held which slot in which game, so their goals and assists are
  recoverable. But migrating rewrites historical leaderboards, and putting them
  on rosters they never RSVP'd for makes them look like a serial ghost.
  *Recommend: migrate the on-pitch record, exclude pre-membership games from
  reliability denominators.*
- **Does joining settle the guest debt?** Policy, not code.

## Smallest viable cut

If October is tight, this is the fifth of the work that carries most of the
value:

1. `DuesPayment` table + `memberSince`.
2. A Dues page listing the current roster for the year with paid / unpaid and a
   "record payment" action capturing method, date and amount.
3. Nothing else — no buckets, no conversion flow, no tenure stat, no
   achievement.

That gets you through October with a real record. Buckets, guest folding,
tenure and the achievement are all additive afterward and none of them
invalidate the data captured in the meantime. **Recommended** unless you want
the full thing and have the evenings.

## Plan

**Phase 0** — schema (`DuesPayment`, `Player.memberSince`). Preview with
`migrate diff`, then bare `db push`, no `--accept-data-loss`.

**Phase 1** — payment write/edit/delete routes; dues-year status service.
Verify the owed/paid calculation against a stubbed Prisma before UI: the four
cases are unpaid, paid in full, multiple partial payments, and a payment
recorded against the wrong year.

**Phase 2** — Dues page: roster for the year, status, record payment.
*(Phases 0–2 are the smallest viable cut.)*

**Phase 3** — buckets and filters; guests folded into the same list with their
per-game charges.

**Phase 4** — `memberSince` seeding UI + "years with the group" on the player
profile.

**Phase 5** — tenure achievement, following the existing `services/achievements.ts`
pattern.

**Effort:** Phases 0–2 roughly a day. All five, three to four days.

## Risks

| Risk | Mitigation |
|---|---|
| Half-built in October, looks authoritative, isn't | Ship the smallest viable cut early; don't start Phase 3 until 0–2 are smoked |
| Money totals disputed | `Decimal` not float; payment log is append-with-audit, edits keep history |
| Tenure wrong for long-standing members | `memberSince` seeded by hand before the stat is displayed anywhere |
| Achievement fires on incomplete data | Phase 5 last, gated on Phase 4 seeding being done |
| Dues page silently changes the roster | It proposes `onRoster` flips; a human confirms |

## Open questions

1. **Dues year boundary — is it 1 Oct – 30 Sep?** Already live in the guest
   billable calc. If your year is really the calendar year (Oct payment covers
   Jan–Dec), the boundary shifts and some guest charges move. One constant.
2. **Do guests' per-game charges get collected in October too, or as they go?**
   Changes whether guests belong on the October page or a rolling one.
3. **`memberSince` for existing players — do you know it?** ~55 people. If it's
   only approximate for the older members, better to seed what you're sure of
   and leave the rest null than to guess and have the achievement lie.
4. **Amounts, or just paid/unpaid?** Recommend amounts here, unlike the guest
   spec — for annual dues "paid $X on Y by Zelle" is the record you'll want in
   a dispute, and the flat annual figure doesn't have the rate-change problem
   per-game charges do.
5. **Someone joins in March — full year or pro-rata?** Affects what "owes"
   means for mid-year joiners.
6. **What does the achievement celebrate?** Consecutive years, or total? Does a
   gap year reset it? *Recommend total years, no reset — a gap year is life,
   not failure, and the Highlander already covers the streak flavour.*
7. **Does paying dues auto-flip `onRoster` for next season?** Recommend
   proposing it in the UI with a confirm, never silently.

---

## Sign-off

- [ ] Scope warning read and accepted
- [ ] Full build vs smallest viable cut decided
- [ ] Q1 (year boundary), Q3 (`memberSince` availability), Q4 (amounts) answered
- [ ] Data model approved
