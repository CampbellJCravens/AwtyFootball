# PRD — Club Dues Tracking

Status: **The selected cut (Phases 0–2) plus 2b is BUILT AND DEPLOYED.**
Verified against code 2026-08-15 — the previous "scope decided, data model
awaiting sign-off" line was stale; the data model shipped on 2026-08-08.

| Phase | State |
|---|---|
| 0 — Schema | **Built**, and larger than planned: `DuesYearConfig`, `DuesPayment`, `Player.memberSince` as specced, **plus `DuesRosterEntry`** added for the roster lifecycle decided 2026-08-10. |
| 1 — Routes + status service | **Built.** 9 admin-only routes in `routes/dues.ts`, including payments write/delete, year config, open-year, per-entry Left, and a sweep. |
| 2 — Dues page | **Built.** `DuesPage.tsx`, `DuesTab.tsx`, `RecordPaymentModal.tsx`, `AddDuesEntryModal.tsx`. |
| 2b — Guest balances + conversion prompt | **Built.** Guest owed/balance on the ledger tab, sortable by owed, with the `shouldConvert` prompt (`GuestLedgerTab.tsx:73`). Balances come from the dues report so there is one calculation, not two. |
| 3 — Buckets, filters, merged list, full conversion flow | **Not built.** |

✅ **SMOKED BY HAND 2026-08-15.** Owner walked the pages, then ran all six
steps of `DUES_SMOKE_TEST.md` against a live roster member. **Every step
behaved as specified; no defects found.** Cleanup verified at the database
afterwards — 0 `DuesPayment` rows, both years back to 57 clean entries, no
stray `leftAt` or notes, matching the pre-test baseline exactly.

- [x] no payments → unpaid, balance = full
- [x] one payment below the figure → partially paid, balance = remainder
- [x] several payments summing exactly → paid in full, balance 0
- [x] several summing **over** → negative balance surfaced, not clamped to zero
- [x] payment recorded against one year → does not leak into another
- [ ] player with no `DuesYearConfig` row → explicit error, not a silent zero
      owed. **Not reachable today** — 2026 and 2027 are both configured. Clears
      when 2028 is opened in October.

The overpayment case is the one worth noting: `amountOutstanding` was once
`billed − collected`, so one person's overpayment masked another's debt (fixed
2026-08-08). That fix is now confirmed by a human rather than assumed.

Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-08-07, decisions recorded 2026-08-08
Deadline: **October 2026** — the annual collection.

**Owner decisions 2026-08-08:** build the **smallest viable cut** (Phases 0–2).
Dues year **= the CALENDAR year** (corrected 2026-08-08; an earlier
1 Oct – 30 Sep reading was wrong and has been fixed in code). Collection for the
year ahead **opens in October and may run through December**. Record **amounts**, and **installments
are in scope** — people pay in parts. Guests are **$30/game with no ceiling**.
`memberSince` is known for **some** members only and must be **editable on the
player card**. See "What the 08-08 decisions changed" below.

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

**The real objective is removing admin load from one person (owner, 2026-08-08).**
This is not primarily a bookkeeping system that happens to save time; the time
is the point. Two consequences that should decide close calls throughout:

- **Uncapped guest charges are a conversion lever, not a revenue line.** The
  owner does not want to track per-game payments, so the charge is deliberately
  left to accumulate until going yearly is obviously cheaper. **Success is guest
  per-game revenue trending toward zero** as regulars convert — not maximised
  collection. Anything that optimises guest billing at the cost of conversion is
  pointed the wrong way.
- **Where a feature saves the owner a conversation, it beats a feature that
  merely records one.** Between two options of equal cost, prefer the one that
  removes a thing he'd otherwise have to remember, chase, or work out in his
  head at the side of a pitch.

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

## Business rules (owner, 2026-08-07, confirmed and extended 2026-08-08)

- Dues are collected **in October for the following year**.
- **The dues year IS the calendar year.** Dues year 2027 = 1 Jan – 31 Dec 2027.
  Confirmed by the owner 2026-08-08 and corroborated by the historical sheet,
  whose headers read *"Paid 2016 (for 2017 **Calendar Year**)"*.
- **Collection is a window, not the boundary.** It opens in **October** for the
  year ahead and the owner *"typically allows collections from October through
  December in case people need more time."* So a payment recorded in Nov 2026 is
  a 2027 payment; a *game* played in Nov 2026 is a 2026 game. Conflating the two
  is the trap — see below.
- ⚠️ **This corrects an earlier error.** A 1 Oct – 30 Sep boundary was assumed
  from "October for the following year", confirmed in error, and shipped to
  `feat/guest-billable-visits`. It would have filed every Oct–Dec guest visit
  under the *following* dues year, silently moving free-trial allowances. Fixed
  2026-08-08: `duesYearOf(date) = date.getFullYear()`, with
  `DUES_COLLECTION_OPENS_MONTH` / `_CLOSES_MONTH` kept for the payment window.
  Caught before the branch merged, so nothing reached production. 11/11
  boundary assertions pass.
- **Members may pay in installments.** A person's dues for a year can be
  satisfied by several payments over time, so status is not binary — it is
  `owed − paid`, and "partially paid" is a first-class state.
- **Guests get 2 free games per dues year**, then pay **$30 per game**. The
  allowance **resets annually**.
