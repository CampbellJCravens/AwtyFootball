# Dues arithmetic smoke test

Purpose: confirm by hand that the dues **maths** is right, not just that the
pages render. The pages were smoked 2026-08-15; this covers the part where a bug
produces a plausible-looking wrong number in a conversation about money someone
owes.

Takes about five minutes. Clears 5 of the 6 open cases in `CLUB_DUES_PRD.md`.

---

## Before you start — why this is safe

**Payments are deletable; roster entries are not.** There is no delete-entry
route (`routes/dues.ts` has `POST /:year/entry` and `POST /entry/:id/left`, but
no `DELETE`). So **do not add a throwaway person** — the row would sit on the
real 2027 roster forever, at best marked "Left". Use an existing member and
delete the payments afterwards instead. That leaves nothing behind.

**State as of 2026-08-15, verified against prod:**

| | |
|---|---|
| Configured years | **2026** (member $150) · **2027** (member $175) |
| Roster entries | 57 in each year |
| Payments recorded | **0 in both years** |
| Billed + unpaid + active in both years | 42 people |

Because the system holds **zero payments today**, cleanup is exactly verifiable:
when you're done, both years must read 0 payments again. If they don't, something
was left behind.

**Pick your subject** from the 42 billed in both years — e.g. *Abimael Lopez*,
*Adam Zebdawi*, *Ahmed Elgiar*, *Aihab Aboukheir*, *Ali Medjaouri*. Avoid
alumni (billed $0 — a different case), avoid yourself (you're `isAlumni`, so
$0), and avoid anyone who might actually hand you money mid-test. **Write the
name here before you start:** `________________`

Do the whole thing in one sitting so no real payment lands in the middle.

---

## The test

Dues is an **admin-only bottom-nav tab** (banknote-with-ball icon, between Stats
and Profile). Open it and select **2027** in the year dropdown.

### 1 — Unpaid baseline
Find your subject.

- [ ] Owed reads **$175.00**, paid **$0.00**, balance **$175.00**, status **unpaid**

*Covers: no payments → unpaid, balance = full.*

### 2 — Partial payment
Record a payment of **$50** (any method; note it as `SMOKE TEST` so it's
obvious if anyone sees it).

- [ ] Paid reads **$50.00**, balance **$125.00**
- [ ] Status changes to **partially paid** — not "unpaid", not "paid"

*Covers: one payment below the figure. Installments are the normal case here,
so a binary paid/unpaid would be the bug.*

### 3 — Instalments summing exactly
Record a **second** payment of **$125** against the same person.

- [ ] Two separate payment rows are listed, not one merged $175
- [ ] Paid **$175.00**, balance **$0.00**, status **paid in full**

*Covers: several payments summing exactly to the figure.*

### 4 — Overpayment must go negative
Record a **third** payment of **$25**.

- [ ] Paid **$200.00**, balance shows **−$25.00** — negative, **not clamped to $0**
- [ ] Status reads **overpaid**, distinct from "paid"
- [ ] The year's summary shows the overpayment **separately**, and does not let
      it cancel out someone else's debt in the outstanding total

*Covers: overpayment surfaced not hidden. This has bitten before —
`amountOutstanding` was once `billed − collected`, so one person's overpayment
masked another's debt (fixed 2026-08-08, never confirmed by a human). Step 4's
last box is the check on that fix.*

### 5 — No leak across years
Leave the payments in place and switch the year dropdown to **2026**.

- [ ] Same person reads owed **$150.00**, paid **$0.00**, balance **$150.00**
- [ ] None of the three 2027 payments appear here

*Covers: a payment recorded against one year does not leak into another. Note
the two years genuinely differ ($150 vs $175), so a leak is easy to spot.*

### 6 — Clean up
Back on **2027**, delete all three payments.

- [ ] Subject returns to owed $175.00, paid $0.00, balance $175.00, **unpaid**
- [ ] The year summary returns to **$0.00 collected**
- [ ] No leftover note or "Left" marker on the roster row

---

## What this does NOT cover

**A missing `DuesYearConfig` → explicit 409, not a silent "nobody owes
anything".** Can't be exercised safely right now: both 2026 and 2027 are
configured, and the only way to reach the unconfigured path is to look at a year
nobody has opened. If the year dropdown lets you select **2028** without opening
it, check you get a clear error rather than an empty roster reading as though
nobody owes anything — that misread is the dangerous one. Otherwise this case
waits until you open 2028 in October.

**Guest billing arithmetic** (2 free games per year, then $30/game uncapped, and
the convert prompt at balance ≥ member amount). Prod has 1 guest, 1 visit, 0
billable, so there is nothing to test against yet.

---

## If something fails

Stop and write down what you saw versus what you expected — the number, the
status label, and which step. Don't delete the payments: the broken state is the
evidence, and it's reproducible from the payment rows.

Money is `Decimal` end to end and leaves the service as fixed-2 **strings** —
if a number looks like a floating-point artefact (`$124.99999`), that's a parse
to float somewhere and is worth reporting verbatim.
