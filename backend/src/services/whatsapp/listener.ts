/**
 * Read-only WhatsApp poll listener (Baileys).
 *
 * Links the backend as a WhatsApp companion device and — in later increments —
 * decodes native poll votes into GameRsvp rows. This module is the foundation:
 * it establishes and maintains the connection, persists auth in Postgres, and
 * surfaces the QR for first-time linking. It NEVER sends a message (read-only),
 * which keeps ban risk low.
 *
 * Gated by env.WHATSAPP_LISTENER_ENABLED — inert unless explicitly turned on.
 * See docs/whatsapp-poll-listener-spec.md.
 *
 * NEXT INCREMENTS (not yet implemented here):
 *   - messages.upsert: capture poll-create messages, link them to a game
 *   - messages.update: decode vote updates (getAggregateVotesInPollMessage),
 *     map phone -> Player, upsert GameRsvp (setByUserId = "whatsapp")
 */
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  BufferJSON,
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { useWhatsappAuthState, clearWhatsappAuthState } from './authState';
import prisma from '../../prisma';
import {
  capturePoll,
  handlePollUpdateMessage,
  isPollCreation,
  noteContact,
  isInScope,
  refreshScope,
  getPollUpdate,
  unwrapMessage,
  replayPendingPolls,
} from './polls';

// Ordinary chatter we deliberately ignore. Anything in scope that isn't one of
// these, and isn't a poll, gets its shape logged once so a message type we don't
// handle yet is visible instead of silently dropped — the failure mode that lost
// the 25Jul 2026 poll (a pollCreationMessageV4/V5 we didn't recognise).
const IGNORED_MESSAGE_TYPES = new Set([
  'conversation',
  'extendedTextMessage',
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'stickerMessage',
  'documentMessage',
  'reactionMessage',
  'protocolMessage',
  'senderKeyDistributionMessage',
  'messageContextInfo',
  'contactMessage',
  'locationMessage',
]);

function logUnhandledMessage(message: any): void {
  const inner = unwrapMessage(message);
  if (!inner) return;
  const types = Object.keys(inner).filter((k) => !IGNORED_MESSAGE_TYPES.has(k));
  if (types.length === 0) return;
  // Field names only, never content — this lands in Render logs.
  console.log(`[whatsapp] Unhandled in-scope message type(s): ${types.join(', ')}`);
}

/**
 * A message that arrived with no readable content. Baileys emits these as
 * CIPHERTEXT stubs when decryption fails — typically when the sender's Signal
 * session is rotating ("identity key changed", "Closing open session in favor of
 * incoming prekey bundle"). It then asks the phone to resend.
 *
 * This was the blind spot that cost three weeks: a poll landing mid-rotation
 * arrived as an empty stub, every handler said "not mine", and NOTHING was
 * logged, because the unhandled-type logger above bails when there's no content.
 * Now it's loud, and we ask for the message back ourselves.
 */
async function handleUndecryptableMessage(
  msg: any,
  requestResend: (key: any) => Promise<void>
): Promise<void> {
  const stub = msg?.messageStubType;
  console.warn(
    `[whatsapp] Undecryptable message in scope (stubType=${stub ?? 'none'}, id=${msg?.key?.id}) ` +
      `from ${msg?.key?.participant ?? msg?.key?.remoteJid}. Requesting a resend — ` +
      `if this was a poll creation, that is why the poll went missing.`
  );
  try {
    await requestResend(msg.key);
  } catch (err) {
    console.error('[whatsapp] Resend request failed:', err);
  }
}

/**
 * Throttle for resend requests. These go out to WhatsApp, and the listener's
 * whole safety story is that it is read-only and quiet, so we ask sparingly:
 * a few attempts per message, spaced, and never in a loop. Votes for a missing
 * poll arrive dozens of times, and each one would otherwise trigger a request.
 */
const RESEND_MAX_ATTEMPTS = 3;
const RESEND_MIN_GAP_MS = 10 * 60 * 1000;
const resendAttempts = new Map<string, { count: number; last: number }>();

