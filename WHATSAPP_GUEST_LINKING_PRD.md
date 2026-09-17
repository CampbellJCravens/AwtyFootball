# PRD — Identifying guests when linking a WhatsApp number

Status: **BUILT 2026-09-17** on `feat/link-number-to-guest`. Both packages typecheck clean, frontend prod build passes, 9/9 service assertions pass against a stubbed Prisma. **Not pushed, not deployed, schema NOT yet applied.**
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-09-17

## Problem

An unlinked number votes in the poll. The admin knows who it is — Amelia, a
guest — but the "Link to…" dropdown on `WhatsappUnmatchedFlag` renders
`players.map(p => p.name)`, and the guest pool is six recurring `Player` rows
literally named `Guest1`…`Guest4`. So the only guest choices are anonymous slot
numbers, and there is no way to say "this number is Amelia".

**Amelia already exists as a durable identity.** Prod has seven `Guest` records
(Amelia 2 visits, Duke, Stevo, Taymour, Tom, Derek, Taymur). The dropdown simply
doesn't know about them — it only lists `Player`.

## The trap in today's behaviour

`resolveContact(phone, playerId)` (`services/whatsapp/polls.ts:927`) does:

```ts
await prisma.player.update({ where: { id: playerId }, data: { phone: digits } });
await resyncPollsForPhone(digits);
```

Picking `Guest3` for Amelia's number would therefore:

1. **Permanently** write her number onto the `Guest3` slot row.
2. Re-attribute **every past and future vote** from that number to `Guest3`.
3. Burn the slot: `Player.phone` is `@unique`, so `Guest3` can never hold anyone
   else's number, while `Guest3` is *a different human every week*.
4. Give Amelia's actual `Guest` identity — the one that drives dues — nothing.

None of the four guest slot players currently has a phone, so this has not
happened yet. The fix should land before it does.

## What "identify the guest" has to mean

Two things, and only the second one actually solves it:

1. **Show who each slot is this week.** Annotate guest options from this game's
   `GuestVisit` rows: "Guest 3 · Amelia". Cheap — but only works once the guest
   has already been named on that game. Games 37 and 38 currently have **no**
   `GuestVisit` rows, so on a live poll the dropdown would still read "Guest 3".
2. **Link the number to the guest, not the slot.** List the durable `Guest`
   identities as link targets, so the admin picks "Amelia" by name.

## Proposed change

**Data.** Add `phone String? @unique` to `Guest` (mirrors `Player.phone`).
Deployed with `prisma db push`, per this repo's convention — no migration file.

**Backend.** `resolveContact` takes a target that is either a player or a guest:
- *player* — unchanged.
- *guest* — write the number to `Guest.phone`; find or create this game's
  `GuestVisit` for the first free guest slot and attach `guestId`; attribute the
  vote to that slot player's RSVP for **this game only**. The slot player's
  `phone` is never written.

**Listener.** When an incoming vote's number matches a `Guest.phone`, treat it
as that guest instead of unmatched: attribute to the guest's slot for that game
if one exists, otherwise surface it as "Amelia (guest) voted — assign a slot".

**Frontend.** Group the dropdown:

```
Link to…
── Members ──      Aaron, Ben, …
── Guests ──       Amelia, Duke, Stevo, Taymour, Tom
── Guest slots ──  Guest 1 · Taymour, Guest 2 · Duke, Guest 3, Guest 4
```

Guests before slots, slots annotated with this game's names where known. Picking
a slot directly stays possible but is no longer the only option.

## Scope — out

- Merging duplicate guest identities (see below) — separate, and it touches dues.
- Any change to how members' numbers link. That path works.
- Guessing a guest from a pushName. A wrong guess here is a wrong dues count.

## Risk / findings

- ⚠️ **`Taymour` and `Taymur` are both in `Guest`** (1 visit and 0 visits). The
  schema's own comment calls a split identity "a silently wrong dues count".
  Worth a merge, but out of scope here — flagging it, not fixing it silently.
- Deploy hazard: Render auto-deploys from `main`, and a deploy during a game
  being scored can wipe it (`gotcha-afc-autosave-wipes-on-failed-load`). Merge
  between match days.
- `Guest.phone` unique means one number per guest identity. That is the point,
  but it means a shared family phone can only belong to one of them.

## Plan

1. Schema + `resolveContact` split (backend, testable without the listener).
2. Dropdown grouping, which is the bit that makes it usable.
3. Listener recognition of a known guest number.

Steps 1–2 solve the reported problem on their own; step 3 is what stops it
recurring every week for the same person.

## Decided

**Auto-assign** (owner, 2026-09-17). A named guest who voted is coming; making an
admin place her by hand every week is the friction this removes.
`ensureGuestSlot` claims the lowest-numbered free slot, and returns null rather
than evicting anyone when the pool is full.

## A landmine found while building this

`replaceGuestVisits` **deletes and recreates a game's guest visits wholesale**
from whatever the client holds — the auto-save owns the full picture. The old
`onResolved` only bumped `pollVersion`, which refreshes the RSVP list and
nothing else. So a slot assigned server-side by a resolve would have been
**silently deleted by the next auto-save**, which is the same shape as
`gotcha-afc-autosave-wipes-on-failed-load`. `onResolved` now re-reads the game's
guest visits into state first. Any future server-side write to `GuestVisit` has
to do the same.

## What was built

- `Guest.phone String? @unique` — the number belongs to the identity.
- `ensureGuestSlot(gameId, guestId)` and `slotsForGuestPhones(gameId, phones)`
  in `services/guests.ts`. Slot ordering is numeric, so Guest2 comes before
  Guest10, and a member called "Guesto" is not mistaken for a slot.
- `syncPollToRsvps` resolves a guest's number to her slot for that game; members
  win any collision.
- `getUnmatched` no longer lists a number already known as a guest.
- `resolveContactToGuest(phone, guestId)` writes `Guest.phone` — never the slot
  player's — then re-syncs that number's votes.
- `POST /whatsapp/unmatched/resolve` accepts `playerId` **or** `guestId`.
- Both dropdowns (`WhatsappUnmatchedFlag`, `WhatsappSyncModal`) group into
  **Guests / Members / Guest slots**, values carrying a `p:`/`g:` prefix, slots
  labelled with this game's names where known.

## Still to do before this is live

1. `prisma db push` against prod to add the column — **not run**. Note the repo's
   `build` script runs `prisma db push --accept-data-loss` on deploy, so merging
   to `main` applies it automatically on Render.
2. Push the branch and get Campbell's review.
3. Merge **between match days** — Render auto-deploys from `main`.
4. Browser smoke: link Amelia's number to her guest identity and confirm the
   vote lands on a slot, the slot survives an auto-save, and her number stops
   appearing as unmatched next week.

## Coming next month — flagged, not built

Amelia becomes a **member** when dues are collected at the end of the month.
There is **no guest-to-member path in the codebase**: creating a `Player` named
Amelia would leave her visits and any `DuesPayment` rows attached to the `Guest`
record, and her number on `Guest.phone` where the member vote path never looks —
a split identity, the exact failure `normalizedName` uniqueness exists to
prevent. A `promoteGuest` action (create/attach the Player, move the phone,
re-point dues and visits, keep the guest row as history) is a small, separate
piece of work, and it should land before the month ends rather than after.