- **Guest charges have no ceiling.** A guest's accrued per-game total is never
  capped at the annual dues figure, however many games they play. Tracking
  payment game-by-game is an inconvenience, so the balance simply accumulates
  and is settled in the round — and an uncapped balance is what makes
  converting to membership the obviously cheaper choice.
- Payment methods in use: **Venmo, cash, PayPal, Zelle**.
- People fall into three buckets: **current player**, **returning player**
  (was on a past roster, not the current one), **guest**.
- Payment history should feed a **"years with the group"** stat per player,
  which could drive an achievement.
- **`memberSince` is partially known.** Seed only what is certain; leave the
  rest null, and let it be corrected over time from the player card rather than
  in one data-entry session.
- **The 2027 target is $6,000.** Current and returning players pay an identical
  figure — no bucket pricing between those two.
- 🔴 **Alumni play for free.** They are on the roster, they turn up, they are
  not billed. So **the roster is not the bill list**, which is the single
  biggest correction to this spec so far — every "55 members owe $110" number
  in earlier drafts was wrong.
- **Bill everyone who is not alumni** — 43 people, not 35. The rate is
  **$150–175**, set by the owner at the start of each dues season and frozen for
  the year. It is **entered, never computed from the target**.
- **Mid-year joiners pay full price**, unless **3 months or less remain in the
  dues season**, at which point the amount is **the owner's discretion**. Not a
  formula — a prompt with an editable default.
- **2028 intent: discounts for the top goalscorer and top sportsmanship.** Not
  built now, but it means uniform pricing is temporary — see "Per-person
  adjustments" below.

## What the 08-08 decisions changed

Three of the four answers were confirmations. One was not.

**Installments moved partial payments from Out to In, and that has a data
consequence.** The original model recorded payments only. With installments,
"has this person paid?" cannot be answered from payment rows alone — you need
to know what they *owed* to know whether the sum of their payments covers it.
So the model gains a per-year dues figure. That is one small config table, and
it also gives the $30 guest rate a home that can change year to year without
rewriting history.

This is a genuine scope addition to the smallest viable cut, not a free one. It
is still small — one table, one subtraction — and it is not deferrable, because
a dues page that can only say paid/unpaid is wrong for anyone mid-installment,
which by your own account is a real share of the group.

**`memberSince` editing moved from Phase 4 into the cut.** You asked for it on
the player card. That is the right call for a partially-known field: it turns
seeding from one dreaded session into something corrected in passing whenever
you happen to know. It is a nullable integer on an existing card, so it is
cheap — but note it means the *field* ships in the cut while the *tenure stat
and achievement that consume it* stay in Phases 4–5, gated on enough of it
being populated to not lie.

## Forward-compatibility note — selling this to other groups (2026-08-08)

Owner raised a long-term possibility: sell the app to other clubs, in which case
dues may need isolating or renaming because not everyone wants it.

**Renaming dues is not the obstacle, and isolating it is nearly free.** The
obstacle is that this app has no concept of more than one club. Sixteen models
in `schema.prisma`, zero tenant keys — no `clubId`, `orgId` or equivalent
anywhere. Club identity is also hardcoded in ~115 places across `backend/src`
and `frontend/src`, including `ROSTER_BY_YEAR` in `stats.ts`, `GROUP_SIZE = 44`
in `frontend/src/api/stats.ts`, and a `SITE_PASSWORD` defaulting to `'AWTY'`.

That work is real and it is entirely separate from dues. Dues is one page and
two tables; multi-tenancy is every query in the app. Deciding what to call
`DuesPayment` does not move it.

**What this changes about the October build: almost nothing, deliberately.**

- **Keep dues in its own module.** Own service, own routes, own page; nothing
  outside reaches into it. That is good practice regardless and costs nothing,
  and it is the entire "isolation" ask satisfied.
- **Do not add `clubId` to the new tables.** A tenant key on two of sixteen
  models is worse than none — it looks like tenancy exists and it doesn't. The
  expensive part of retrofitting tenancy is backfilling and enforcing the key in
  every query, and that cost is identical whether the column is added now or
  later. Adding a nullable column to a 55-row table is never the hard part.
- **`DuesYearConfig` already does the right thing for the wrong reason.** It was
  added so rates could change year to year. Putting the dues figure and the $30
  guest rate in *data* rather than *constants* is also exactly what a second
  club would need. Apply that instinct to new code generally: club-specific
  numbers belong in rows, not in `const`s.
- **Do not build a feature-flag system.** One hypothetical customer does not
  justify it. If a group ever doesn't want dues, hiding one nav item is a
  half-hour job on the day.

Multi-tenancy gets its own PRD if and when it is a real decision, after one
October has actually been run. It is not a dues concern and must not be allowed
to expand this build against a fixed deadline.

## Success criteria

1. For a given dues year, one page shows every person who owes, **what they owe,
   what they have paid so far, the outstanding balance**, and for each payment
   how and when.
2. Recording a payment is one action: person, amount, method, date — and
   **recording a second payment against the same person and year is the same
   action, not a special case**.
3. **Status is three-state: unpaid, partially paid, paid in full**, derived from
   `owed − sum(payments)`, never hand-set.
4. Each person's bucket (current / returning / guest) is visible and filterable,
   so the October chase can be worked in passes.
