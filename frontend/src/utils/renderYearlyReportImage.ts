// Renders a PNG "season in review" report — marquee awards + top-N leaderboards.
// Pure 2D canvas, same brand family as the match + monthly reports.

import { COLORS, FONT_STACK, loadImage, roundRect, truncateToWidth, canvasToPngBlob } from './reportCanvas';

export interface YearlyAwardItem {
  label: string;
  names: string;
  value: string;
}

export interface YearlyLeaderRow {
  rank: number;
  name: string;
  value: string;
}

export interface YearlyLeaderboard {
  title: string;
  rows: YearlyLeaderRow[];
}

export interface YearlyReportData {
  year: number;
  gamesPlayed: number;
  totalGoals: number;
  playerOfTheYear: YearlyAwardItem | null;
  awardTiles: YearlyAwardItem[];       // Golden Boot, Playmaker, Iron Man, …
  leaderboards: YearlyLeaderboard[];   // full-width sections, two internal columns
  banners: YearlyAwardItem[];          // Best Duo, Best Trio
  logoUrl?: string;
}

export async function renderYearlyReportImage(data: YearlyReportData): Promise<Blob> {
  let logo: HTMLImageElement | null = null;
  try {
    logo = await loadImage(data.logoUrl ?? '/afc-logo.png');
  } catch {
    logo = null;
  }

  const width = 448;
  const padding = 24;
  const contentW = width - padding * 2;

  const crestH = logo ? 88 : 0;
  const crestW = logo ? crestH * (logo.width / logo.height) : 0;
  const gapAfterCrest = logo ? 8 : 0;
  const kickerH = 18;
  const titleH = 30;
  const subH = 18;
  const gapAfterHeader = 14;

  const heroH = data.playerOfTheYear ? 64 : 0;
  const gapAfterHero = data.playerOfTheYear ? 12 : 0;

  const tileGap = 12;
  const tileW = (contentW - tileGap) / 2;
  const tileH = 72;
  const tileRows = Math.ceil(data.awardTiles.length / 2);
  const tilesH = tileRows > 0 ? tileRows * tileH + (tileRows - 1) * tileGap : 0;
  const gapAfterTiles = data.awardTiles.length ? 16 : 0;

  const lbTitleH = 24;
  const lbRowH = 21;
  const lbSectionGap = 14;
  const lbColGap = 16;
  const lbColW = (contentW - lbColGap) / 2;
  const sectionH = (lb: YearlyLeaderboard) => lbTitleH + Math.ceil(lb.rows.length / 2) * lbRowH;
  const lbTotal = data.leaderboards.length
    ? data.leaderboards.reduce((sum, lb) => sum + sectionH(lb), 0) + (data.leaderboards.length - 1) * lbSectionGap
    : 0;
  const gapAfterLb = data.leaderboards.length && data.banners.length ? 16 : 0;

  const bannerH = 52;
  const bannerGap = 10;
  const bannersH = data.banners.length ? data.banners.length * bannerH + (data.banners.length - 1) * bannerGap : 0;

  const gapBeforeFooter = 14;
  const footerH = 14;

  const height =
    padding + crestH + gapAfterCrest + kickerH + titleH + subH + gapAfterHeader +
    heroH + gapAfterHero + tilesH + gapAfterTiles + lbTotal + gapAfterLb + bannersH +
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
  ctx.fillText('S E A S O N   I N   R E V I E W', cx, y);
  y += kickerH;

  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = `bold 28px ${FONT_STACK}`;
  ctx.fillText(String(data.year), cx, y);
  y += titleH;

  ctx.fillStyle = COLORS.textTertiary;
  ctx.font = `14px ${FONT_STACK}`;
  ctx.fillText(`${data.gamesPlayed} game${data.gamesPlayed === 1 ? '' : 's'} · ${data.totalGoals} goals`, cx, y);
  y += subH + gapAfterHeader;

  // Player of the Year hero
  if (data.playerOfTheYear) {
    const a = data.playerOfTheYear;
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

    ctx.font = `bold 15px ${FONT_STACK}`;
    const valW = ctx.measureText(a.value).width + 16;
    ctx.fillStyle = COLORS.textPrimary;
    ctx.font = `bold 22px ${FONT_STACK}`;
    ctx.fillText(truncateToWidth(ctx, a.names, contentW - 32 - valW), padding + 16, y + 31);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.gold;
    ctx.font = `bold 15px ${FONT_STACK}`;
    ctx.fillText(a.value, padding + contentW - 16, y + heroH / 2 + 5);
    y += heroH + gapAfterHero;
  }

  // Marquee award tiles (2-col, odd last spans full width)
  const drawTile = (tx: number, ty: number, w: number, a: YearlyAwardItem) => {
    ctx.fillStyle = COLORS.surface;
    roundRect(ctx, tx, ty, w, tileH, 11);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    roundRect(ctx, tx, ty, w, tileH, 11);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.gold;
    ctx.font = `bold 10px ${FONT_STACK}`;
    ctx.fillText(truncateToWidth(ctx, a.label, w - 24), tx + 13, ty + 12);

    ctx.fillStyle = COLORS.textPrimary;
    ctx.font = `bold 16px ${FONT_STACK}`;
    ctx.fillText(truncateToWidth(ctx, a.names, w - 24), tx + 13, ty + 29);

    ctx.fillStyle = COLORS.textSecondary;
    ctx.font = `13px ${FONT_STACK}`;
    ctx.fillText(truncateToWidth(ctx, a.value, w - 24), tx + 13, ty + 51);
  };

  const nt = data.awardTiles.length;
  data.awardTiles.forEach((a, i) => {
    const ty = y + Math.floor(i / 2) * (tileH + tileGap);
    if (nt % 2 === 1 && i === nt - 1) drawTile(padding, ty, contentW, a);
    else drawTile(padding + (i % 2) * (tileW + tileGap), ty, tileW, a);
  });
  y += tilesH + gapAfterTiles;

  // Leaderboard sections (full-width; top-N split into two rank columns)
  data.leaderboards.forEach((lb, li) => {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(padding, y + 2, 3, 14);
    ctx.font = `bold 12px ${FONT_STACK}`;
    ctx.fillText(lb.title, padding + 11, y + 3);
    const sy = y + lbTitleH;

    const half = Math.ceil(lb.rows.length / 2);
    lb.rows.forEach((r, i) => {
      const col = i < half ? 0 : 1;
      const rowIdx = i < half ? i : i - half;
      const colX = padding + col * (lbColW + lbColGap);
      const ry = sy + rowIdx * lbRowH;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = r.rank <= 3 ? COLORS.gold : COLORS.textMuted;
      ctx.font = `bold 12px ${FONT_STACK}`;
      ctx.fillText(String(r.rank), colX, ry + lbRowH / 2);

      ctx.font = `bold 13px ${FONT_STACK}`;
      ctx.fillStyle = COLORS.textPrimary;
      ctx.textAlign = 'right';
      const valStr = r.value;
      const valW = ctx.measureText(valStr).width;
      ctx.textAlign = 'left';
      const name = truncateToWidth(ctx, r.name, lbColW - 22 - valW - 8);
      ctx.fillText(name, colX + 20, ry + lbRowH / 2);

      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.textSecondary;
      ctx.font = `12px ${FONT_STACK}`;
      ctx.fillText(valStr, colX + lbColW, ry + lbRowH / 2);
    });

    y += sectionH(lb);
    if (li < data.leaderboards.length - 1) y += lbSectionGap;
  });
  y += gapAfterLb;

  // Best Duo / Best Trio banners
  data.banners.forEach((a, i) => {
    const by = y + i * (bannerH + bannerGap);
    ctx.fillStyle = COLORS.surface;
    roundRect(ctx, padding, by, contentW, bannerH, 11);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    roundRect(ctx, padding, by, contentW, bannerH, 11);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.gold;
    ctx.font = `bold 10px ${FONT_STACK}`;
    ctx.fillText(a.label, padding + 14, by + 10);

    ctx.font = `bold 14px ${FONT_STACK}`;
    const valW = a.value ? ctx.measureText(a.value).width + 14 : 0;
    ctx.fillStyle = COLORS.textPrimary;
    ctx.font = `bold 18px ${FONT_STACK}`;
    ctx.fillText(truncateToWidth(ctx, a.names, contentW - 28 - valW), padding + 14, by + 29);

    if (a.value) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.textSecondary;
      ctx.font = `bold 14px ${FONT_STACK}`;
      ctx.fillText(a.value, padding + contentW - 14, by + bannerH / 2 + 4);
    }
  });
  y += bannersH + gapBeforeFooter;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `13px ${FONT_STACK}`;
  ctx.fillText('awtyfootballclub.com', cx, y);

  return await canvasToPngBlob(canvas);
}
