# Former members as guests — PRD (approved 2026-10-03; goals count as a guest's)

## Problem
A former member (`Player.onRoster = false`) who turns up for a weekend, or to get back in shape, can only be
entered through **Add Guest** by typing their name. That creates a new `Guest` identity with no link to the
player they already are. Their history is split, the ledger cannot say "this is a former member", and if they
rejoin, the convert flow creates a second player with the same name (it warns, but the link is lost).

## Owner decisions (2026-10-03)
- Entry point: the **Add Guest** button on a team.
- Track their visits like any guest's.
- Billing: **the same as new guests**: the first 2 games of the dues year are free, then per-game. No
  special rate.

## Success criteria
1. After **Add Guest**, the guest dialog offers **"Former member?"**: a searchable list of `onRoster = false`
   players. Picking one fills the guest as that person.
2. A former member is ONE guest identity across all their visits, linked to their player record, never a
   new typed-name guest each time.
3. The Guests tab shows their visits, billable count and balance like any guest, with a **"former member"**
   tag.
4. If they rejoin, **convert →** reattaches them to their existing player (and puts them back on the roster)
   instead of creating a second player.
5. No change for typed-name guests or for current members.

## Design
- **Schema (additive, nullable):** `Guest.formerPlayerId String? @unique`. It names the player this guest
  identity stands for.
- **Backend:** the guest-visit save accepts `formerPlayerId`. It finds or creates the Guest with that
  `formerPlayerId` (name = the player's name; an earlier typed-name guest with the same name is linked rather
  than duplicated), then saves the visit exactly as today: GuestN slot, host optional. The phone is NOT copied:
  a number on a Player stays that player's (open question 2, default).
- **Guest ledger / dues:** unchanged maths (2 free per dues year). The ledger row carries `formerPlayerId` for
  the tag.
- **Convert:** `planPromotion` defaults `attachPlayerId` to `formerPlayerId`, so the preview says "Attaches to
  the existing player X". Promotion sets `onRoster = true` and KEEPS her existing `memberSince` (it was being overwritten with the
  first-guest-visit year).
- **Frontend:** a "Former member?" section in `GuestDetailsModal` (search plus list), above or beside the
  typed name. Choosing a player locks the name to theirs, and the host picker still works.

## Trade-off to accept or reject
Their **goals and stats that day go to the GuestN slot**, like every guest's, not to their old player profile.
The alternative is to put the former player directly on the team as themselves, so goals count on their
profile. But then every stat that excludes guests (Show %, reliability, roster counts) would need a rule for
"a non-roster player who is playing as a guest", and billing would have to come from somewhere other than
guest visits. That is a much bigger change. **Recommended: keep them as guests (this design).**

## Out of scope
- A former member's own guests (they can already be a host).
- Changing guest billing rates.

## Open questions
1. Stats trade-off above: OK to count their goals as a guest's?
2. If their WhatsApp number is still on their player record, should their poll votes count as a guest RSVP
   for that week? (Default: no change. A number on a Player stays that player's.)

## Built 2026-10-03 (branch feat/former-member-guests)
Verified against a throwaway Postgres with the new schema: one identity across visits, an earlier typed
visit folded in, the host kept, ledger 3 visits / 1 billable, convert attaches to the existing player and keeps
`memberSince`, typed guests unchanged. Frontend and backend tsc clean, vite build clean. Not browser-smoked.