function makeResendRequester(sock: WASocket | null): (key: any) => Promise<void> {
  return async (key: any) => {
    const id = key?.id;
    if (!id || !sock) return;
    const seen = resendAttempts.get(id) ?? { count: 0, last: 0 };
    const now = Date.now();
    if (seen.count >= RESEND_MAX_ATTEMPTS) return;
    if (now - seen.last < RESEND_MIN_GAP_MS) return;
    resendAttempts.set(id, { count: seen.count + 1, last: now });
    console.log(
      `[whatsapp] Requesting resend of message ${id} (attempt ${seen.count + 1}/${RESEND_MAX_ATTEMPTS}).`
    );
    await (sock as any).requestPlaceholderResend?.(key);
  };
}

let sock: WASocket | null = null;
let latestQr: string | null = null;
let starting = false;
// Bumped on every connection attempt. Handlers captured on an older socket
// compare against it and bail, so a socket we've abandoned can't keep writing
// auth state or processing messages behind the live one's back.
let generation = 0;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
// Deliberately stopped by an admin. Distinct from "disconnected": nothing here
// should try to heal it, and monitoring must not read it as an outage.
let paused = false;
// Set once SIGTERM arrives. Render keeps the OLD instance alive while the new
// one boots, and both run this listener with the SAME WhatsApp credentials.
// WhatsApp permits one, so each connection replaces the other, and reconnecting
// on that is how two instances end up fighting for six minutes straight.
let shuttingDown = false;
// Only reset the backoff once a connection has PROVED itself. Resetting on
// 'open' meant a connect/replace/reconnect flap sat at "attempt 1" forever and
// the delay never grew — every loop re-reading the whole auth state from Redis.
let stableTimer: NodeJS.Timeout | null = null;
const STABLE_AFTER_MS = 60_000;

/** Stop the current socket, release the WhatsApp session, and stay down. */
export function shutdownWhatsappListener(): void {
  shuttingDown = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (stableTimer) {
    clearTimeout(stableTimer);
    stableTimer = null;
  }
  generation++; // orphan any in-flight handlers
  teardownSocket();
  console.log('[whatsapp] Listener shut down; WhatsApp session released.');
}

/**
 * Stop the current socket emitting and close it. The old code dropped the
 * reference without detaching handlers or ending the socket, so a flapping
 * connection could leave several live sockets running at once — each one
 * decrypting messages and persisting Signal keys, multiplying database load.
 */
function teardownSocket(): void {
  const s = sock as any;
  sock = null;
  if (!s) return;
  try {
    s.ev?.removeAllListeners?.();
  } catch {
    /* ignore */
  }
  try {
    s.end?.(undefined);
  } catch {
    /* ignore */
  }
}

/**
 * Schedule exactly one reconnect, backing off up to 5 minutes. Single-flight:
 * WhatsApp can emit several close events for one drop, and the old code
 * scheduled an independent reconnect for each.
 */
function scheduleReconnect(reason: string, minDelayMs = 0): void {
  if (paused) return; // an admin stopped it on purpose; don't heal it
  if (shuttingDown) return; // process is going away; releasing the session
  if (reconnectTimer) return;
  const delay = Math.max(Math.min(5000 * 2 ** reconnectAttempts, 5 * 60_000), minDelayMs);
  reconnectAttempts++;
  console.log(
    `[whatsapp] ${reason}; reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts}).`
  );
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startWhatsappListener().catch((err) =>
      console.error('[whatsapp] Reconnect failed:', err)
    );
  }, delay);
}

/**
 * The most recent QR string, or null once linked. A future admin endpoint can
 * render this so Campbell scans it from a browser instead of the server logs.
 */
export function getLatestWhatsappQr(): string | null {
  return latestQr;
}

export function isWhatsappLinked(): boolean {
  return sock !== null && latestQr === null;
}

export function isWhatsappPaused(): boolean {
  return paused;
}

