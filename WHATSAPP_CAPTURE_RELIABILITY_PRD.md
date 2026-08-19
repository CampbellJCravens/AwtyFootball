# PRD — WhatsApp Poll Capture Reliability

Status: **SIGNED OFF 2026-08-15. Phase 0 BUILT but NOT MERGED** — it sits on
branch `feat/whatsapp-capture-phase0` (`e8ed6e7`) and is not deployed, so the
health endpoint in production is still the one that reported ok through two
dropped weeks. Phases 1-2 gated on the Render log line (Q2); Phase 3 deferred.
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-08-15

## Problem

The listener has captured **two polls in five weeks**, and the last one was a
reconnect backfill, not a live capture:

| Captured | Question | How |
|---|---|---|
| 2026-07-15 | Soccer Saturday - 18Jul - 845AM - Stadium | live |
| 2026-08-07 | Soccer Saturday - 1Aug - 845 - Stadium | backfill on reconnect |

The 8Aug and 15Aug polls were never captured at all. Both needed a manual
screenshot reconstruction via `backend/scripts/import-poll.cjs`.

The failure is **specific to the poll-creation message**. Everything else works:

- The socket is up. `WhatsappContact.updatedAt` tracks live vote times exactly
  (13:33:54Z, 13:35:37Z, 13:37:44Z on 12 Aug, matching the screenshot's 08:33,
  08:35, 08:37 CDT).
- Votes are recognised. They reach `handlePollUpdateMessage`, find no poll row,
  and are discarded at `polls.ts:289`.
- Attribution works. The 1Aug poll matched all 20 voters to players.

Two candidate causes are already **ruled out**:

1. **Title filter.** `WhatsappSettings.titleFilter = "Soccer Saturday"`, and the
   15Aug poll was titled `Soccer Saturday - 15Aug - 845AM - Stadium`. Matches.
2. **Poll message version.** `getPollCreation` accepts any
   `pollCreationMessage*` field (`ea25ed9`), and `HEAD == origin/main`, so it is
   deployed.

### Leading hypothesis (~55%, UNCONFIRMED)

`capturePoll` writes the poll with a **single, unretried** `prisma.whatsappPoll.create`.
If that throws, the exception is caught at `listener.ts:242`, logged to Render,
and the poll is lost permanently — the creation message arrives exactly once.

`470acf2` ("Add Redis auth store so the listener stops burning Neon compute")
landed **2026-08-07**, the day of the last capture. Before it, rotating Signal
keys wrote to Postgres constantly, which is why Neon's compute was pinned awake.
That churn was also, accidentally, a **keepalive**. With it gone, Neon suspends
after 5 idle minutes as designed, and a poll posted into a quiet group on a
Wednesday morning is exactly the kind of lone write that lands on a cold
database. The fix for the compute burn plausibly broke poll capture.

Contact writes survive this because they recur across many messages. The poll
creation gets one attempt.

### Alternatives still live

- **~25% — the creation never arrived.** Socket was down at post time and
  offline sync did not replay it. Supported by both existing captures looking
  like reconnect backfills.
- **~15% — a new wrapper** `unwrapMessage` does not peel. Would have logged
  `Unhandled in-scope message type(s)`.

### The discriminating evidence

One Render log line from **Wed 2026-08-12 ~13:30Z**:

| Log line | Cause | Fixed by |
|---|---|---|
| `messages.upsert handler error: … Can't reach database server` | cold-Neon write loss | Phase 1 |
| `Unhandled in-scope message type(s): <field>` | new message shape | parser change, needs the field name |
| nothing | creation never arrived | Phase 3 |

This is not blocking: Phase 0 is cause-agnostic and makes the next occurrence
self-diagnosing within minutes.

## Success criteria

1. A poll posted while Neon is suspended is captured within 5 minutes.
   Test: suspend the Neon compute, post a matching-title poll in a test chat,
   observe the row.
2. `GET /api/whatsapp/health` distinguishes *session dead* / *session alive but
   capturing nothing* / *healthy*, and cannot report `ok` through a dropped
   week. The current endpoint reported `ok` through both.
3. Three consecutive Saturdays with zero manual screenshot imports.
4. Neon awake-hours do not rise week-over-week. The compute burn this
   architecture was built to solve must not return.
5. When capture does fail, it is visible on the RSVP tab the same day, not a
   fortnight later.

## Scope

**In**

- Durable poll-creation write: bounded retry, then spill to Redis and flush when
  Postgres is reachable.
- Orphaned-vote buffer so votes arriving before the creation lands are replayed
  rather than dropped.
- Honest health endpoint + an admin-visible "no poll captured for the next game"
  warning.
- Fix `listUnlinkedVoters`' keyspace bug (`polls.ts:547`): it joins
  `WhatsappContact` (keyed by **@lid**) against vote keys (keyed by **E.164**),
  so it always misses and every unlinked voter shows a null pushName. One-line
  fix, and it is the screen used when recovering a broken week.

**Out**

- Changing the poll's title, options, or who posts it. The group's habits are
  not ours to alter.
- Having the app post the poll itself. See Rejected alternatives — it would
  break vote decryption outright.
- Reworking attribution. It is not broken.
- Backfilling the 8Aug poll. Game #32's RSVPs are already reconstructed and the
  creation message is unrecoverable.

## Constraints

- **Render auto-deploys from `main`.** Merging is deploying. Shared repo with
  Campbell, so this goes through a PR.
- **Neon free tier**: 400 awake-hours/month, suspends after 5 idle minutes. Any
  fix that keeps the database awake to dodge cold starts defeats the purpose of
  `470acf2` and re-triggers the 2026-07-29 outage.
