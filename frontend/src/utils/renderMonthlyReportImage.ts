// Renders a compact PNG "monthly highlights" report for sharing into WhatsApp.
// Pure 2D canvas, same brand family as the match report.

import { COLORS, FONT_STACK, loadImage, roundRect, truncateToWidth, canvasToPngBlob } from './reportCanvas';

export interface MonthlyAwardItem {
  label: string;   // "TOP SCORER"
  names: string;   // "Morgan-Sean McCright" or "A · B" on a tie
  value: string;   // "7 goals"
}

export interface MonthlyReportData {
  monthName: string;                     // "July"
  year: number;
  gamesPlayed: number;
  playerOfTheMonth: MonthlyAwardItem | null;
  awards: MonthlyAwardItem[];            // scorer / assister / contributor / defender / sportsman (present only)
  banners: MonthlyAwardItem[];           // full-width: Top Duo, Top Trio, Highest-Scoring Game (present only)
  logoUrl?: string;
}

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

  const crestH = logo ? 88 : 0;
  const crestW = logo ? crestH * (logo.width / logo.height) : 0;
  const gapAfterCrest = logo ? 8 : 0;
  const kickerH = 18;
  const titleH = 30;
  const subH = 18;
  const gapAfterHeader = 14;
  const heroH = data.playerOfTheMonth ? 64 : 0;
  const gapAfterHero = data.playerOfTheMonth ? 12 : 0;

  const tileGap = 12;
  const tileW = (contentW - tileGap) / 2;
  const tileH = 74;
  const rows = Math.ceil(data.awards.length / 2);
  const gridH = rows > 0 ? rows * tileH + (rows - 1) * tileGap : 0;

  const bannerH = 52;
  const bannerGap = 10;
  const bannersH = data.banners.length ? data.banners.length * bannerH + (data.banners.length - 1) * bannerGap : 0;
  const gapAfterGrid = data.banners.length ? 12 : 0;
  const gapBeforeFooter = 14;
  const footerH = 14;

  const height =
    padding + crestH + gapAfterCrest + kickerH + titleH + subH + gapAfterHeader +
    heroH + gapAfterHero + gridH + gapAfterGrid + bannersH +
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

  // Player of the Month hero (full width, gold border)
  if (data.playerOfTheMonth) {
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

  // Award tile (width-parameterized so an odd last tile can span full width)
  const drawTile = (tx: number, ty: number, w: number, a: MonthlyAwardItem) => {
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
    ctx.fillText(truncateToWidth(ctx, a.label, w - 24), tx + 13, ty + 13);

    ctx.fillStyle = COLORS.textPrimary;
    ctx.font = `bold 16px ${FONT_STACK}`;
    ctx.fillText(truncateToWidth(ctx, a.names, w - 24), tx + 13, ty + 30);

    ctx.fillStyle = COLORS.textSecondary;
    ctx.font = `13px ${FONT_STACK}`;
    ctx.fillText(truncateToWidth(ctx, a.value, w - 24), tx + 13, ty + 52);
  };

  const n = data.awards.length;
  data.awards.forEach((a, i) => {
    const row = Math.floor(i / 2);
    const ty = y + row * (tileH + tileGap);
    // Odd count → last tile spans full width so there's never an empty cell.
    if (n % 2 === 1 && i === n - 1) {
      drawTile(padding, ty, contentW, a);
    } else {
      drawTile(padding + (i % 2) * (tileW + tileGap), ty, tileW, a);
    }
  });
  y += gridH + gapAfterGrid;

  // Full-width banners (Top Duo, Top Trio, Highest-Scoring Game)
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
    ctx.fillText(a.label, padding + 14, by + 11);

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