5. A guest who converts keeps their history — their guest visits and their
   first membership year are both visible on one record.
6. `memberSince` is **editable on the player card** and safely null when unknown.
7. "Years with the group" is derivable per player and correct for people who
   predate the app — and is not displayed anywhere until seeding is sufficient.
8. Payment records are auditable: who recorded it, when, and edits don't
   silently overwrite history.
9. The guest ledger's existing counts are unchanged by any of this.

## Scope

**In**

- A dues year concept, a per-year dues figure and guest rate, and payment
  records against them.
- **Installments**: many payments per person per dues year, with a running
  balance and three-state status.
- An admin **Dues** page: roster for the year, status and balance per person,
  record payment with method, filter by bucket and status.
- `memberSince` as an editable field on the player card.
- Bucket classification driven by existing `Player.onRoster` plus the `Guest`
  table.
- Guest → member conversion that preserves guest history.
- "Years with the group" per player, seeded for pre-app tenure.
- Guest per-game charges at $30 with no ceiling, folded in, replacing the
  standalone settlement spec.

**Out**

- Taking payment. No Venmo/PayPal/Zelle integration — this records that money
  arrived, out of band, by whatever means. Integration is a different risk
  class entirely and needs its own conversation.
- Reminders, emails, automated chasing.
- **Scheduled** payment plans — agreed instalment dates, expected-next-payment,
  overdue logic. Installments are *recorded* as they arrive; they are not
  *planned* in advance.
- Pro-rata mid-year joins (see Q5).
- Capping or forgiving accrued guest charges.
- Changing how `onRoster` works today; the dues page proposes flips, it
  doesn't silently perform them.

## Data model

```prisma
// One payment event. Points at EITHER a Player or a Guest, never both.
// Several rows per person per dues year is the NORMAL case, not an edge case:
// installments are recorded as they arrive.
model DuesPayment {
  id         String   @id @default(uuid())
  duesYear   Int      // the year covered, e.g. 2027
  playerId   String?
  guestId    String?
  amount     Decimal  @db.Decimal(10, 2)
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

// What a year costs. One row per dues year. Exists because installments make
// "paid?" a comparison rather than a lookup — without an owed figure there is
// nothing to compare the sum of payments against.
model DuesYearConfig {
  duesYear      Int      @id // e.g. 2027
  targetAmount  Decimal  @db.Decimal(10, 2) // what the club needs, e.g. 6000.00
  memberAmount  Decimal  @db.Decimal(10, 2) // per member, set at collection open
  guestGameRate Decimal  @db.Decimal(10, 2) // per billable guest game, e.g. 30.00
  openedAt      DateTime? // when collection opened and memberAmount was fixed
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

```prisma
// Who was on the hook this year, and for how much. Written when collection
// opens; later joiners get a row with joinedAt set. Owed is CAPTURED, not
// derived — alumni are 0, and the 2028 discounts land in the same field.
model DuesRosterEntry {
  id         String   @id @default(uuid())
  duesYear   Int
  playerId   String
  amountOwed Decimal  @db.Decimal(10, 2) // 0.00 for alumni and other exemptions
  exemptions String?  // "alumni" | "discount:top_scorer" | … ; null = pays full
  note       String?  // per person per year, independent of any payment
  joinedAt   DateTime? // null = present when the year opened
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([duesYear, playerId])
  @@index([duesYear])
}
```

Plus on `Player`:

```prisma
  memberSince Int?  // first dues year, hand-seeded; editable on the player card
