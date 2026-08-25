/**
 * Player photos travel as a URL, never as base64 inside a payload.
 *
 * They used to be inlined everywhere a player was mentioned, which made
 * GET /api/stats/monthly 22.7 MB — twelve distinct photographs, serialised
 * fifty-one times, wrapped around 10 KB of actual statistics. As a URL the
 * browser fetches each photo once and caches it, and no JSON carries an image.
 *
 * The origin is taken from the request rather than an env var: it is the host
 * the client just successfully called, so it cannot drift from wherever the API
 * is really deployed. (`trust proxy` is set in index.ts, so req.protocol is the
 * external scheme rather than Render's internal http.)
 */

export interface AvatarSource {
  id: string;
  /** Present when the caller loaded the whole row. Prefer hasPhoto. */
  pictureUrl?: string | null;
  /** Set by loadPlayersForDisplay, which never transfers the photo itself. */
  hasPhoto?: boolean;
  updatedAt?: Date;
}

export interface OriginRequest {
  protocol: string;
  get(name: string): string | undefined;
}

/**
 * `?v=updatedAt` is what makes the year-long cache safe: a changed photo is a
 * different URL. Where updatedAt isn't to hand the parameter is omitted, and the
 * route falls back to a short cache with an ETag — correct, just less efficient.
 */
export function avatarUrl(req: OriginRequest, player: AvatarSource): string | null {
  const has = player.hasPhoto ?? !!player.pictureUrl;
  if (!has) return null;
  const version = player.updatedAt ? `?v=${player.updatedAt.getTime()}` : '';
  return `${req.protocol}://${req.get('host')}/api/players/${player.id}/avatar${version}`;
}

/** The public shape of a player wherever one is embedded in another payload. */
export function publicPlayer(req: OriginRequest, player: AvatarSource & { name: string }) {
  return { id: player.id, name: player.name, pictureUrl: avatarUrl(req, player) };
}

/**
 * A stored photo must always be base64 — accepting anything else would let a
 * client echo the avatar URL back into the column and destroy the image. The
 * edit form only sends this field when a new file is chosen, so in practice
 * this guard should never fire; it exists so that a future caller which does
 * echo the whole player object cannot quietly wipe everyone's photos.
 */
export const isStorableImage = (value: string) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);

// ── Loading players without dragging their photos across the wire ──────────
//
// Serving photos as URLs fixed what leaves the API. It did NOT fix what leaves
// the DATABASE: `prisma.player.findMany()` with no `select` still pulls every
// column, so 1.22 MB of base64 crossed Neon → Render on every call, and the
// serialiser then threw it away. Five call sites did this on hot endpoints,
// which exhausted Neon's 5 GB data transfer allowance on 2026-08-25 and took
// the app down. Same photos, different pipe.
//
// Selecting around the column is the whole fix. `hasPhoto` comes from a second
// tiny query so the avatar URL can still be built, since Prisma can't select a
// computed expression.

/** Every Player column except the base64 photo. */
export const PLAYER_SELECT_NO_PHOTO = {
  id: true,
  name: true,
  team: true,
  phone: true,
  onRoster: true,
  isAlumni: true,
  memberSince: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PlayerForDisplay = {
  id: string;
  name: string;
  team: string | null;
  phone: string | null;
  onRoster: boolean;
  isAlumni: boolean;
  memberSince: number | null;
  createdAt: Date;
  updatedAt: Date;
  hasPhoto: boolean;
};

interface PlayerLoaderClient {
  player: { findMany: (args: any) => Promise<any[]> };
  $queryRawUnsafe: (sql: string) => Promise<any[]>;
}

/**
 * Every player, ready to embed, with no photo bytes transferred.
 *
 * Use this anywhere you would have written `prisma.player.findMany()` purely to
 * build a name/photo map. Costs two small queries instead of one large one.
 */
export async function loadPlayersForDisplay(
  prisma: PlayerLoaderClient,
  args: { orderBy?: unknown } = {},
): Promise<PlayerForDisplay[]> {
  const [players, withPhoto] = await Promise.all([
    prisma.player.findMany({ ...args, select: PLAYER_SELECT_NO_PHOTO }),
    prisma.$queryRawUnsafe(
      `SELECT id FROM "Player" WHERE "pictureUrl" IS NOT NULL AND "pictureUrl" <> ''`,
    ),
  ]);
  const ids = new Set(withPhoto.map((r: { id: string }) => r.id));
  return players.map((p) => ({ ...p, hasPhoto: ids.has(p.id) })) as PlayerForDisplay[];
}
