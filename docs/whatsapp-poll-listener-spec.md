# WhatsApp Poll Listener — Spec

**Status:** In progress on `dev`. Greenlit 2026-07-14.
**Owner:** Campbell · **Contributors:** Bu1ld3rsCh01ce

## Goal

Let the WhatsApp group keep using their **native WhatsApp poll** exactly as they do today, and have RSVP votes sync into the app automatically. Nothing changes for the voters — no extra tap, no leaving WhatsApp. A read-only WhatsApp "linked device" running on our backend decodes poll votes and writes them into the existing `GameRsvp` table.

### Why this over the Send-to-WhatsApp button (already shipped)

The Send-to-WhatsApp button posts an RSVP snapshot image to the group, but voters still have to open the app to actually vote — one extra click. The group is fickle and resents friction, so that click is a dealbreaker. **The listener adds zero friction for voters**; it's the reason we're building it rather than trialing the button first.

## How it works (high level)

```
WhatsApp group poll  ──vote──▶  WhatsApp servers
                                      │  (encrypted vote update)
                                      ▼
                        Baileys client (linked device)
                        running inside our Render backend
                                      │  decrypt + decode
                                      ▼
                    map phone → Player, option → status/guests
                                      │
                                      ▼
                  gameRsvp.upsert({ gameId, playerId, ... })
                                      │
                                      ▼
                        existing app UI shows the votes
```

Baileys ([@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)) is a headless WhatsApp Web client. It links to a WhatsApp **account** via a one-time QR scan and thereafter receives the same messages any linked device (WhatsApp Web, Desktop) would — including poll vote updates. **It is read-only: it never sends a message.** That keeps ban risk low.

## Key decisions (locked in)

| Decision | Choice | Rationale |
|---|---|---|
| Which account | **Campbell's personal number** | Read-only ⇒ low ban risk; zero setup; no 14-day reconnect chore a spare SIM would need. Accepted the small tail risk. |
| "Device" | The Baileys **process on the Render server** — not physical hardware | An iPad wouldn't help; it just re-links the same number. |
| Guest count | Poll options `In / In+1 / In+2 / Maybe / Out` | Guests are capped at 2, so 3 "In" variants cover it and `guestCount` survives the round-trip. Optional — can keep the poll identical and handle guests in-app if the group dislikes it. |
| Session storage | ~~Postgres~~ → **Redis** (`REDIS_URL`) | Postgres was chosen because Render wipes the filesystem on redeploy. It backfired: Signal keys rotate constantly, so the writes kept the Neon compute permanently awake, exhausted the monthly compute quota and took the **whole app** down on 2026-07-29. Redis survives redeploys without a Render disk, and a disk would have disabled zero-downtime deploys. Selected by `WHATSAPP_AUTH_STORE` (`redis` \| `file` \| `postgres`); existing Postgres rows are migrated on first boot so the pairing survives. |
| Poll → game match | Auto by date in poll title, admin manual-link fallback | Listener must be linked **before** the poll is posted to decrypt its votes. |
| Phone → player map | New `phone` field on `Player`; unmatched → admin bucket | New group members won't auto-map. |
| Safety | Everything behind `WHATSAPP_LISTENER_ENABLED` (default off) | Inert until we set the flag and scan the QR. Nothing ships to prod behavior until then. |

## Data model changes (Prisma)

