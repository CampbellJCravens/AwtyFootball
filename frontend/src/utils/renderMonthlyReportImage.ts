// Renders a compact PNG "monthly highlights" report for sharing into WhatsApp.
// Pure 2D canvas, same brand family as the match report.

import { COLORS, FONT_STACK, loadImage, roundRect, truncateToWidth, layoutNames, canvasToPngBlob } from './reportCanvas';

export interface MonthlyAwardItem {
  label: string;    // "TOP SCORER"
  names: string[];  // tied winners; one entry for a single winner
  value: string;    // "7 goals"
  // Always take a full-width row. Game of the Month used to get this by
  // accident — it was simply last in an odd-length list — so adding any tile
  // after it silently demoted it. Saying so explicitly makes it survive.
  wide?: boolean;
}

export interface MonthlyReportData {
  monthName: string;                     // "July"
  year: number;
  gamesPlayed: number;
  playerOfTheMonth: MonthlyAwardItem | null;
  awards: MonthlyAwardItem[];            // grid tiles (incl. Highest-Scoring Game)
  banners: MonthlyAwardItem[];           // full-width: Top Duo
  logoUrl?: string;
}

type Layout = { lines: string[]; fontSize: number };

export async function renderMonthlyReportImage(data: MonthlyReportData): Promise<Blob> {
  let logo: HTMLImageElement | null = null;
  try {
    logo = await loadImage(data.logoUrl ?? '/afc-logo.png');
  } catch {
    logo = null;
  }

  const width = 448;
  const padding = 24;
  const contentW = width - padding * 2;

  const tileGap = 12;
  const tileW = (contentW - tileGap) / 2;

  // Measuring pass: figure out how many lines each name block needs so cards
  // can grow for wrapped ties (font shrinks + wraps + abbreviates as needed).
  const meas = document.createElement('canvas').getContext('2d')!;
  const valW = (value: string, font: string, gap: number) => { meas.font = font; return value ? meas.measureText(value).width + gap : 0; };

  const heroValW = valW(data.playerOfTheMonth?.value ?? '', `bold 15px ${FONT_STACK}`, 16);
  const heroLayout: Layout | null = data.playerOfTheMonth
    ? layoutNames(meas, data.playerOfTheMonth.names, contentW - 32 - heroValW, 22, 13, 2)
    : null;

  const n = data.awards.length;

  // Pack the tiles into rows first, in order: a wide tile takes a row to
  // itself, everything else pairs up, and a lone tile at the end of a row
  // stretches. Widths and heights both fall out of this, so the measuring pass
  // and the drawing pass cannot disagree about the layout.
  const tileRowIdx: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (data.awards[i].wide) { tileRowIdx.push([i]); continue; }
    const next = i + 1;
    if (next < n && !data.awards[next].wide) { tileRowIdx.push([i, next]); i = next; }
    else tileRowIdx.push([i]);
  }
  const tileWidthFor = (i: number) =>
    (tileRowIdx.find(r => r.includes(i))!.length === 1 ? contentW : tileW);

  const tileLayouts: Layout[] = data.awards.map((a, i) =>
    layoutNames(meas, a.names, tileWidthFor(i) - 24, 16, 10, 2));
  const bannerLayouts: Layout[] = data.banners.map(a => {
    const bValW = valW(a.value, `bold 14px ${FONT_STACK}`, 14);
    return layoutNames(meas, a.names, contentW - 28 - bValW, 18, 12, 2);
  });

  // Heights
  const crestH = logo ? 88 : 0;
  const crestW = logo ? crestH * (logo.width / logo.height) : 0;
  const gapAfterCrest = logo ? 8 : 0;
  const kickerH = 18;
  const titleH = 30;
  const subH = 18;
  const gapAfterHeader = 14;

  const heroLineH = 22;
  const heroH = heroLayout ? 42 + heroLayout.lines.length * heroLineH : 0;
  const gapAfterHero = heroLayout ? 12 : 0;

  const tileLineH = 17;
  const tileHeightFor = (lines: number) => 54 + lines * tileLineH;
  const tileRows = tileRowIdx.length;
  const rowLines: number[] = tileRowIdx.map(row =>
    Math.max(1, ...row.map(i => tileLayouts[i]?.lines.length ?? 1)));
  const tilesH = rowLines.reduce((s, l) => s + tileHeightFor(l), 0) + (tileRows > 0 ? (tileRows - 1) * tileGap : 0);
  const gapAfterTiles = n ? 16 : 0;

  const bannerLineH = 17;
  const bannerGap = 10;
  const bannerHeightFor = (lines: number) => 35 + lines * bannerLineH;
  const bannersH = data.banners.length
    ? bannerLayouts.reduce((s, l) => s + bannerHeightFor(l.lines.length), 0) + (data.banners.length - 1) * bannerGap
    : 0;
  const gapAfterGrid = data.banners.length ? 12 : 0;

  const gapBeforeFooter = 14;
  const footerH = 14;

  const height =
    padding + crestH + gapAfterCrest + kickerH + titleH + subH + gapAfterHeader +
    heroH + gapAfterHero + tilesH + gapAfterTiles + bannersH + gapAfterGrid +
    gapBeforeFooter + footerH + padding;

  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = COLORS.bgBase;
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  let y = padding;

  if (logo) {
    ctx.drawImage(logo, cx - crestW / 2, y, crestW, crestH);
    y += crestH + gapAfterCrest;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.gold;
  ctx.font = `bold 14px ${FONT_STACK}`;
  ctx.fillText('M O N T H L Y   R E P O R T', cx, y);
  y += kickerH;

  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = `bold 26px ${FONT_STACK}`;
  ctx.fillText(`${data.monthName} ${data.year}`, cx, y);
  y += titleH;

  ctx.fillStyle = COLORS.textTertiary;
  ctx.font = `14px ${FONT_STACK}`;
  ctx.fillText(`${data.gamesPlayed} game${data.gamesPlayed === 1 ? '' : 's'} played`, cx, y);
  y += subH + gapAfterHeader;

  // Draw a (possibly multi-line) name block, truncating each line as a safety.
  const drawNames = (x: number, top: number, layout: Layout, maxW: number, lineH: number, color: string) => {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.font = `bold ${layout.fontSize}px ${FONT_STACK}`;
    layout.lines.forEach((ln, i) => ctx.fillText(truncateToWidth(ctx, ln, maxW), x, top + i * lineH));
  };

  // Player of the Month hero
  if (data.playerOfTheMonth && heroLayout) {
    const a = data.playerOfTheMonth;
    ctx.fillStyle = COLORS.surfaceRaised;
    roundRect(ctx, padding, y, contentW, heroH, 12);
    ctx.fill();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 1.5;
    roundRect(ctx, padding, y, contentW, heroH, 12);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.gold;
    ctx.font = `bold 11px ${FONT_STACK}`;
    ctx.fillText(`★ ${a.label}`, padding + 16, y + 12);

    drawNames(padding + 16, y + 30, heroLayout, contentW - 32 - heroValW, heroLineH, COLORS.textPrimary);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.gold;
    ctx.font = `bold 15px ${FONT_STACK}`;
    ctx.fillText(a.value, padding + contentW - 16, y + heroH / 2 + 4);
    y += heroH + gapAfterHero;
  }

  // Award tiles
  const drawTile = (tx: number, ty: number, w: number, rowH: number, a: MonthlyAwardItem, layout: Layout) => {
    ctx.fillStyle = COLORS.surface;
    roundRect(ctx, tx, ty, w, rowH, 11);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    roundRect(ctx, tx, ty, w, rowH, 11);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.gold;
    ctx.font = `bold 10px ${FONT_STACK}`;
    ctx.fillText(truncateToWidth(ctx, a.label, w - 24), tx + 13, ty + 13);

    drawNames(tx + 13, ty + 30, layout, w - 26, tileLineH, COLORS.textPrimary);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.textSecondary;
    ctx.font = `13px ${FONT_STACK}`;
    ctx.fillText(truncateToWidth(ctx, a.value, w - 26), tx + 13, ty + rowH - 24);
  };

  let ty = y;
  tileRowIdx.forEach((row, r) => {
    const rowH = tileHeightFor(rowLines[r]);
    row.forEach((i, col) => {
      const w = row.length === 1 ? contentW : tileW;
      drawTile(padding + col * (tileW + tileGap), ty, w, rowH, data.awards[i], tileLayouts[i]);
    });
    ty += rowH + tileGap;
  });
  y += tilesH + gapAfterTiles;

  // Full-width banners (Top Duo)
  let by = y;
  data.banners.forEach((a, i) => {
    const layout = bannerLayouts[i];
    const bH = bannerHeightFor(layout.lines.length);
    ctx.fillStyle = COLORS.surface;
    roundRect(ctx, padding, by, contentW, bH, 11);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    roundRect(ctx, padding, by, contentW, bH, 11);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.gold;
    ctx.font = `bold 10px ${FONT_STACK}`;
    ctx.fillText(a.label, padding + 14, by + 10);

    const bValW = valW(a.value, `bold 14px ${FONT_STACK}`, 14);
    drawNames(padding + 14, by + 27, layout, contentW - 28 - bValW, bannerLineH, COLORS.textPrimary);

    if (a.value) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.textSecondary;
      ctx.font = `bold 14px ${FONT_STACK}`;
      ctx.fillText(a.value, padding + contentW - 14, by + bH / 2 + 4);
    }
    by += bH + bannerGap;
  });
  y += bannersH + gapAfterGrid;

  y += gapBeforeFooter;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `13px ${FONT_STACK}`;
  ctx.fillText('awtyfootballclub.com', cx, y);

  return await canvasToPngBlob(canvas);
}
