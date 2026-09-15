# PRD — Remove a guest from a game

**Status:** DRAFT — awaiting sign-off. Nothing built.
**Raised:** 2026-09-05, after the owner deleted game #36 to escape this, which
cascade-deleted 22 imported RSVP rows.

## Problem

Tapping **Add guest** reserves a `GuestN` slot and assigns it to a team. Nothing in the
game view can undo that.

Every place the owner would reasonably look is a dead end:

| Where he looked | What's there |
|---|---|
| Guest row in Active Players | A pencil (edit) button. No remove. |
| Pencil → `GuestDetailsModal` | **Skip** and **Save** only. No remove. |
| "Choose Teams" accordion | The one working path — and it is unusable in practice (below). |

The Choose Teams path fails for two independent reasons:

1. **The guest is listed as `Guest1`, not by their name.** The search box matches
   `Player.name`; the display name ("Amelia") lives in `guestVisits` and is never searched.
   Typing the guest's name returns *"No players found"*.
2. **Removal is an unlabelled toggle.** `handleTeamSelect` deselects when you tap the team
   chip that is *already* selected (`GameModuleExpanded.tsx:788-792`). There is no X, no
   "Remove", and no hint that tapping the highlighted chip undoes the add.

### Root cause: the capability exists and is wired to nothing

- `handleRemoveFromTeam` (`GameModuleExpanded.tsx:804`) is fully implemented and **called by
  no rendered control**.
- `ActivePlayersSection` receives it and throws it away: `onRemoveFromTeam: _onRemoveFromTeam`
  (line 109). `onTeamSelect` is dead in the same way (line 107).
- The persistence side is **already correct**: `saveGameData` filters guest visits to slots
  still on a team (`GameModuleExpanded.tsx:463-471`), so dropping the slot drops its
  `GuestVisit` with no backend change.

**So this is a missing button, not a missing feature.** No schema change, no new endpoint,
no service logic.

## Success criteria

1. A guest added by mistake can be taken off the game **in the place the owner is already
   looking**, in one tap plus a confirm.
2. The removed slot leaves no `GuestVisit` behind, and its `Guest` identity keeps its other
   visits and its dues history.
3. **Deleting the game is never again the cheapest way to fix a guest.**
4. No regression to the 291px stat-row width budget (see Constraints).

## Scope

**In**
- A **"Remove from game"** action for a guest slot, in `GuestDetailsModal` — the modal the
  pencil on every guest row already opens.
- A confirm step, because the add is cheap and the removal is silent.
- A guard: removal is **blocked** when that slot has recorded goals, assists, fouls,
  sportsmanship or a leave event. Message names what to clear first.

**Out**
- Deleting a `Guest` **identity** from the Dues → Guests ledger. Owner confirmed 2026-09-05
  this is not what he hit. Still unbuilt (`routes/guests.ts` has GET, GET /ledger, PATCH —
  no DELETE). Separate PRD if wanted.
- Removing a **regular player** added by mistake. Same gap, less acute — a member is
  findable by name in Choose Teams. Their row is also the width-constrained one, so it is a
  different change. Recommend as a follow-up.
- Deleting the underlying `GuestN` pool Player. The pool self-limits: **Add guest** reuses
  the lowest free slot, so the pool is 2 rows after 36 games. Nothing to clean up.
- Any change to the `Game.goals` JSON. Deliberately untouched — see Constraints.

## Constraints

- 📐 **The admin stat row has a hard 291px budget and the controls line is at 284px — 7px of
  slack.** Adding a control there silently eats the player's name (this shipped as a real bug
  on 2026-08-09). **This is why the action goes in the modal, not on the row.** Zero width cost.
- 🔴 **Do not touch goal records.** Editing a goal must PATCH, never rebuild — a rebuild
  already destroyed a golden-goal weighting once (`5415ea8`). Blocking removal when stats
  exist keeps this change entirely out of that file's danger zone.
- Guest exclusion across the app string-matches `/^Guest\d+$/` on `Player.name` at 6 sites.
  Nothing here writes a name, so none are affected.
- Frontend only. `npx tsc --noEmit` + `vite build` are the full check; there is no test suite.

## Plan

Smallest viable cut — one file's worth of real change:

1. `GuestDetailsModal.tsx` — accept `onRemove?: () => void` and `canRemove: { ok: boolean; reason?: string }`. Render a destructive-styled **Remove from game** above the Skip/Save footer, shown only when editing an existing guest (not while adding one). Disabled with the reason when blocked.
2. `GameModuleExpanded.tsx` — pass a handler that calls the existing `handleRemoveFromTeam(slotPlayerId)`, clears `guestVisits[slotPlayerId]`, and closes the modal. Compute `canRemove` from the slot's goals / assists / fouls / sportsmanship / teamChanges.
3. Confirm inline in the modal (a second tap that changes the label to "Remove — sure?"), not a `window.confirm`.
4. Verify: `tsc --noEmit`, `vite build`. 🔴 Browser smoke is the owner's — I'm headless.

Estimate: ~40 lines across 2 files. No migration, no deploy risk beyond the usual Render auto-deploy from `main`.

## Open questions

1. **Blocked vs forced.** Recommend **blocked** when the guest has stats: the real case is an
   accidental add with nothing recorded, and force-removal means rewriting the goals JSON —
   the one part of this file with a history of silent data loss. Override if you'd rather it
   always work.
2. **Regular players too?** Recommend yes, but as a follow-up — their row is the 7px-slack
   one, so it needs the width arithmetic doing properly rather than bolting on.
3. **Ledger delete** — do you also want to remove a guest *name* permanently (duplicates,
   typos)? Not what you hit today, so it's out unless you say otherwise.
