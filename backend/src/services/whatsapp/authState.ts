/**
 * Postgres-backed Baileys auth state.
 *
 * Baileys' built-in `useMultiFileAuthState` writes creds/keys to the local
 * filesystem, which Render wipes on every redeploy — the WhatsApp link would
 * die constantly. This adapter stores the same state in Postgres (one row per
 * key, creds under id "creds"), mirroring how we already persist Express
 * sessions via connect-pg-simple.
 *
 * See docs/whatsapp-poll-listener-spec.md.
 */
import {
  proto,
  initAuthCreds,
  BufferJSON,
} from '@whiskeysockets/baileys';
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import prisma from '../../prisma';

export async function usePostgresAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const readData = async (id: string): Promise<any | null> => {
    const row = await prisma.whatsappAuthState.findUnique({ where: { id } });
    if (!row) return null;
    return JSON.parse(row.value, BufferJSON.reviver);
  };

  const writeData = async (id: string, value: unknown): Promise<void> => {
    const data = JSON.stringify(value, BufferJSON.replacer);
    await prisma.whatsappAuthState.upsert({
      where: { id },
      create: { id, value: data },
      update: { value: data },
    });
  };

  const removeData = async (id: string): Promise<void> => {
    await prisma.whatsappAuthState.deleteMany({ where: { id } });
  };

  const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in (data as any)[category]) {
              const value = (data as any)[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData('creds', creds),
  };
}

/**
 * Wipe all stored WhatsApp auth state. Call this after a logout (or to force a
 * fresh QR link). After clearing, restart the listener to get a new QR.
 */
export async function clearPostgresAuthState(): Promise<void> {
  await prisma.whatsappAuthState.deleteMany({});
}
