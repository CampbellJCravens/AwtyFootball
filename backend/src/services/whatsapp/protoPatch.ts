/**
 * Recover poll creations the installed Baileys proto doesn't know about.
 *
 * WhatsApp's E2E schema now carries `pollCreationMessageV6 = 119`. The proto
 * bundled with Baileys 7.0.0-rc13 (and rc14) stops at V5, so protobuf decoding
 * skips field 119 as unknown and hands back a Message holding nothing but the
 * messageContextInfo. That is exactly what the 16 Sep 2026 poll looked like in
 * the logs: `fields=[messageContextInfo]`, no error, nothing to capture. Every
 * poll lost since July was one of these; the three that captured were V3.
 *
 * The hook wraps proto.Message.decode. Before the generated decoder consumes
 * the bytes it takes a view of them, and afterwards, if no poll field came out,
 * it scans the raw wire format for field 119 and decodes it with the existing
 * PollCreationMessage class. The result is attached as pollCreationMessageV3
 * rather than V6 because the generated Message class only serialises fields it
 * knows: capturePoll stores the message with JSON.stringify, and a V6 property
 * would vanish there. V3 and V6 share the PollCreationMessage type, so
 * everything downstream (option hashes, messageSecret, vote decryption) works
 * unchanged. Once a Baileys release knows V6 natively the scan finds nothing to
 * do.
 */
import { proto } from '@whiskeysockets/baileys';

const POLL_CREATION_V6_FIELD = 119;

/** Read one base-128 varint. Uses multiplication past 2^31 so 64-bit fields don't wrap. */
function readVarint(buf: Uint8Array, pos: number): { value: number; pos: number } {
  let value = 0;
  let scale = 1;
  for (let i = 0; i < 10 && pos < buf.length; i++) {
    const b = buf[pos++];
    value += (b & 0x7f) * scale;
    if ((b & 0x80) === 0) return { value, pos };
    scale *= 128;
  }
  throw new Error('varint overrun');
}

/**
 * Walk a message's wire format and return the bytes of the first
 * length-delimited field with this number, or null. Only the top level is
 * scanned; groups (wire types 3/4) end the scan since WhatsApp doesn't use them.
 */
export function findLengthDelimitedField(buf: Uint8Array, fieldNo: number): Uint8Array | null {
  let pos = 0;
  while (pos < buf.length) {
    const tag = readVarint(buf, pos);
    pos = tag.pos;
    const field = Math.floor(tag.value / 8);
    const wireType = tag.value % 8;
    switch (wireType) {
      case 0:
        pos = readVarint(buf, pos).pos;
        break;
      case 1:
        pos += 8;
        break;
      case 2: {
        const len = readVarint(buf, pos);
        pos = len.pos;
        if (field === fieldNo) return buf.subarray(pos, pos + len.value);
        pos += len.value;
        break;
      }
      case 5:
        pos += 4;
        break;
      default:
        return null;
    }
  }
  return null;
}

function hasPollCreation(msg: any): boolean {
  return Object.keys(msg).some(
    (k) => k.startsWith('pollCreationMessage') && k !== 'pollCreationMessageKey' && msg[k]
  );
}

let installed = false;
let announced = false;

export function installPollCreationV6Patch(): void {
  if (installed) return;
  installed = true;

  const Message: any = proto.Message;
  const originalDecode = Message.decode;

  Message.decode = function patchedDecode(reader: any, length?: number) {
    // Take the view before decoding: the generated decoder advances the reader.
    let raw: Uint8Array | null = null;
    if (reader instanceof Uint8Array) {
      raw = reader;
    } else if (reader?.buf instanceof Uint8Array && typeof reader.pos === 'number') {
      const end = length === undefined ? reader.len : reader.pos + length;
      raw = reader.buf.subarray(reader.pos, end);
    }

    const msg = originalDecode.call(this, reader, length);

    if (raw && msg && !hasPollCreation(msg)) {
      try {
        const bytes = findLengthDelimitedField(raw, POLL_CREATION_V6_FIELD);
        if (bytes) {
          msg.pollCreationMessageV3 = proto.Message.PollCreationMessage.decode(bytes);
          if (!announced) {
            announced = true;
            console.log(
              '[whatsapp] Decoded a pollCreationMessageV6 (proto field 119) the bundled Baileys ' +
                'schema does not know; handling it as a poll creation.'
            );
          }
        }
      } catch (err) {
        console.warn('[whatsapp] Could not recover a possible V6 poll creation:', (err as Error)?.message);
      }
    }
    return msg;
  };
}
