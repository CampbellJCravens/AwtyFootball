# PRD — RSVP Reliability, Guest Tracking & Poll Reset

Status: DRAFT — awaiting sign-off
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-07-14

## Problem

The app captures per-game RSVPs and a per-game roster, but never correlates
them per person. Three gaps:

1. **No per-player reliability.** We can't see who says "In" and actually
   shows, who flakes (said In, no-show), who ghosts (shows without RSVPing),
   or who never responds. Field Stats only has *aggregate* season
   response/show-up, and most of that is imported historical WhatsApp/Evite
   counts — not a per-person join.
2. **No guest-frequency visibility.** `guestCount` is stored per RSVP but never
   rolled up. We want to know, long-term, who repeatedly brings guests so we
   can have a quiet word.
3. **No way to reset a game's poll.** Admins can edit/clear one player at a
   time, but there's no wholesale reset. The 11 Jul poll needs one.

## Data foundation (already captured — no schema changes needed for reliability)

Per game, in the backend (Prisma/Postgres):

- `GameRsvp` rows: `gameId`, `playerId`, `status` (`yes`/`maybe`/`no`),
  `guestCount`, `setByUserId` (admin-override marker), timestamps.
- `Game.teamAssignments`: who was placed on Color/White = **who showed up**.
  Confirmed reliably filled for every *tracked* game. Untracked weeks (late
  May / Jun 2026) simply have no roster and are excluded automatically.
- Player list.

The app is the single source of truth. A WhatsApp screenshot is just a
broadcast image with no data link — it never overrides app data and app data
never "writes back" to it. WhatsApp replies enter the app only when an admin
keys them in via the per-player override.

## Definitions (per player, over *tracked* games only)

- **Tracked game** — a game with a non-empty `teamAssignments` roster.
- **Responded** — has any `GameRsvp` row for that game.
- **Committed** — RSVP `status = yes`.
- **Showed** — appears in that game's `teamAssignments` (Color or White).

Metrics:

| Metric | Formula | Reads as |
|---|---|---|
| Response rate | responded ÷ tracked games | "Do they even reply?" |
| **Show-when-committed** | (showed ∩ committed) ÷ committed | **Headline reliability / flake rate** |
| No-show count | committed AND not showed | Said In, didn't come |
| Ghost count | showed AND not committed | Came without saying In |
| Attendance rate | showed ÷ tracked games | Raw turnout |
| Guests brought | Σ `guestCount` over their `yes` RSVPs | Total heads invited |
| Games-with-guests | count of `yes` RSVPs where `guestCount > 0` | How often they bring someone |
| Guest-attach rate | games-with-guests ÷ their `yes` RSVPs | Habitual vs one-off |

Every % is shown next to **N** (games counted) so thin early samples are
obvious and newcomers aren't unfairly branded.

## Success criteria

- A sortable **per-player reliability** view: response rate, show-when-committed,
  no-show, ghost, attendance — each with N.
- A **guest-frequency** view: who brings guests most (total + attach rate).
- Metrics computed only from tracked games; untracked games excluded with zero
  manual effort.
- Admin can **reset a game's entire poll in ≤2 taps**, with a confirm step.
- No regression to the existing RSVP flow or Field Stats.
- **Reliability + guest views are admin-only** (gated behind `isAdmin`,
  server-side and in the UI). Non-admins never see per-player reliability.

## Scope

**In**
- Backend: reliability + guest aggregation endpoint(s) under the stats route
  (joins `GameRsvp` × `Game.teamAssignments` × players).
- Backend: `DELETE /api/games/:gameId/rsvps` — admin-only bulk clear of all
  RSVPs for a game.
- Frontend: "Reset poll" button + confirm modal in the RSVP admin row.
- Frontend: per-player reliability table + guest-frequency section (placement
  TBD — see open questions).

**Out (for now)**
- Backfilling RSVPs for untracked May/Jun games (no structured source).
- Reconstructing per-person data from old WhatsApp screenshots.
- Automated WhatsApp → app sync (manual admin entry stays).
- Auto-nudges to frequent guest-bringers — we surface the data; the
  conversation stays human.

## Constraints

- **Attendance proxy = roster placement.** A player physically present but
  never placed on a team wouldn't count. Accepted: we either track a game fully
  or not at all.
- Per-person reliability starts from in-app-tracked games only, so early N is
  small — always show N.
- Guests are anonymous headcounts, not identified people. We attribute guests
  to the *inviting* player, but can't identify the guests themselves.
- Collaborative repo — ships as PR(s), needs Campbell's review before deploy.

## Plan (smallest-viable-first, phased)

- **Phase 0 — Reset poll (tiny, unblocks 11 Jul).**
  Bulk-delete endpoint + button + confirm. Ship first; you self-serve the
  11 Jul reset.
- **Phase 1 — Reliability.**
  Aggregation endpoint + per-player table (response, show-when-committed,
  no-show, ghost, attendance, N).
- **Phase 2 — Guest frequency.**
  Guest leaderboard + per-player guest stats.

Each phase: `tsc` + build gate, browser smoke on mobile + desktop, PR per phase
(or Phase 0 alone, then 1+2 bundled — your call).

## Open questions

1. **Reliability universe** — count against *all* tracked games, or only games
   since a player became "active"? (Occasional players otherwise look
   unreliable.) *Recommend:* all tracked games, but show N and offer a "min 5
   games" filter.
2. **Placement** — new "Reliability" sub-tab under Stats, fold into the Players
   tab, or extend Field Stats? *Recommend:* new sub-tab under Stats.
   **DECIDED: admin-only — the view is gated behind `isAdmin` (UI + endpoint).**
3. **Does a `maybe` who shows count as reliable?** *Recommend:* headline
   reliability = show-when-**yes** only; track `maybe → showed` as a minor
   separate stat.
4. **Reset semantics** — hard-delete all RSVPs (matches today's per-player
   clear) or soft-archive? *Recommend:* hard delete; simple and consistent.
   Reversible only by re-entering.
5. **Guest policy** — `GUEST_MAX` is 2 per person per game. Do you want a flag
   when someone exceeds a *season* guest threshold, or just the raw leaderboard?
