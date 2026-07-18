// Shared canvas primitives + brand palette for the club's shareable reports
// (match report, monthly report, …). Keeps all reports visually one family.

export const COLORS = {
  bgBase: '#051a10',
  surface: '#0c2819',
  surfaceRaised: '#1a442e',
  border: '#1e4a30',
  gold: '#F59E0B',
  textPrimary: '#FFFFFF',
  textSecondary: '#c2dbd0',
  textTertiary: '#7faa94',
  textMuted: '#4d7d64',
};

export const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Sets ctx.font to the largest bold size (down to minSize) at which `text` fits
// `maxWidth`, so multi-name ties shrink to fit instead of truncating. Returns
// the chosen size. Caller still truncates as a last resort at the floor.
export function fitFontSize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, baseSize: number, minSize: number): number {
  for (let size = baseSize; size > minSize; size--) {
    ctx.font = `bold ${size}px ${FONT_STACK}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  ctx.font = `bold ${minSize}px ${FONT_STACK}`;
  return minSize;
}

// Shorten a name to initial(s) + surname: "James Okonkwo" → "J. Okonkwo",
// "Morgan-Sean McCright" → "M-S. McCright". Surname is never abbreviated.
export function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const last = parts[parts.length - 1];
  const firsts = parts.slice(0, -1)
    .map(p => p.split('-').map(seg => seg.charAt(0).toUpperCase()).join('-') + '.')
    .join(' ');
  return `${firsts} ${last}`;
}

// Fit a list of tied names into <= maxLines lines within maxWidth, escalating:
// full names shrunk → wrapped → abbreviated → abbreviated+wrapped → truncated.
// Returns the lines to draw and the font size to draw them at.
export function layoutNames(
  ctx: CanvasRenderingContext2D,
  names: string[],
  maxWidth: number,
  baseSize: number,
  minSize: number,
  maxLines: number,
): { lines: string[]; fontSize: number } {
  const pack = (tokens: string[], size: number): string[] | null => {
    ctx.font = `bold ${size}px ${FONT_STACK}`;
    const lines: string[] = [];
    let cur = '';
    for (const t of tokens) {
      const trial = cur ? `${cur} · ${t}` : t;
      if (!cur || ctx.measureText(trial).width <= maxWidth) cur = trial;
      else { lines.push(cur); cur = t; }
    }
    if (cur) lines.push(cur);
    return lines.length <= maxLines ? lines : null;
  };
  for (const tokens of [names, names.map(abbreviateName)]) {
    for (let size = baseSize; size >= minSize; size--) {
      const lines = pack(tokens, size);
      if (lines) return { lines, fontSize: size };
    }
  }
  ctx.font = `bold ${minSize}px ${FONT_STACK}`;
  return { lines: [truncateToWidth(ctx, names.map(abbreviateName).join(' · '), maxWidth)], fontSize: minSize };
}

export function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const candidate = text.slice(0, mid) + '…';
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  return text.slice(0, Math.max(0, lo - 1)) + '…';
}

// PNG blob from a fully-drawn canvas.
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to render PNG'));
    }, 'image/png');
  });
}
