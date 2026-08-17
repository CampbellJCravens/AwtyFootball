// Renders a PNG match report for sharing into WhatsApp right after a game.
// Pure 2D canvas (mirrors renderRsvpImage.ts) so it stays fast and on-brand.
// Portrait + narrow: sized for phones, single-column so nothing feels wide.

export interface MatchGoalLine {
  scorer: string;
  assister: string | null;
  // The team CREDITED — for an own goal, the scorer's opponent, so the goal
  // correctly appears in the benefiting team's column.
  team: 'color' | 'white' | null;
  ownGoal?: boolean;
}

export interface ManOfTheMatch {
  name: string;
  goals: number;
  assists: number;
}

export interface MatchReportData {
  title: string;                 // "Game 42 · Sat Jul 18 · Stadium"
  colorScore: number;
  whiteScore: number;
  goals: MatchGoalLine[];        // in scored order
  manOfTheMatch: ManOfTheMatch[] | null; // ties → multiple; null when no goals
  // How competitive the game was, e.g. "Classic · tight, and the lead changed".
  // Describes the GAME — never a player, who is not responsible for the teams.
  balanceNote?: string;
  logoUrl?: string;              // defaults to /afc-logo.png
}

import { COLORS, FONT_STACK, loadImage, roundRect, truncateToWidth, canvasToPngBlob } from './reportCanvas';

