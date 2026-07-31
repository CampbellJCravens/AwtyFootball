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
import fs from 'fs/promises';
import path from 'path';
import {
  proto,
  initAuthCreds,
  BufferJSON,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import prisma from '../../prisma';
import { env } from '../../env';

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

// ── File-backed auth state (default) ────────────────────────────────────────
// Signal keys rotate constantly. Persisting each one to Postgres meant the Neon
// compute never went idle, which exhausted the compute quota and took the whole
// app down on 2026-07-29. Files cost nothing per write, so the database is only
// touched when someone actually uses the app.
//
// On Render this directory MUST be a mounted persistent disk — the container
// filesystem is wiped on redeploy, and losing it means re-pairing the phone.

/**
 * Copy any existing Postgres auth rows into the auth directory the first time
 * we boot on the file store. Without this the switch would silently drop the
 * live session and demand a fresh pairing code. Runs once: it no-ops as soon as
 * creds.json exists.
 */
async function migratePostgresAuthToFiles(dir: string): Promise<void> {
  const credsPath = path.join(dir, 'creds.json');
  try {
    await fs.access(credsPath);
    return; // already seeded
  } catch {
    /* not seeded yet */
  }

  let rows: Array<{ id: string; value: string }> = [];
  try {
    rows = await prisma.whatsappAuthState.findMany({ select: { id: true, value: true } });
  } catch (err) {
    // The database being unreachable is exactly the situation this migration
    // exists for (the Neon compute quota outage). Carrying on would hand Baileys
    // an empty directory, which silently mints a BRAND NEW session and forces a
    // re-pair of the phone. Fail instead, so the caller retries once the
    // database is back and the real session is still there to migrate.
    console.error('[whatsapp] Could not read Postgres auth state to migrate:', err);
    throw new Error(
      'WhatsApp auth migration deferred: the database is unreachable and no local session exists yet. ' +
        'Refusing to start a fresh session that would require re-pairing.'
    );
  }
  if (rows.length === 0) return;

  await fs.mkdir(dir, { recursive: true });
  // Baileys' file store names keys with '-' replaced by '__' and ':' by '-'.
  const fileName = (id: string) => `${id.replace(/\//g, '__').replace(/:/g, '-')}.json`;
  let written = 0;
  for (const row of rows) {
    try {
      await fs.writeFile(path.join(dir, fileName(row.id)), row.value, 'utf8');
      written++;
    } catch (err) {
      console.error(`[whatsapp] Failed to migrate auth key ${row.id}:`, err);
    }
  }
  console.log(
    `[whatsapp] Migrated ${written}/${rows.length} auth rows from Postgres to ${dir}. ` +
      `The Postgres rows are left intact as a fallback; delete them once this is proven.`
  );
}

/**
 * The auth state the listener should use, per env.WHATSAPP_AUTH_STORE.
 * Defaults to the file store; "postgres" restores the original behaviour.
 */
export async function useWhatsappAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  if (env.WHATSAPP_AUTH_STORE === 'postgres') {
    console.log('[whatsapp] Auth store: postgres (writes keep the DB compute awake)');
    return usePostgresAuthState();
  }
  const dir = path.resolve(env.WHATSAPP_AUTH_DIR);
  if (process.env.NODE_ENV === 'production' && !process.env.WHATSAPP_AUTH_DIR) {
    console.warn(
      `[whatsapp] WHATSAPP_AUTH_DIR is not set, so auth state is going to ${dir} on the ` +
        `container filesystem. Render wipes that on every redeploy, which means re-pairing ` +
        `the phone each time. Point it at a mounted persistent disk.`
    );
  }
  await migratePostgresAuthToFiles(dir);
  await fs.mkdir(dir, { recursive: true });
  console.log(`[whatsapp] Auth store: file (${dir})`);
  return useMultiFileAuthState(dir);
}

/** Wipe auth state in whichever store is active, for a forced re-link. */
export async function clearWhatsappAuthState(): Promise<void> {
  if (env.WHATSAPP_AUTH_STORE === 'postgres') {
    await clearPostgresAuthState();
    return;
  }
  const dir = path.resolve(env.WHATSAPP_AUTH_DIR);
  try {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    console.error('[whatsapp] Failed to clear file auth state:', err);
  }
  // Also drop the Postgres copy, or the next boot would re-migrate the dead
  // session straight back over the top of the fresh one.
  try {
    await clearPostgresAuthState();
  } catch (err) {
    console.error('[whatsapp] Failed to clear Postgres auth fallback:', err);
  }
}