- **Upstash free tier**: 500K commands/month, currently in the low tens of
  thousands. Buffering is negligible against that, but it is not unlimited.
- **No local WhatsApp session.** The listener only runs when
  `NODE_ENV=production` or `WHATSAPP_LISTENER_ENABLED=true`, and testing capture
  end-to-end needs a linked account. Phase 1 must be unit-testable against a
  fake Redis (`RedisLike` already exists for exactly this).
- **Deadline**: the next poll goes up around **Wed 19 Aug**. Phase 0 should be
  live before then or we learn nothing new next week.

## Plan (smallest-viable-first, phased)

**Phase 0 — instrumentation (ship before Wed 19 Aug).** No schema change.
Rewrite `/api/whatsapp/health` to report `connection === 'open'`, newest
`WhatsappPoll.createdAt`, newest vote timestamp, and a count of votes seen for
uncaptured polls. Add an explicit `console.warn` on capture-write failure that
names the poll title. Cheap, cause-agnostic, and turns next Wednesday into a
five-minute diagnosis instead of a fortnight.

**Phase 1 — durable creation write.** Targets the leading hypothesis. Wrap the
`whatsappPoll.create` in bounded retry with backoff (the `withRetry` helper in
`import-poll.cjs` is already the right shape). On exhaustion, spill the
BufferJSON-encoded `{key, message}` to Redis under `wa:pending-poll:<id>` and
flush on the next successful Postgres touch. Redis is the right buffer here
precisely because it is up when Neon is not — it is already the auth store.

**Phase 2 — orphaned-vote buffer.** Votes are **encrypted with a secret carried
on the creation message**, so an orphaned vote is opaque until the creation
lands — buffering them is only worth anything alongside Phase 1. Store the raw
encrypted vote under `wa:orphan-votes:<pollId>` (same encoding as
`WhatsappPoll.pollUpdates`), TTL 14 days, and replay through the existing
decrypt path when `capturePoll` succeeds for that id.

**Phase 3 — deliberate reconnect backfill.** The only fix for "the creation
never arrived". On `connection === 'open'`, scan recent group history for
uncaptured polls, making deliberate what happened by accident on 7 Aug. Highest
risk (Baileys history-sync APIs are the least stable surface here) and lowest
confidence of being needed — defer until the Render logs land.

## Risks

| Risk | Mitigation |
|---|---|
| Retry blocks the `messages.upsert` loop | Bound it: 3 tries, ~2s/8s, then spill to Redis and return |
| Redis buffer never flushes, silently | Phase 0 health surfaces pending-poll count |
| Neon awake-hours creep back up | Compare weekly before/after; nothing here writes on a timer |
| Fixing the wrong cause | Phase 0 first; Phase 3 gated on the log line |
| Buffers grow unbounded | TTL on both Redis keys; orphan votes capped per poll |
| Encrypted orphan votes are unreadable forever if the creation is truly lost | Accepted. Screenshot import remains the backstop |

## Rejected alternatives

- **Have the app post the poll.** Superficially attractive — it would give us the
  creation deterministically. It breaks everything: a poll created by the linked
  account carries no `messageSecret`, so no vote could ever be decrypted
  (`polls.ts:300-307` already warns about this). Do not do this.
- **Attach a Render persistent disk and use the `file` auth store.** Fixes
  session durability but disables zero-downtime deploys, which is why
  `470acf2` chose Redis.
- **Cron keepalive to warm Neon on Wednesday mornings.** ~1 awake-hour/week,
  10 minutes of work, and it would mitigate the leading hypothesis without any
  code change. Worth keeping in the back pocket as a stopgap if Phase 1 slips
  past Wednesday, but it treats the symptom and only covers one of three causes.
- **Retire the listener; formalise the screenshot import.** Honest option and it
  deserves stating plainly: the listener has produced two usable captures in five
  weeks while consuming a large share of the engineering on this repo, and the
  manual import now takes about two minutes. If Phase 1 does not hold for three
  weeks, the commercially correct move is to stop paying for this feature and
  keep the script.

## Open questions

1. **Is `REDIS_URL` actually set on the Render service?** *Largely settled
   2026-08-15 by observation:* six commits deployed between 8 and 10 Aug, and the
   listener was still receiving live traffic on 12, 13 and 15 Aug, so the auth
   store **survives redeploys**. That empirically rules out the `file`-on-
   ephemeral-disk fallback and the "session dies on every redeploy" failure mode.
   It does not prove the store is Redis specifically — still worth eyeballing in
   the dashboard before Phase 1 spills anything into it.
2. **What did Render log at 2026-08-12 ~13:30Z?** Decides Phase 3.
3. **Who posts the poll each week?** If it is ever the linked account, that
   week's votes are undecryptable regardless of anything in this PRD.
4. **Retention on the buffers** — 14 days assumed. Long enough to survive a
   missed week, short enough to stay small.
5. **Should Phase 0's warning push anywhere** (email, the admin dashboard), or
   is an endpoint plus a tab banner enough for a five-person admin group?
   *Recommend the banner only* — one more integration is one more thing to break.

---

## Sign-off

- [x] Leading hypothesis and its ~55% confidence read and accepted — 2026-08-15
- [x] Q1 (auth store survives redeploys) settled by observation — 2026-08-15
- [x] Phase 0 approved to ship before Wed 19 Aug — 2026-08-15
- [x] Phases 1 and 2 approved **in principle, deferred** pending the Render log
      line (Q2) — 2026-08-15
- [x] Retire-the-listener alternative considered rather than defaulted past
- [ ] Q2 (Render log at 2026-08-12 ~13:30Z) pulled — releases Phases 1-3