/**
 * Stop the socket WITHOUT touching stored credentials, and stay stopped.
 *
 * Deliberately not `relinkWhatsapp()`, which clears auth state and needs a fresh
 * pairing from the account's physical phone — the wrong tool for a temporary
 * stop, and an easy mistake to make since /reset looks like a stop button.
 *
 * The session survives in Redis, so resume reconnects with the same device slot
 * and WhatsApp delivers whatever queued up while we were away.
 */
export function pauseWhatsappListener(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  paused = true;
  generation++; // orphan any in-flight socket's handlers
  teardownSocket();
  latestQr = null;
  starting = false;
  reconnectAttempts = 0;
  console.log('[whatsapp] Listener PAUSED by admin — session kept, no reconnect until resumed.');
}

/** Undo pauseWhatsappListener and reconnect with the existing session. */
export async function resumeWhatsappListener(): Promise<void> {
  if (!paused) return;
  paused = false;
  console.log('[whatsapp] Listener RESUMED by admin — reconnecting.');
  await startWhatsappListener();
}

/**
 * Force a fresh link: drop the current (likely dead) session, clear stored auth,
 * and restart so a new QR is generated for the admin to scan. Lets an admin
 * recover a logged-out listener from the panel without a redeploy.
 */
export async function relinkWhatsapp(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  generation++; // orphan any in-flight socket's handlers
  teardownSocket();
  latestQr = null;
  starting = false;
  reconnectAttempts = 0;
  paused = false; // an explicit re-link is an intent to be running
  await clearWhatsappAuthState();
  await startWhatsappListener();
}

/**
 * Request an 8-char pairing code so the account can be linked by typing it into
 * WhatsApp (Linked Devices → Link a Device → "Link with phone number instead")
 * — no QR scan needed, so it works entirely from one phone. `phone` is the
 * account's own number (digits, e.g. 17136289439).
 */
export async function requestWhatsappPairingCode(phone: string): Promise<string> {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = '1' + digits; // assume US country code if omitted
  if (!digits) throw new Error('A phone number is required');
  if (isWhatsappLinked()) throw new Error('WhatsApp is already linked');

  // Need a fresh, connecting, unregistered socket. Start one if needed.
  if (!sock) await relinkWhatsapp();

  // Wait until the socket is far enough along to talk to WhatsApp (a QR having
  // been emitted means the websocket is open and the session is unregistered).
  const start = Date.now();
  while ((!sock || !latestQr) && Date.now() - start < 15000) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!sock) throw new Error('WhatsApp listener is not ready — try again in a few seconds');

  return sock.requestPairingCode(digits);
}