```prisma
// Persist Baileys auth state (creds + signal keys) across redeploys.
// One row per key; creds live under a well-known id.
model WhatsappAuthState {
  id        String   @id            // "creds" | "<keyType>-<keyId>"
  value     String                  // JSON (BufferJSON-encoded)
  updatedAt DateTime @updatedAt
}

// Maps a WhatsApp poll message to the game it's collecting RSVPs for.
model WhatsappPollLink {
  id            String   @id @default(uuid())
  pollMessageId String   @unique    // WA message id of the poll
  remoteJid     String              // the group chat id
  gameId        String
  question      String              // poll title, for auditing / re-matching
  linkedBy      String?             // null = auto-matched by date, else admin userId
  createdAt     DateTime @default(now())
  game          Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  @@index([gameId])
}

// Votes whose sender phone doesn't map to a Player yet. Admin resolves these.
model WhatsappUnmatchedVote {
  id            String   @id @default(uuid())
  phone         String              // sender phone / JID user part
  displayName   String?             // WA pushName, to help the admin identify
  pollMessageId String
  optionText    String              // raw chosen option
  createdAt     DateTime @default(now())
  @@index([pollMessageId])
}

model Player {
  // ...existing fields...
  phone String? @unique             // E.164, for WhatsApp vote attribution
}
```

RSVPs are written with a sentinel so WhatsApp-sourced votes are distinguishable from self/admin ones. `GameRsvp.setByUserId` is reused: `"whatsapp"` marks a listener-sourced vote (self-set in the app still overrides it, matching existing precedence).

## Build plan (increments)

1. ✅ **Foundation**: Prisma models, `WHATSAPP_LISTENER_ENABLED` flag, Baileys dependency, Postgres auth-state adapter, flag-gated read-only connection with QR onboarding. Default off — no behavior change.
2. ✅ **Vote decoding**: `messages.update` poll events accumulate raw updates, re-aggregate (`getAggregateVotesInPollMessage`), decode option → `{status, guestCount}` (`options.ts`).
3. ✅ **Attribution**: phone → `Player` lookup; `gameRsvp.upsert` with `setByUserId = "whatsapp"` (app/admin votes take precedence); unknown numbers surfaced as unmatched.
4. ✅ **Poll → game linking**: capture poll-create messages, auto-match by title date (`gameMatch.ts`), admin manual-link endpoint.
5. ✅ **Admin UI**: `WhatsappSyncModal` (menu → "WhatsApp Sync") — QR linking, link polls to games, resolve unmatched numbers (backfills `Player.phone`). API at `/api/whatsapp/*`.
6. ⏳ **Resilience + live test**: reconnect/backoff and logout handling are in; the QR re-link flow and a dry-run against the real group are the remaining manual step.

**Verified so far:** backend + frontend typecheck and build; backend boots with Baileys loaded; option/date parsing unit-tested. **Not yet verified (needs a live WhatsApp link):** the exact shape of Baileys 7 poll-vote events end-to-end. Defensive logging is in place to surface the real event shapes on the first live test.

## Operational notes

- **Linking:** with the flag on, the server emits a QR (logs + admin endpoint). Campbell scans it once from WhatsApp → Linked Devices. Auth state persists in Postgres thereafter.
- **Ordering:** link the device **before** creating a poll, or its votes can't be decrypted.
- **Device cap:** uses one of the account's 4 companion-device slots.
- **Ban posture:** read-only, never sends. If WhatsApp ever unlinks the device, votes stop syncing until a re-scan; no data loss (app RSVP still works directly).

## Amendment — Neon cold start is a *second* way to lose a poll (fixed 2026-08-19)

**Not the cause of the Jul-Aug misses.** That was diagnosed from Render logs by Campbell in `656faa3`: a Signal session rotation makes a message arrive as a CIPHERTEXT stub with no content, the handler concluded it was neither poll nor vote, and `logUnhandledMessage`'s opening `if (!inner) return` meant the one failure mode actually occurring produced no log line at all. That fix — loud logging, `requestPlaceholderResend`, and Redis-buffered votes replayed on capture — is the answer to the observed outage.

What follows is a **separate, independently reproducible defect** found while investigating the compute question. It is latent rather than historical: it can lose a poll, it was not shown to have lost these ones.

### Measured

Against production Neon, using the exact client config the app ships (`new PrismaClient()`, no `connect_timeout` in `DATABASE_URL`):

