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
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { usePostgresAuthState } from './authState';

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

export async function startWhatsappListener(): Promise<void> {
  if (starting) return;
  starting = true;

  try {
    const { state, saveCreds } = await usePostgresAuthState();
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      // Read-only posture: don't announce ourselves as the active device.
      markOnlineOnConnect: false,
      browser: ['AwtyFootball', 'Chrome', '1.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);

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
          console.warn(
            '[whatsapp] Logged out by WhatsApp. Clear WhatsappAuthState and restart to re-scan.'
          );
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