/** Groups the linked account participates in — for the admin to pick the scope. */
export async function listWhatsappGroups(): Promise<Array<{ jid: string; subject: string }>> {
  if (!sock) return [];
  try {
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups)
      .map((g: any) => ({ jid: g.id as string, subject: (g.subject as string) || g.id }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  } catch (err) {
    console.error('[whatsapp] Failed to fetch groups:', err);
    return [];
  }
}

export async function startWhatsappListener(): Promise<void> {
  if (paused) return; // resumeWhatsappListener clears the flag before calling in
  if (starting) return;
  starting = true;

  const myGeneration = ++generation;
  teardownSocket(); // never leave a previous socket running alongside this one

  try {
    await refreshScope(); // load the group-scope setting before we start capturing
    const { state, saveCreds } = await useWhatsappAuthState();
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      // Read-only posture: don't announce ourselves as the active device.
      markOnlineOnConnect: false,
      browser: ['AwtyFootball', 'Chrome', '1.0.0'],
      // Baileys uses this to resolve the poll-creation message a vote refers to.
      getMessage: async (key) => {
        if (!key.id) return undefined;
        const poll = await prisma.whatsappPoll.findUnique({
          where: { pollMessageId: key.id },
        });
        if (!poll) return undefined;
        const stored = JSON.parse(poll.pollMessage, BufferJSON.reviver);
        return stored.message;
      },
    });

    sock.ev.on('creds.update', saveCreds);

    // Poll creations AND votes both arrive on messages.upsert. Baileys 7 no
    // longer decrypts poll votes, so we handle pollUpdateMessage ourselves.
    sock.ev.on('messages.upsert', async ({ messages }) => {
      if (myGeneration !== generation) return; // stale socket, ignore
      const meId = sock?.user?.id;
      const meLid = (sock?.user as any)?.lid;
      for (const msg of messages) {
        try {
          // Ignore anything outside the configured group (if one is set).
          if (!isInScope(msg.key?.remoteJid)) continue;
          if (msg.pushName && msg.key?.participant) {
            await noteContact(msg.key.participant, msg.pushName);
          }
          const requestResend = makeResendRequester(sock);
          if (isPollCreation(msg.message)) {
            await capturePoll(msg, meId, meLid);
          } else if (getPollUpdate(msg.message)) {
            await handlePollUpdateMessage(msg, meId, meLid, { requestResend });
          } else if (!unwrapMessage(msg.message)) {
            // No readable content: a failed decrypt. This is the case that was
            // silently swallowing poll creations.
            await handleUndecryptableMessage(msg, requestResend);
          } else {
            logUnhandledMessage(msg.message);
          }
        } catch (err) {
          console.error('[whatsapp] messages.upsert handler error:', err);
        }
      }
    });

    sock.ev.on('connection.update', (update) => {
      if (myGeneration !== generation) return; // stale socket, ignore
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        latestQr = qr;
        console.log('[whatsapp] Scan this QR in WhatsApp → Linked Devices to link the listener:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        latestQr = null;
        // Don't declare victory yet. A connection that opens and is immediately
        // replaced by another instance is not healthy, and resetting here is
        // what pinned the flap at "attempt 1" with a permanent 5s retry.
        if (stableTimer) clearTimeout(stableTimer);
        stableTimer = setTimeout(() => {
          reconnectAttempts = 0;
          stableTimer = null;
        }, STABLE_AFTER_MS);
        console.log('[whatsapp] Linked and listening (read-only).');
        // A poll we couldn't persist is parked in Redis. Reconnect is the
        // natural moment to try again: whatever broke the write — a suspended
        // database, a restart mid-capture — has usually passed by now.
        replayPendingPolls(sock?.user?.id, (sock?.user as any)?.lid).catch((err) =>
          console.error('[whatsapp] Replaying buffered polls failed:', err)
        );
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const replaced = statusCode === DisconnectReason.connectionReplaced;
        teardownSocket();
        starting = false;
        if (stableTimer) {
          clearTimeout(stableTimer);
          stableTimer = null;
        }

        if (replaced) {
          // Another connection took the session — during a deploy that is the
          // other instance, and racing it back is exactly how the two of them
          // spent six minutes kicking each other off, losing every message that
          // landed in between. Yield: a long, escalating wait. If we're the
          // instance being retired, SIGTERM arrives first and we never retry.
          console.warn(
            '[whatsapp] Session taken over by another connection (code 440). ' +
              'Standing down rather than fighting for it — likely the other instance during a deploy.'
          );
          scheduleReconnect('Session replaced', 2 * 60_000);
          return;
        }

        if (loggedOut) {
          // The session is dead. Clear it and restart so a FRESH QR is
          // generated automatically — otherwise the listener sits idle forever
          // and silently stops capturing votes until someone notices.
          console.warn('[whatsapp] Logged out by WhatsApp — clearing session and restarting for a fresh QR.');
          clearWhatsappAuthState()
            .then(() => new Promise((r) => setTimeout(r, 3000)))
            .then(() => startWhatsappListener())
            .catch((err) => console.error('[whatsapp] Auto-recovery after logout failed:', err));
          return;
        }
        scheduleReconnect(`Connection closed (code ${statusCode ?? 'unknown'})`);
      }
    });
  } catch (err) {
    console.error('[whatsapp] Failed to start listener:', err);
    // Startup can fail for recoverable reasons — most importantly the database
    // being unreachable while we still need it to migrate the session. Retry
    // with backoff instead of sitting dead until someone redeploys.
    starting = false;
    scheduleReconnect('Listener startup failed');
  } finally {
    starting = false;
  }
}
