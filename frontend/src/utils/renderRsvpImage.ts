// Renders a PNG snapshot of the current RSVP state for sharing into WhatsApp.
// Pure 2D canvas (no DOM capture deps) so it stays fast and predictable.

export interface RsvpImageData {
  title: string;                                          // "Sat May 16 · 8:45 AM · Stadium"
  inList: { name: string; guests: number }[];
  maybeList: { name: string }[];
  outList: { name: string }[];
}

const COLORS = {
  bgBase: '#051a10',
  surface: '#0c2819',
  surfaceRaised: '#1a442e',
  border: '#1e4a30',
  gold: '#F59E0B',
  textPrimary: '#FFFFFF',
  textSecondary: '#c2dbd0',
  textTertiary: '#7faa94',
  textMuted: '#4d7d64',
  green: '#22c55e',
  amber: '#F59E0B',
  red: '#ef4444',
};

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export async function renderRsvpImage(data: RsvpImageData): Promise<Blob> {
  const inGuests = data.inList.reduce((s, p) => s + p.guests, 0);
  const totalComing = data.inList.length + inGuests;

  type Section = { label: string; rows: string[]; color: string; subtitle: string };
  const sections: Section[] = [];
  if (data.inList.length > 0) {
    sections.push({
      label: 'IN',
      color: COLORS.green,
      subtitle: inGuests > 0
        ? `${data.inList.length} · +${inGuests} guest${inGuests === 1 ? '' : 's'}`
        : `${data.inList.length}`,
      rows: data.inList.map(p => p.guests > 0 ? `${p.name}  +${p.guests}` : p.name),
    });
  }
  if (data.maybeList.length > 0) {
    sections.push({
      label: 'MAYBE',
      color: COLORS.amber,
      subtitle: `${data.maybeList.length}`,
      rows: data.maybeList.map(p => p.name),
    });
  }
  if (data.outList.length > 0) {
    sections.push({
      label: 'OUT',
      color: COLORS.red,
      subtitle: `${data.outList.length}`,
      rows: data.outList.map(p => p.name),
    });
  }

  const width = 800;
  const padding = 40;
  const headerH = 44;
  const titleH = 50;
  const heroH = 140;
  const sectionHeaderH = 38;
  const rowH = 32;
  const sectionGap = 18;
  const footerH = 24;

  let sectionsH = 0;
  for (const s of sections) sectionsH += sectionHeaderH + s.rows.length * rowH;
  if (sections.length > 1) sectionsH += (sections.length - 1) * sectionGap;
  if (sections.length === 0) sectionsH = 60;

  const height = padding + headerH + 12 + titleH + 24 + heroH + 28 + sectionsH + 28 + footerH + padding;

  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = COLORS.bgBase;
  ctx.fillRect(0, 0, width, height);

  let y = padding;

  // Brand row
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.gold;
  ctx.font = `bold 22px ${FONT_STACK}`;
  ctx.fillText('AWTY FOOTBALL', padding, y);
  const brandW = ctx.measureText('AWTY FOOTBALL').width;
  ctx.fillStyle = COLORS.textTertiary;
  ctx.font = `bold 12px ${FONT_STACK}`;
  ctx.fillText('RSVP', padding + brandW + 12, y + 8);
  y += headerH;

  // Gold underline
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(padding, y, 56, 3);
  y += 12;

  // Game title
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = `bold 26px ${FONT_STACK}`;
  ctx.fillText(data.title, padding, y);
  y += titleH;

  // Hero card
  const heroX = padding;
  const heroW = width - padding * 2;
  ctx.fillStyle = COLORS.surface;
  roundRect(ctx, heroX, y, heroW, heroH, 16);
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  roundRect(ctx, heroX, y, heroW, heroH, 16);
  ctx.stroke();

  // Hero number
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = `bold 80px ${FONT_STACK}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(String(totalComing), heroX + 32, y + heroH / 2);
  const numW = ctx.measureText(String(totalComing)).width;

  const labelX = heroX + 32 + numW + 24;
  ctx.fillStyle = COLORS.textTertiary;
  ctx.font = `bold 13px ${FONT_STACK}`;
  ctx.textBaseline = 'top';
  ctx.fillText(totalComing === 1 ? 'PLAYER COMING' : 'PLAYERS COMING', labelX, y + heroH / 2 - 18);

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = `15px ${FONT_STACK}`;
  const inText = `${data.inList.length} in`;
  ctx.fillText(inText, labelX, y + heroH / 2 + 4);
  if (inGuests > 0) {
    const inW = ctx.measureText(inText).width;
    ctx.fillStyle = COLORS.gold;
    ctx.fillText(` · +${inGuests} guest${inGuests === 1 ? '' : 's'}`, labelX + inW, y + heroH / 2 + 4);
  }
  y += heroH + 28;

  // Sections
  if (sections.length === 0) {
    ctx.fillStyle = COLORS.textTertiary;
    ctx.font = `14px ${FONT_STACK}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('No RSVPs yet — share this link to get the first response.', padding, y + 30);
    y += 60;
  } else {
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      // Section header
      ctx.fillStyle = s.color;
      ctx.fillRect(padding, y + 12, 4, 18);
      ctx.fillStyle = s.color;
      ctx.font = `bold 14px ${FONT_STACK}`;
      ctx.textBaseline = 'top';
      ctx.fillText(s.label, padding + 14, y + 14);
      const labelW = ctx.measureText(s.label).width;
      ctx.fillStyle = COLORS.textTertiary;
      ctx.font = `bold 14px ${FONT_STACK}`;
      ctx.fillText(`· ${s.subtitle}`, padding + 14 + labelW + 10, y + 14);
      y += sectionHeaderH;

      // Rows
      for (const row of s.rows) {
        ctx.fillStyle = s.color;
        ctx.fillRect(padding, y + 8, 3, rowH - 16);
        ctx.fillStyle = COLORS.textPrimary;
        ctx.font = `15px ${FONT_STACK}`;
        ctx.textBaseline = 'middle';
        const text = truncateToWidth(ctx, row, width - padding * 2 - 16);
        ctx.fillText(text, padding + 14, y + rowH / 2);
        y += rowH;
      }

      if (i < sections.length - 1) y += sectionGap;
    }
    y += 28;
  }

  // Footer
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `12px ${FONT_STACK}`;
  ctx.textBaseline = 'top';
  ctx.fillText('awtyfootballclub.com', padding, height - padding - 4);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to render PNG'));
    }, 'image/png');
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
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