| Attempt | Result |
|---|---|
| 1 — Neon suspended | **FAILED after 5029ms** — `PrismaClientInitializationError: Can't reach database server` |
| 2 — immediately after | connect 1154ms, succeeded |
| 3 — warm | connect 382ms |
| Cold, with `connect_timeout=20` | **SUCCESS** — connect 3987ms |

The failing attempt is itself what triggers the resume, so the *next* call succeeds. Two cold trials measured resume at **~4.0s and >5.0s** — straddling Prisma's **5s default**. This is why capture failed on some weeks and not others: it is a coin flip against the resume time, not a consistent break.

### Why it bites the listener hardest

`capturePoll`'s `prisma.whatsappPoll.create` is a one-shot with no retry. When it throws, the catch at `listener.ts:242` logs `messages.upsert handler error` and moves on. The poll creation is then gone permanently — the `messageSecret` rides on that message, so no re-link, replay, or manual link recovers the votes. Every vote for it dies at `polls.ts:289`.

### It is not a WhatsApp bug

All **145** `prisma.*` call sites are equally unprotected; there is no retry helper anywhere in `src/`. The user-visible version is that the first person to open the app after a quiet stretch gets a 500 and a refresh "fixes" it — easily written off as flakiness.

**This is the other half of the 2026-07-29 compute-burn fix.** That work cured the burn by removing the writes that were holding Neon awake — correctly. But neither health endpoint touches the DB (`index.ts:113`, `:124`), so the uptime monitor keeps *Render* awake while letting *Neon* sleep, and nothing was added to survive the resume. Burn and cold-start failure are two sides of one coin.

### Fix (shipped in this change)

`src/prisma.ts` appends `connect_timeout=20` to `DATABASE_URL` when it isn't already set, so a cold connect waits out the resume instead of giving up at 5s. One file, no schema change, no behavior change when the DB is warm.

**It costs nothing on the compute meter.** Neon bills awake time; waiting for a resume is not awake time. This buys reliability without reopening the burn.

### Still open (not in this change)

