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
| Session storage | **Postgres** (not local files) | Render wipes the filesystem on redeploy. Same pattern as the existing `connect-pg-simple` session store. |
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

## Out of scope

- Sending/creating polls from the app (would raise ban risk; the group creates polls as they do now).
- Non-poll message parsing.