export async function renderMatchReportImage(data: MatchReportData): Promise<Blob> {
  const colorGoals = data.goals.filter(g => g.team === 'color');
  const whiteGoals = data.goals.filter(g => g.team === 'white');

  // Load the crest up front (so we know its aspect + whether to reserve space).
  let logo: HTMLImageElement | null = null;
  try {
    logo = await loadImage(data.logoUrl ?? '/afc-logo.png');
  } catch {
    logo = null;
  }

  const width = 448;
  const padding = 24;
  const contentW = width - padding * 2;

  const crestH = logo ? 92 : 0;
  const crestW = logo ? crestH * (logo.width / logo.height) : 0;
  const gapAfterCrest = logo ? 8 : 0;
  const labelH = 18;      // "MATCH REPORT"
  const titleH = 27;
  const gapAfterTitle = 4;
  const scoreH = 54;
  const gapAfterScore = 12;
  const colHeaderH = 22;   // per-column "COLOR"/"WHITE" label
  const nameLineH = 24;
  const assistLineH = 18;
  const goalGap = 7;
  const gapBeforeMotm = 12;
  const motmH = data.manOfTheMatch && data.manOfTheMatch.length > 0 ? 72 : 0;
  const gapBeforeFooter = 12;
  const footerH = 14;
  const balanceH = data.balanceNote ? 20 : 0;

  // Two side-by-side columns (Google-style), assist stacked under the scorer.
  const centerGap = 22;
  const colW = (contentW - centerGap) / 2;
  const leftX = padding;
  const rightX = padding + colW + centerGap;
  const dividerX = width / 2;

  const columnHeight = (goals: MatchGoalLine[]) => {
    if (goals.length === 0) return colHeaderH + nameLineH;
    let h = colHeaderH;
    goals.forEach((g, i) => {
      h += nameLineH + (g.assister ? assistLineH : 0);
      if (i < goals.length - 1) h += goalGap;
    });
    return h;
  };
  const sectionH = Math.max(columnHeight(colorGoals), columnHeight(whiteGoals));

  const height =
    padding + crestH + gapAfterCrest + labelH + titleH + gapAfterTitle +
    scoreH + balanceH + gapAfterScore + sectionH +
    (motmH ? gapBeforeMotm + motmH : 0) + gapBeforeFooter + footerH + padding;

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

  // Crest
  if (logo) {
    ctx.drawImage(logo, cx - crestW / 2, y, crestW, crestH);
    y += crestH + gapAfterCrest;
  }

  // "MATCH REPORT" kicker
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.gold;
  ctx.font = `bold 14px ${FONT_STACK}`;
  ctx.fillText('M A T C H   R E P O R T', cx, y);
  y += labelH;

  // Title
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = `bold 22px ${FONT_STACK}`;
  ctx.fillText(truncateToWidth(ctx, data.title, contentW), cx, y);
  y += titleH + gapAfterTitle;

  // Scoreboard line: COLOR 5 – 3 WHITE (winner's number gold)
  const colorWon = data.colorScore > data.whiteScore;
  const whiteWon = data.whiteScore > data.colorScore;
  const seg = [
    { text: 'COLOR', font: `bold 17px ${FONT_STACK}`, color: COLORS.gold },
    { text: String(data.colorScore), font: `bold 52px ${FONT_STACK}`, color: colorWon ? COLORS.gold : COLORS.textPrimary },
    { text: '–', font: `bold 34px ${FONT_STACK}`, color: COLORS.textMuted },
    { text: String(data.whiteScore), font: `bold 52px ${FONT_STACK}`, color: whiteWon ? COLORS.gold : COLORS.textPrimary },
    { text: 'WHITE', font: `bold 17px ${FONT_STACK}`, color: COLORS.textSecondary },
  ];
  const gap = 18;
  const widths = seg.map(s => { ctx.font = s.font; return ctx.measureText(s.text).width; });
  const totalW = widths.reduce((a, b) => a + b, 0) + gap * (seg.length - 1);
  let sx = cx - totalW / 2;
  const scoreMid = y + scoreH / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  seg.forEach((s, i) => {
    ctx.font = s.font;
    ctx.fillStyle = s.color;
    ctx.fillText(s.text, sx, scoreMid);
    sx += widths[i] + gap;
  });
  y += scoreH;

  // How competitive it was. A property of the game; nobody is named.
  if (data.balanceNote) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = `600 13px ${FONT_STACK}`;
    ctx.fillText(truncateToWidth(ctx, data.balanceNote, contentW), cx, y);
    y += balanceH;
  }
  y += gapAfterScore;

  // Two side-by-side goal columns with a center divider.
  const sectionTop = y;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dividerX, sectionTop + 2);
  ctx.lineTo(dividerX, sectionTop + sectionH);
  ctx.stroke();

  const drawColumn = (x: number, label: string, accent: string, goals: MatchGoalLine[]) => {
    let cy = sectionTop;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = accent;
    ctx.font = `bold 13px ${FONT_STACK}`;
    ctx.fillText(label, x, cy + 2);
    cy += colHeaderH;

    if (goals.length === 0) {
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = `15px ${FONT_STACK}`;
      ctx.fillText('— no goals', x, cy + 1);
      return;
    }
    for (const g of goals) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(x + 3, cy + nameLineH / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.textPrimary;
      ctx.font = `bold 16px ${FONT_STACK}`;
      ctx.fillText(truncateToWidth(ctx, g.ownGoal ? `${g.scorer} (OG)` : g.scorer, colW - 15), x + 13, cy + nameLineH / 2);
      cy += nameLineH;
      if (g.assister) {
        ctx.fillStyle = COLORS.textTertiary;
        ctx.font = `14px ${FONT_STACK}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(truncateToWidth(ctx, `↳ ${g.assister}`, colW - 15), x + 13, cy + assistLineH / 2);
        cy += assistLineH;
      }
      cy += goalGap;
    }
  };

  drawColumn(leftX, 'COLOR', COLORS.gold, colorGoals);
  drawColumn(rightX, 'WHITE', COLORS.textSecondary, whiteGoals);
  y += sectionH;

  // Man of the Match
  if (data.manOfTheMatch && data.manOfTheMatch.length > 0) {
    y += gapBeforeMotm;
    ctx.fillStyle = COLORS.surfaceRaised;
    roundRect(ctx, padding, y, contentW, motmH, 12);
    ctx.fill();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 1.5;
    roundRect(ctx, padding, y, contentW, motmH, 12);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.gold;
    ctx.font = `bold 12px ${FONT_STACK}`;
    ctx.fillText('★ MAN OF THE MATCH', padding + 16, y + 14);

    const m = data.manOfTheMatch[0];
    const parts: string[] = [];
    if (m.goals > 0) parts.push(`${m.goals}G`);
    if (m.assists > 0) parts.push(`${m.assists}A`);
    const statText = parts.join(' · ');
    ctx.font = `bold 16px ${FONT_STACK}`;
    const statW = statText ? ctx.measureText(statText).width + 16 : 0;

    const names = data.manOfTheMatch.map(m => m.name).join(' · ');
    ctx.fillStyle = COLORS.textPrimary;
    ctx.font = `bold 23px ${FONT_STACK}`;
    ctx.fillText(truncateToWidth(ctx, names, contentW - 32 - statW), padding + 16, y + 35);

    if (statText) {
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.textSecondary;
      ctx.font = `bold 16px ${FONT_STACK}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(statText, padding + contentW - 16, y + motmH / 2 + 5);
    }
    y += motmH;
  }
  y += gapBeforeFooter;

  // Footer
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `13px ${FONT_STACK}`;
  ctx.fillText('awtyfootballclub.com', cx, y);

  return await canvasToPngBlob(canvas);
}
