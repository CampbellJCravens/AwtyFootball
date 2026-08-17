import { BalanceSummary, MatchQuality } from '../api/stats';

/**
 * How competitive a set of games was. Public by design, and safe to be public
 * precisely because every figure describes GAMES — no player is named, and none
 * can be inferred. See MATCH_ANALYTICS_PRD.md.
 */

const QUALITY_ORDER: MatchQuality[] = ['classic', 'close', 'competitive', 'oneSided'];

const QUALITY_META: Record<MatchQuality, { label: string; blurb: string; className: string }> = {
  classic: { label: 'Classic', blurb: 'tight, and the lead changed', className: 'text-emerald-400' },
  close: { label: 'Close', blurb: 'a one-goal game', className: 'text-gold' },
  competitive: { label: 'Competitive', blurb: 'two or three goals in it', className: 'text-text-primary' },
  oneSided: { label: 'One-sided', blurb: 'four or more', className: 'text-text-tertiary' },
};

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-text-primary tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-text-tertiary mt-0.5">{label}</div>
    </div>
  );
}

export default function BalanceSummaryCard({ balance, title = 'How the games went' }: {
  balance: BalanceSummary;
  title?: string;
}) {
  if (!balance || balance.games === 0) return null;

  const pct = (n: number) => Math.round((n / balance.games) * 100);
  const max = Math.max(...QUALITY_ORDER.map(q => balance.byQuality[q]), 1);

  return (
    <div className="border border-border rounded-xl bg-surface/40 p-3">
      <h3 className="text-sm font-bold text-text-primary">{title}</h3>
      <p className="text-[11px] text-text-tertiary mt-0.5">
        {balance.games} game{balance.games === 1 ? '' : 's'} · median margin {balance.medianMargin}
      </p>

      <div className="grid grid-cols-4 gap-2 mt-3">
        <Stat value={`${pct(balance.oneGoalGames + balance.ties)}%`} label="tight" />
        <Stat value={`${pct(balance.blowouts)}%`} label="one-sided" />
        <Stat value={balance.comebacks} label="comebacks" />
        <Stat value={balance.gamesWithLeadChange} label="lead swings" />
      </div>

      <div className="mt-3 space-y-1.5">
        {QUALITY_ORDER.map(q => {
          const n = balance.byQuality[q];
          const meta = QUALITY_META[q];
          return (
            <div key={q} className="flex items-center gap-2">
              <div className={`w-20 shrink-0 text-[11px] font-semibold ${meta.className}`}>{meta.label}</div>
              <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden">
                <div
                  className={`h-full rounded-full ${q === 'oneSided' ? 'bg-text-tertiary/40' : 'bg-gold/70'}`}
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </div>
              <div className="w-6 shrink-0 text-right text-[11px] tabular-nums text-text-secondary">{n}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