- ✅ **`capturePoll` no longer loses the creation on a throw.** `656faa3` buffered the *votes*; the creation — the irreplaceable half, since the `messageSecret` rides on it — is now retried 3× with backoff, then parked in `pendingPolls.ts` (Redis, same reasoning as `pendingVotes.ts`: the failure being insured against is Postgres being unreachable, so Postgres can't hold the insurance). Drained on `connection === 'open'`, re-buffering itself if the database is still down. Capped at 50, 14-day TTL.
- The catch at `listener.ts` swallows every error identically. Capture failures deserve louder handling than parse noise.
- **At least three distinct failure modes are now on record**: undecryptable CIPHERTEXT stubs (`656faa3`, the historical cause), an unrecognised message shape (25 Jul, `listener.ts:38-41`), and cold-start connect failure (this change). Treat "the poll didn't capture" as a symptom with several causes, not one bug.

## Amendment — windowed listener (proposed 2026-08-19, Morgan-Sean)

**Proposal:** stop running the socket continuously. Wake it when a game is created in the app (~20 min window, long enough to flip back to WhatsApp and post the poll), then wake it again Friday ~22:00 and/or Saturday ~05:00 to collect the week's votes. Fewer awake windows ⇒ less compute burned.

> **Depends on the Neon cold-start fix above.** Windowing makes Neon *colder*, not warmer — a listener that wakes three times a week hits a suspended compute nearly every time it wakes. Without `connect_timeout`, windowing would have increased poll loss rather than reduced it. Sequence the cold-start fix first.

### Does the mechanism work?

**Yes — and it needs no new receive code.** Messages queued by WhatsApp while a companion device is offline are delivered on reconnect through `messages.upsert` with `type: 'append'` (`MessageUpsertType = 'append' | 'notify'`, Baileys 7). The handler at `listener.ts:224` destructures only `{ messages }` and ignores `type`, so replayed messages already flow through `capturePoll` / `handlePollUpdateMessage` unchanged. A poll posted during a gap is captured on the next wake, `messageSecret` included, provided WhatsApp still holds it in the offline queue.

This corrects an earlier note in this project's history that re-linking can't recover a missed poll. That remains true for **old** polls — those come back through `messaging-history.set`, which we do not handle — but it is wrong for a **short** gap, which is exactly what this proposal creates.

### What it does not fix

The failure since 15 Jul is **not** downtime. As of 2026-08-19 the socket is alive and receiving (`WhatsappContact` writes through 2026-08-17) while `WhatsappPoll` still holds only 2 rows ever. Windowing a listener that is up and not capturing changes nothing.

**Sequencing matters:** ship windowing *before* the capture fix and every future miss gains a permanent second explanation ("we were asleep"), which is how a one-line parser bug survives another month. Capture fix first, windowing second.

### Where the compute actually goes

Two meters, and the proposal only moves one:

| Meter | Moved by listener uptime? |
|---|---|
| **Render Web Service** | No. It hosts the whole API and is up regardless. Listener uptime is not a separate charge. |
| **Neon Postgres** | Yes. Neon bills wall-clock awake time and suspends after 5 idle minutes. The listener keeps it awake via `noteContact` on every in-scope group message plus the batched auth-state flush. |

So the saving is real but narrower than "every wake burns compute" implies: **waking is cheap, staying awake is what costs.** A windowed listener that wakes 3× a week for 20 minutes touches Neon far less than one holding a socket through a chatty group all week.

### Risks

1. **Offline-queue retention.** Solid for a 20-minute gap. A Wednesday poll collected at Friday 22:00 is a ~48-hour gap, and WhatsApp's retention for undelivered companion-device messages is not documented or guaranteed. If the queue is dropped, the poll creation is gone permanently — the `messageSecret` rides on it and no re-link recovers it.
2. **Session churn.** Every cold start runs a Signal handshake and key exchange. This session has already died once (2026-07-29, re-pair needed from Campbell's physical phone). Three reconnects a week raises the odds of landing in the paused-relink state, and recovery is not self-service.
3. **Vote coverage.** Votes trickle in all week, not only inside the windows. Entirely dependent on risk 1 holding.
4. **Votes still need their poll.** A vote whose creation was never captured dies at `polls.ts:289` regardless of uptime.

### Verification gate — do this before building anything

One manual test decides whether the schedule is safe, and it needs no code:

1. With the listener running, stop it.
2. Have a group member post a message and a poll titled to match the filter.
3. Restart after 30+ minutes. Confirm a `WhatsappPoll` row appears.
4. Repeat with a ~48-hour gap.

Step 3 validates the game-creation window. Step 4 validates the Friday/Saturday collection windows — and if it fails, the design collapses to "the listener must be up before the poll is posted and stay up," which is the current architecture.

### Proposed design (only if the gate passes)

| Element | Choice |
|---|---|
| Trigger | `POST /api/games` starts the listener with a TTL, default 20 min |
| Extension | Each captured poll creation extends the window 20 min, so a late post still lands |
| Scheduled windows | Fri 22:00 + Sat 05:00 America/Chicago, ~15 min each |
| Kill switch | `WHATSAPP_LISTENER_MODE = always \| windowed`, **default `always`** so behavior is unchanged until deliberately flipped |
| No new poller | Reuse the existing wake path; do not add a background scheduler — that is what caused the 29 Jul burn |
| Admin visibility | Window state + next scheduled wake shown in the Sync modal. Without it, "asleep" and "broken" look identical, which is the exact trap the health endpoint already set once |

**Open question:** a poll posted outside every window (someone posts Tuesday) is only collected at the Friday wake, inheriting risk 1 in full. Either accept it, or add a wake on any admin page load — cheap, since that request already wakes Neon.

**Note:** this subsystem is Campbell's as of 2026-08-17, and branch `feat/whatsapp-capture-phase0` is unmerged. This amendment is a proposal for his review, not a build authorization.

## Out of scope

- Sending/creating polls from the app (would raise ban risk; the group creates polls as they do now).
- Non-poll message parsing.