```

**Why one table, not separate member/guest payment tables.** The October
conversation is one list, and splitting it makes the "who still owes me" query
a union for no benefit. `playerId` xor `guestId` is enforced in the service
layer rather than a DB constraint, matching how this codebase already handles
its invariants.

**Why `Decimal`, not `Float`.** Money in a float will eventually produce a
total that doesn't match the sum of its parts, and this is a record people
will check. Installments make this worse, not better — three float payments
summed against a float total is exactly where the cent goes missing, and the
person mid-installment is the one most likely to check. `amount` is now
required (Q4 answered: amounts).

## Who actually owes — and a count that doesn't reconcile

Alumni exemption makes "owed" a per-person question, not a per-year one. Queried
production 2026-08-08 (read-only counts):

| | Count |
|---|---|
| Players in DB | 83 |
| On roster | 71 |
| …of which `GuestN` pool slots | 14 |
| **Real rostered people** | **57** |
| Flagged `isAlumni` | **14** |
| **Implied payers if alumni are free** | **43** |

**RESOLVED 2026-08-08. The rule is simply: bill everyone who is not alumni.**
The `isAlumni` flags are correct (owner), so **43 people get a row and a bill**,
and no audit is needed. The earlier request to audit them was mis-aimed and is
withdrawn.

**The 35-vs-43 question dissolves, because the rate is an input, not a
derivation.** I was trying to compute `$6,000 ÷ payers` to reach a price. That
was wrong: the owner *sets* the rate at the start of each dues season, at his
discretion, historically $150–175. $6,000 is roughly what **lands** — 43 billed
at ~$150 is ~$6,450 on paper, and a handful never pay, so ~$6,000 arrives.
**~35 was how many actually pay, not how many are billed.**

Consequences, and they simplify things:

- **`memberAmount` is entered, never computed.** No divisor, no dependency on
  the payer count, no circularity. Set once at season open, frozen, recorded
  with `openedAt`.
- **`targetAmount` is a progress bar and nothing else.** It never drives a
  balance. Its only job is telling the owner how the collection is going.
- **The unpaid tail is a feature of the display, not an error.** If ~8 of 43
  routinely don't pay, the dues page's real value is making that visible for the
  first time — those people are currently invisible.

**Consequence for the model:** `owed` is captured **per person** on the roster
snapshot row, not derived from `memberAmount` at read time. Alumni get 0. This
also means the 2028 top-scorer / top-sportsmanship discounts need no new
structure — they are the same field.

**Why both a target and a per-member figure — resolving the budget-led problem.**
The owner works from a pot: *"2027 will be $6k, current and returning pay the
same."* Taken literally that is budget-led, which I flagged as unbuildable for an
October page, because per-head = target ÷ payers and payers aren't known until
the collection ends. Storing **both** figures dissolves it:

`targetAmount` is the goal ($6,000). `memberAmount` is a **decision made once**
when collection opens — informed by target ÷ expected roster ($6,000 ÷ 55 =
$109.09, in practice rounded to a number you'd announce), then **frozen for the
year**. Everyone is told the same figure on day one, balances are knowable
immediately, and the target becomes a progress bar rather than a divisor. If
the roster shifts afterwards you land slightly over or under, which is what
already happens today.

`openedAt` records when that decision was made, so a mid-year rate argument is
settled by data rather than memory.

**Per-person adjustments — not built, not precluded.** The 2028 plan to discount
the top goalscorer and top sportsmanship breaks uniform pricing: owed becomes
per-person. Deliberately **out of scope now**, but it lands cleanly later as a
nullable adjustment column on the roster-snapshot row (see below), because that
row already exists per person per year. No schema decision today needs to
anticipate it beyond not hard-coding "owed = memberAmount" in more than one
place.

**Why the rates live in a table, not a constant.** Dues and the guest rate will
change at some point. A constant in code silently rewrites every past year's
balances the day it changes; a per-year row means 2027 stays $X forever and
2028 can be $Y. It also puts the $30 guest rate somewhere the guest ledger can
read instead of hardcoding it a second time.

**Why no `owed` column on a person.** Owed is `DuesYearConfig.memberAmount` for
members and `billableVisits × guestGameRate` for guests — both derived. Storing
it would create a second source of truth that drifts the first time a rate is
corrected.

**Why `memberSince` is hand-seeded.** Tenure cannot be derived — per-player
rosters exist only from 2025, and the club goes back to 2018. Anyone who
predates the app would show as a rookie. One integer per player, entered once.

**Bucket derivation** — not stored, computed: `Player.onRoster === true` →
current; `Player.onRoster === false` → returning; a `Guest` row with no linked
Player → guest.

## Guest → member conversion

Answers the truncated question from 2026-08-07 and PRD Q6 of the settlement
spec.

Conversion creates a `Player` and links the `Guest` to it via a **new
`Guest.playerId` field — which does not exist yet.** Phase 3 therefore needs a
schema change, unlike Phases 0–2b.

**Both policy questions RESOLVED 2026-08-08 (owner):**

- ✅ **On-pitch history migrates, reliability does not.** Goals and assists move
  onto the new `Player` record; games played before membership are **excluded
  from reliability denominators**, so a convert doesn't read as a serial ghost
  for games they were never asked to RSVP to. `GuestVisit` makes this possible —
  it records which human held which slot in which game.
- ✅ **Joining wipes the guest balance.** Membership covers it. This is the
  pitch — *"pay the $175 and we're square"* — and it is what makes uncapped
  guest charging work as a conversion lever rather than just a debt.

### What that costs, and why it is not free

Migrating goals means **rewriting `Game.goals` JSON on historical games**, remapping
`scorerId`/`assisterId` from the `GuestN` slot id to the new player id. That is a
mutation of finished match records, and it moves season totals, chemistry
pairings and MOTM. Consequences to respect when building it:

- **Back up every touched game's JSON before writing**, and make the whole
  conversion one `$transaction`.
- **Dry-run pass first**, per standing practice for bulk prod writes.
- **It is not cleanly reversible** once leaderboards have been recomputed and
  seen — the backup is the undo.
- The reliability exclusion needs a "member since" boundary per converted
  player, which `Guest.playerId` plus the new `Player.memberSince` can carry.

### Sequencing — there is nothing to convert yet

As of 2026-08-08 production holds **one named guest (Ricky), one visit, zero
billable games, zero conversion candidates.** The prompt fires at 6 billable
games — the 8th visit in a dues year — so the first real case is months away.

**Recommend building this after the October collection**, not before. October is
the fixed deadline and its screens are still unsmoked; conversion has no pending
cases and would be built entirely on speculation. The decisions above are the
perishable part and they are now recorded.

## Smallest viable cut — SELECTED 2026-08-08

Phases 0–2 below, and nothing else. That is:

1. `DuesPayment` + `DuesYearConfig` tables, `Player.memberSince`.
2. A Dues page listing the current roster for the year with owed / paid /
   balance, three-state status, and a "record payment" action capturing amount,
   method and date — repeatable for installments.
3. `memberSince` editable on the player card.
4. **Nothing else** — no buckets, no filters, no guest folding, no conversion
   flow, no tenure stat, no achievement.

That gets you through October with a real record. Buckets, guest folding,
tenure and the achievement are all additive afterward and none of them
invalidate the data captured in the meantime.

## Proposed re-cut — pull guest balances into the cut (owner decision needed)

The cut as selected covers **members only**; guests were Phase 3. The admin-load
reframe argues that is backwards, and the cost argues it is nearly free.

**Why it may be backwards.** Members pay once a year — 55 rows, one October, a
genuinely light load. Guests are where the recurring hassle actually lives:
they turn up weekly, in ones and twos, and the owner has explicitly chosen an
uncapped charge *because* tracking them per game is intolerable. Shipping the
easy half first and leaving the painful half to Phase 3 optimises the deadline
but not the stated objective.

**Why it is nearly free.** The expensive parts already shipped last week.
`guests.ts` already resolves durable guest identity, counts visits, applies the
annual free trial, and returns `billableVisits` per guest. Once
`DuesYearConfig.guestGameRate` exists, a guest's balance is
`billableVisits × guestGameRate` minus payments recorded against `guestId` —
which `DuesPayment` already supports. That is a multiplication and a subtraction
over data that is already live, not a new subsystem. **Estimate: hours, not a
phase** — the real work is UI, and the guest ledger tab already exists to hang
it on.

### Conversion prompt

The single highest-value item for the stated objective, and it falls out of the
same arithmetic for free:

> **Marco — 7 billable games · $210 owed · yearly is $110.**
> *Has passed the member figure. Suggest converting.*

That is the pitch, computed, sitting on the screen at the moment it is true. It
removes the exact thing the owner would otherwise have to remember and work out
at the side of a pitch, and it turns the uncapped rule from a passive
accumulation into an actual mechanism. Flag threshold: guest balance ≥
`memberAmount`.

**Recommendation:** fold guest balances and the conversion flag into the cut as
**Phase 2b**, and push buckets, filters, and the full conversion *flow* (history
migration, the policy calls in Q5–Q7) to Phase 3 as planned. Accept it only if
Phases 0–2 are on track first — October is still the fixed constraint, and a
guest tab that is late is a guest tab that missed the point.

## Plan

**Phase 0** — schema (`DuesPayment`, `DuesYearConfig`, `Player.memberSince`).
Preview with `migrate diff`, then bare `db push`, no `--accept-data-loss`.
Seed the 2027 `DuesYearConfig` row (needs Q8 — the annual figure).

**Phase 1** — payment write/edit/delete routes; dues-year status service
returning owed, paid, balance and status per person. Verify against a stubbed
Prisma before any UI. Cases to cover, expanded for installments:

- no payments → unpaid, balance = full
- one payment below the figure → **partially paid**, balance = remainder
- several payments summing exactly to the figure → paid in full, balance 0
- several payments summing **over** the figure → paid, negative balance surfaced
  rather than clamped to zero (an overpayment is a real thing that happened and
  hiding it is how you get the dispute)
- a payment recorded against the wrong year → does not leak into this year
- a player with no `DuesYearConfig` row for the year → explicit error, not a
  silent zero owed

**Phase 2** — Dues page: roster for the year, owed/paid/balance, status,
record payment (repeatable). `memberSince` field on the player card.
*(Phases 0–2 are the selected cut. Stop here and smoke before anything below.)*

**Phase 2b** *(proposed — see "Proposed re-cut")* — guest balances
(`billableVisits × guestGameRate` − payments) on the existing guest ledger tab,
plus the conversion prompt when a balance crosses `memberAmount`. Hours, not a
phase, because `billableVisits` already ships. Gated on 0–2 being smoked.

**Phase 3** — buckets and filters; guests merged into the main dues list; the
full conversion *flow* (history migration + the Q5–Q7 policy calls).

**Phase 4** — `memberSince` bulk seeding view + "years with the group" on the
player profile, displayed only once seeding is sufficient.

**Phase 5** — tenure achievement, following the existing `services/achievements.ts`
pattern.

**Effort:** Phases 0–2 roughly a day, plus a little for the config table and
balance arithmetic. All five, three to four days.

## Risks

| Risk | Mitigation |
|---|---|
| Half-built in October, looks authoritative, isn't | Ship the smallest viable cut early; don't start Phase 3 until 0–2 are smoked |
| Money totals disputed | `Decimal` not float; payment log is append-with-audit, edits keep history |
| Installment balance off by cents | Sum in `Decimal` end to end; never round for display before the subtraction |
| Someone mid-installment reads as "unpaid" and gets chased | Three-state status is a Phase 1 acceptance case, not a Phase 2 UI nicety |
| `DuesYearConfig` row missing for a year → everyone reads as owing nothing | Explicit error from the status service, never a silent zero |
| Tenure wrong for long-standing members | `memberSince` nullable and editable; stat displayed only from Phase 4 |
| Achievement fires on incomplete data | Phase 5 last, gated on Phase 4 seeding being done |
| Dues page silently changes the roster | It proposes `onRoster` flips; a human confirms |

## Open questions

**Answered 2026-08-08:**

1. ~~**Dues year boundary — is it 1 Oct – 30 Sep?**~~ **No — it is the CALENDAR
   year**, with an Oct–Dec collection window. My earlier "confirmed" was wrong;
   the historical sheet contradicted it and the owner settled it 2026-08-08.
   `guests.ts` corrected the same day, pre-merge.
3. ~~**`memberSince` for existing players — do you know it?**~~ **Partially.**
   Seed what is certain, leave the rest null, correct it over time from the
   player card. The field ships in the cut; the stat that reads it does not.
4. ~~**Amounts, or just paid/unpaid?**~~ **Amounts** — and **installments**, which
   is the larger of the two answers. See "What the 08-08 decisions changed".

**Answered 2026-08-08 — Phase 0 unblocked:**

8. ~~**What is the annual dues figure for 2027?**~~ **Target $6,000, uniform
   across current and returning players.** Resolved as target + frozen
   per-member price (see "Why both a target and a per-member figure"). **One
   assumption to confirm on sight rather than in advance:** `memberAmount` for
   2027 is seeded at **$110** ($6,000 ÷ 55 = $109.09, rounded to an announceable
   number). Change it in the config bar if you announce something else — it is
   one editable field, not a code change.

**Superseded detail, kept for reasoning:**

~~8. **What is the annual dues figure for 2027 — per member?**~~
   Owner 2026-08-08: *"dues vary year over year but have been around 6k for the
   past 3 yrs."* **That is a pot total, not a per-member price**, and the model
   needs the per-member price. `memberAmount` is what each person owes; $6k is
   roughly what ~55 of them add up to. $6,000 ÷ 55 = $109.09, which is not a
   number any club announces, so the real per-head figure is a round one nearby
   and I am not going to guess between $100 and $125 — that is a 25% error on
   every balance in a money system.

   The fork underneath it:

   - **Price-led** — the club announces a per-member price; the pot is whatever
     that price × payers comes to, and "around 6k" is the outcome. `memberAmount`
     is the primitive. **Everything specced above works unchanged.** *Assumed.*
   - **Budget-led** — the club needs ~$6k to cover the season and divides by
     heads. Then the per-member figure is *derived*, moves as the roster
     changes, and — fatally for an October page — isn't knowable until you know
     who paid. That needs a provisional figure plus a true-up, and is a
     materially different build. Say so before Phase 0 if this is the reality.

   Also still open from the original question: does the figure differ between
   current and returning players? If yes, owed becomes per-person rather than
   per-year and the phases need re-cutting before any schema lands.

**Also answered 2026-08-08 (by the admin-load reframe):**

2. ~~**Do guests' per-game charges get collected in October too, or as they
   go?**~~ **Neither — it is a rolling balance, settled opportunistically.**
   Per-game collection is the hassle being designed out. The balance simply
   accrues and is squared up whenever it makes sense, which is why it must be
   visible at all times rather than assembled at year end.
9. ~~**Should the app nudge conversion when a guest's balance passes the annual
   dues figure?**~~ **Yes — and it is the mechanism, not a nicety.** If uncapped
   accrual is what converts guests, the crossing point is the whole design.
   See "Conversion prompt" below.

**Still open — Phase 3 and later:**

10. **How does a guest learn their balance is climbing?** *(New, and it is a
    hole in the mechanism.)* Uncapped accrual only deters if the guest feels it.
    The ledger is admin-only, so today nothing tells them — meaning the pressure
    lands as one awkward conversation months later, which is exactly the load
    this project is removing. Options, cheapest first: (a) the owner mentions it
    and the app just makes the number instant, (b) a shareable per-guest
    summary, (c) a guest-facing view. **(a) is almost certainly right for
    October** — see "Conversion prompt".
5. ~~**Someone joins in March — full year or pro-rata?**~~ **Full price, unless
   ≤3 months remain in the season, then owner's discretion** (2026-08-08).

   Builds as a **default with an override**, not a formula: adding someone
   mid-year writes `DuesRosterEntry.amountOwed = memberAmount`, and once the
   join date falls inside the last three months the field pre-fills lower with a
   note explaining why, editable before saving. No new structure — `amountOwed`
   is already captured per person for alumni.

   ⚠️ **Edge case worth knowing about.** The dues year is the calendar year and
   the last three months are Oct–Dec — which is exactly when collection for the
   *following* year opens. So someone joining 15 Oct 2027 has 2.5 months left in
   2027 while the 2028 collection is already running. In practice you would
   probably just bill them for 2028 and let the stub of 2027 go. **Recommend the
   app offers that**: "3 months left in 2027 — bill for 2028 instead?" It turns
   a fiddly discretionary call into one tap, which is the whole point of this
   project.
6. **What does the achievement celebrate?** Consecutive years, or total? Does a
   gap year reset it? *Recommend total years, no reset — a gap year is life,
   not failure, and the Highlander already covers the streak flavour.*
7. ~~**Does paying dues auto-flip `onRoster` for next season?**~~ **Yes, proposed
   with a confirm, never silent** (2026-08-10). "Paid" means balance ≤ 0, not
   "has any payment". Offered as an end-of-collection sweep rather than a
   per-payment prompt — October is worked in passes, so "31 paid in full, roll
   them into 2027?" is one decision instead of thirty-one.

---

## Roster lifecycle — decided 2026-08-10

The October loop the owner described: paying in full keeps you on next season's
roster and your player card stays with the roster; leaving takes you off it and
moves the card to prior members. Three of the four pieces did not exist.

**What "Sync roster" actually does, since it was assumed to do this.** It runs
roster → dues list, not payment → roster: `openDuesYear()` copies every
`onRoster: true` player into the year's snapshot, skipping `GuestN` slots, with
alumni at 0. Nothing in the app has ever written `onRoster` except the hand
toggle in `EditPlayerModal`.

### Leaving — `amountOwed = amountPaid`

**People who leave are leaving the city, and dues are not refunded** (owner,
2026-08-10) unless they tell him within a few weeks, which is rare enough to be
a manual correction rather than a feature.

One rule covers every case, and it *is* "I keep the dues" written into the
ledger:

| Situation | Owed becomes | Balance | Reads as |
|---|---|---|---|
| Paid in full, then leaves | unchanged | 0 | Settled |
| Part paid $75 of $150, then leaves | $75 | 0 | Settled — kept |
| Never paid, then leaves | $0 | 0 | Not billed |

A flat zero-out was the first proposal and was **wrong**: it would have made
every part-payer read as having overpaid by what they'd handed over.

Consequences:

- **Never a delete.** A deleted row makes reinstatement indistinguishable from a
  fresh join, and people who leave do come back.
- **The original bill is auto-noted** — *"Left — billed $150.00, kept $75.00"* —
  because the flip otherwise destroys what they were billed, against success
  criterion 8.
- **Refunds are out of scope.** The only mechanism today is deleting the payment
  row, which erases the record that money moved; `recordPayment` rejects
  amounts ≤ 0, so there are no negative payments. The Left confirm states what
  it is keeping so the choice is visible: *"Keeping the $75 paid. Refunding
  instead? Delete the payment first."*
- **`onRoster` flips to false**, so the next year's sync never picks them up.
  That is the whole "removed from next season's roster" ask.

### Alumni and Left are separate statuses (owner, 2026-08-10)

They must never share a bucket, and this **corrects the "no schema change"
estimate given earlier in the discussion**. `exemption` is a *pricing reason*
and is destined to hold `discount:top_scorer` in 2028; leaving is a *lifecycle
event*. Stacking them collides — an alumnus who leaves would overwrite
`'alumni'` with `'left'` and lose why they were at zero.

So: one nullable column, `DuesRosterEntry.leftAt DateTime?`. Person-level fact
stays `Player.onRoster = false`; year-level fact is `leftAt`. No `leftAt` on
`Player` — leaving is recorded against the year it happened in.

`classify()` gains the entry and a precedence order: `leftAt` set → `left`,
else zero owed → `exempt`, else the existing paid/partial/unpaid. Six chips, and
`left` rows sit behind their own chip rather than cluttering the working list.
Leavers are also excluded from `totals.billed`.

### Defect — zero-owed rows swallow payments

`classify()` tests `owed.isZero()` **before** it looks at what was paid, so any
payment against a zero-owed row renders as "Alumni · Not billed" with a balance
of `—`, while `totals.amountCollected` silently adds it to the progress bar.
Money recorded, row says otherwise, progress bar disagrees with the row.

This is live today for **an alumnus who chips in voluntarily**; it is not
introduced by the Left work, it is merely made routine by it. Falls through to
`overpaid` instead.

### Adding people mid-year — the missing door

`DuesRosterEntry` rows are created in exactly one place, the bulk `createMany`
inside `openDuesYear`. There is no single-person add and no delete, so the only
way to bill a new or returning member is Players tab → set Current → Dues tab →
Sync roster. It works, and it is neither discoverable nor correct: everyone
lands at full `memberAmount`, and **`joinedAt` is never written by anything**
despite being in the schema, returned by the API, and rendered on the row.

Q5's pro-rata rule is in the same state — `monthsRemainingInDuesYear` and
`isProrataWindow` are written, exported, and **called by nothing**. Both are
waiting on an add-person flow.

`POST /api/dues/:year/entry` is that flow, and it doubles as the reinstate path
for someone who left and later decides to pay: it must restore `amountOwed`
rather than merely accept the payment, or the defect above swallows it.

**Where `joinedAt` gets captured — three points, decided 2026-08-10.**

1. **The add-person modal**, as a date defaulting to today, sitting directly
   above the amount. It is the input that decides whether the pro-rata rule
   fires, so changing it re-computes the amount hint off `isProrataWindow`, and
   in Oct–Dec it triggers the "bill for next year instead?" offer. Default plus
   editable also covers backfilling someone who actually joined in March.
2. **`openDuesYear` stamps it**, for anyone added once `config.openedAt` is
   already set. This closes a hole that would otherwise be hit within a week:
   Sync roster is the button the owner will actually reach for when someone new
   turns up, and today it would file them as founding members at full price
   with no join date. The first sync of a year runs while `openedAt` is still
   null, so the founding cohort correctly stays null; every sync after it is by
   definition mid-year. No new input, one conditional.
3. **`PATCH /api/dues/entry/:id` accepts it**, for correcting a date after the
   fact. The route already takes `amountOwed`, `exemption` and `note`.

**`joinedAt` is not `memberSince` and must not be merged into it.**

| | Lives on | Means | Drives |
|---|---|---|---|
| `joinedAt` | `DuesRosterEntry`, per year | joined *this* dues year mid-flight | pro-rata, this year's bill |
| `memberSince` | `Player`, permanent | first dues year ever | tenure stat, future achievement |

Someone who leaves in 2027 and returns in 2029 gets a fresh `joinedAt` on the
2029 row and keeps `memberSince: 2021`. Merging them breaks tenure for exactly
the longest-standing members. Display stays on the dues row, correctly hidden
when null; it never goes on the player card.

### Guest filter chips

The chip row filters `members` only — `GuestSection` renders every guest
whatever is selected. The chips will filter guests too, with **Convert**
(already computed as `shouldConvert`) standing in for Alumni, which has no
meaning for a guest. *Assumption, stated 2026-08-10 after the question went
twice unanswered.* Tagging a guest **as** alumni so they bill $0 is a pricing
rule, not a filter, and is additive later if that was the intent.

### Dues leaves the Stats hub

Dues and Guests become one admin-only bottom-nav tab wedged between Stats and
Profile — bill-and-ball icon — so Stats is performance data again. `BottomNav`
has no auth awareness today and will need it. Six tabs is tight on a 375px
phone, not broken.

### Opening a year is manual, and closing one had no mechanism

There is **no scheduler anywhere in this app** — no cron, no dependency, nothing
on a clock but the WhatsApp listener's reconnect. A dues year exists only once
someone selects it and fills the setup form, which is the right default (nobody
wants a year auto-opened at rates nobody announced) but has two consequences
that were invisible until asked about directly.

**Opening the year ahead.** Four steps, every October: Dues tab → year dropdown
→ rates → "Open <year> and copy the roster". The snapshot is taken at that
instant, so departures must be marked **Left** *before* opening the next year —
which the lifecycle work now makes automatic, since Left flips `onRoster` off
and the sync only picks up people who are on it.

Nothing announced that October had arrived, so a **collection-window banner**
now appears on the Dues page when the window is open and the year ahead has no
config row, with a one-tap route into setup. It reads `duesYearConfig` rows that
already existed rather than inventing state.

**Closing the year out — the hole the lifecycle work left.** Staying on the
roster is the default and only *leaving* is an action, so someone who never paid
and never said they were going rolls silently into next year's bill. That is
precisely the ~8-person unpaid tail the "who actually owes" section predicted,
and nothing caught it: paying needed no action, so Q7's roster flip turned out
to be a non-problem, while its mirror image had no mechanism at all.

`POST /api/dues/:year/sweep` is that mechanism — one transaction over the people
whose status is `unpaid`, reusing the same Left rule. Design calls worth keeping:

- **Nobody is pre-selected.** This list is exactly the people who might be
  mid-conversation about paying, and sweeping one by accident is worse than an
  extra tap. "Select all" is one tap away.
- **Part-payers are never listed.** Someone mid-installment is not a leaver.
- **Rows already marked, or from another year, are skipped rather than failing
  the batch**, so re-running is safe.
- **One transaction**, so a failure halfway does not leave the roster
  half-swept.

### Rates are set once and then unreachable

`targetAmount`, `memberAmount` and `guestGameRate` are editable only in the
`SetupYear` form, which renders only while the year has **no** config row. After
that they are read-only text. `PUT /api/dues/:year/config` and the frontend
`saveDuesConfig` both already exist — this is a missing edit affordance, nothing
more.

**Changing the rate will not recalculate anybody**, and that is deliberate:
`amountOwed` is captured per person, which is what lets alumni sit at 0 and
hand-adjusted amounts survive. The target has never driven a balance; per-head
is entered, never derived (see "Why both a target and a per-member figure").
The edit form will show a live hint — *"$6,000 ÷ 43 billable = $139.53"* — and
keep the entered figure authoritative. A mass re-apply after a rate change is
**out** unless asked for; it needs its own rules about who it skips.

---

## Sign-off

- [x] Scope warning read and accepted
- [x] Full build vs smallest viable cut decided — **smallest viable cut,
      Phases 0–2** (2026-08-08)
- [x] Q1 (year boundary), Q3 (`memberSince` availability), Q4 (amounts) answered
- [x] **Q8 answered** — $6,000 target, uniform pricing (2026-08-08)
- [x] Data model approved — `DuesPayment`, **`DuesYearConfig`**,
      `DuesRosterEntry` (snapshot), `Player.memberSince` — shipped
- [x] **Q7 answered** — paid-in-full proposes the roster flip, confirmed, as a
      sweep (2026-08-10)
- [x] **Refund policy answered** — dues are kept, not refunded (2026-08-10)
- [x] **Alumni and Left must be separate statuses** (2026-08-10) — costs one
      nullable column, `DuesRosterEntry.leftAt`
- [x] **Roster lifecycle build approved and built** (2026-08-10) — the six items
      below, plus **G** and **H** added after the "what do I do in 2028"
      question exposed them:
      **A** `POST /api/dues/:year/entry` (add + reinstate, writes `joinedAt`,
      fires the pro-rata default) ·
      **B** "Add someone" picker on the Dues page ·
      **C** Left → `amountOwed = amountPaid`, `leftAt`, `onRoster` false ·
      **D** `classify()` zero-owed defect + `left` precedence ·
      **E** Dues promoted to its own bottom-nav tab, Guests folded under it ·
      **F** editable rates bar + per-head hint ·
      **G** end-of-collection sweep (`POST /:year/sweep`) ·
      **H** collection-window banner
- [x] Guest chips confirmed as **(a) filter-only** (2026-08-10)
