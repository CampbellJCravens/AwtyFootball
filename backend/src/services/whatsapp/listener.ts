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
import { usePostgresAuthState, clearPostgresAuthState } from './authState';
import prisma from '../../prisma';
import {
  capturePoll,
  handlePollUpdateMessage,
  isPollCreation,
  noteContact,
  isInScope,
  refreshScope,
} from './polls';

let sock: WASocket | null = null;
let latestQr: string | null = null;
let starting = false;

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

/**
 * Force a fresh link: drop the current (likely dead) session, clear stored auth,
 * and restart so a new QR is generated for the admin to scan. Lets an admin
 * recover a logged-out listener from the panel without a redeploy.
 */
export async function relinkWhatsapp(): Promise<void> {
  try {
    (sock as any)?.end?.(undefined);
  } catch {
    /* ignore */
  }
  sock = null;
  latestQr = null;
  starting = false;
  await clearPostgresAuthState();
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
  if (starting) return;
  starting = true;

  try {
    await refreshScope(); // load the group-scope setting before we start capturing
    const { state, saveCreds } = await usePostgresAuthState();
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
      const meId = sock?.user?.id;
      const meLid = (sock?.user as any)?.lid;
      for (const msg of messages) {
        try {
          // Ignore anything outside the configured group (if one is set).
          if (!isInScope(msg.key?.remoteJid)) continue;
          if (msg.pushName && msg.key?.participant) {
            await noteContact(msg.key.participant, msg.pushName);
          }
          if (isPollCreation(msg.message)) {
            await capturePoll(msg);
          } else if ((msg.message as any)?.pollUpdateMessage) {
            await handlePollUpdateMessage(msg, meId, meLid);
          }
        } catch (err) {
          console.error('[whatsapp] messages.upsert handler error:', err);
        }
      }
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        latestQr = qr;
        console.log('[whatsapp] Scan this QR in WhatsApp → Linked Devices to link the listener:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        latestQr = null;
        console.log('[whatsapp] Linked and listening (read-only).');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        sock = null;
        starting = false;
        if (loggedOut) {
          // The session is dead. Clear it and restart so a FRESH QR is
          // generated automatically — otherwise the listener sits idle forever
          // and silently stops capturing votes until someone notices.
          console.warn('[whatsapp] Logged out by WhatsApp — clearing session and restarting for a fresh QR.');
          clearPostgresAuthState()
            .then(() => new Promise((r) => setTimeout(r, 3000)))
            .then(() => startWhatsappListener())
            .catch((err) => console.error('[whatsapp] Auto-recovery after logout failed:', err));
          return;
        }
        console.log(
          `[whatsapp] Connection closed (code ${statusCode ?? 'unknown'}); reconnecting in 5s.`
        );
        setTimeout(() => {
          startWhatsappListener().catch((err) =>
            console.error('[whatsapp] Reconnect failed:', err)
          );
        }, 5000);
      }
    });
  } catch (err) {
    console.error('[whatsapp] Failed to start listener:', err);
  } finally {
    starting = false;
  }
}
