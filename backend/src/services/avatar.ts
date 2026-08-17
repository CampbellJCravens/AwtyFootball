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
  pictureUrl: string | null;
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
  if (!player.pictureUrl) return null;
  const version = player.updatedAt ? `?v=${player.updatedAt.getTime()}` : '';
  return `${req.protocol}://${req.get('host')}/api/players/${player.id}/avatar${version}`;
}

/** The public shape of a player wherever one is embedded in another payload. */
export function publicPlayer(
  req: OriginRequest,
  player: { id: string; name: string; pictureUrl: string | null; updatedAt?: Date },
) {
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
