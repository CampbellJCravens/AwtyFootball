import { useState } from 'react';
import { BalanceSummary, BalanceGame, StandoutGame, MatchQuality } from '../api/stats';

/**
 * How competitive a set of games was. Public by design, and safe to be public
 * precisely because every figure describes GAMES — no player is named, and none
 * can be inferred.
 *
 * THE FORM FOLLOWS N. A month holds about three games, and a four-bucket
 * distribution over three games leaves half its bars empty and says nothing —
 * which is exactly how it looked in the first version. Below the threshold the
 * card lists the games themselves; only once there are enough to have a shape
 * does it draw the distribution.
 */

const QUALITY_ORDER: MatchQuality[] = ['classic', 'close', 'competitive', 'oneSided'];

const QUALITY_LABEL: Record<MatchQuality, string> = {
  classic: 'Classic',
  close: 'Close',
  competitive: 'Competitive',
  oneSided: 'One-sided',
};

/** Below this a distribution is noise; show the games instead. */
const DISTRIBUTION_MIN_GAMES = 8;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-text-primary tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-text-tertiary mt-0.5">{label}</div>
    </div>
  );
}

export default function BalanceSummaryCard({
  balance,
  games = [],
  pick = null,
  pickLabel = 'Game of the Month',
  title = 'How the games went',
  defaultOpen = false,
}: {
  balance: BalanceSummary;
  games?: BalanceGame[];
  /** The standout game, highlighted in place rather than repeated above. */
  pick?: StandoutGame | null;
  pickLabel?: string;
  title?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!balance || balance.games === 0) return null;

  // gameNumber is nullable on older games, so fall back to the date rather than
  // matching null to null and highlighting the wrong row.
  const isPick = (g: BalanceGame) =>
    !!pick && (g.gameNumber !== null && pick.gameNumber !== null
      ? g.gameNumber === pick.gameNumber
      : g.date === pick.date);

  const pct = (n: number) => Math.round((n / balance.games) * 100);
  const showDistribution = balance.games >= DISTRIBUTION_MIN_GAMES;
  const max = Math.max(...QUALITY_ORDER.map(q => balance.byQuality[q]), 1);

  return (
    <div className="border border-border rounded-xl bg-surface/40 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-text-primary">{title}</h3>
          <p className="text-[11px] text-text-tertiary mt-0.5">
            {balance.games} game{balance.games === 1 ? '' : 's'} · median margin {balance.medianMargin}
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-4 gap-2 pt-1">
            <Stat value={`${pct(balance.oneGoalGames + balance.ties)}%`} label="tight" />
            <Stat value={`${pct(balance.blowouts)}%`} label="one-sided" />
            <Stat value={balance.comebacks} label="comebacks" />
            <Stat value={balance.gamesWithLeadChange} label="lead swings" />
          </div>

          {showDistribution ? (
            <div className="mt-3 space-y-1.5">
              {QUALITY_ORDER.map(q => {
                const n = balance.byQuality[q];
                return (
                  <div key={q} className="flex items-center gap-2">
                    <div className="w-20 shrink-0 text-[11px] font-semibold text-text-secondary">{QUALITY_LABEL[q]}</div>
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
          ) : games.length > 0 ? (
            <div className="mt-3">
              {/* Three zones — identity, award, verdict — so every row lines up on
                  the same columns whether or not it carries the award. */}
              {games.map(g => {
                const picked = isPick(g);
                return (
                  <div
                    key={`${g.gameNumber ?? g.date}`}
                    className={`flex items-center gap-2 py-1.5 ${
                      picked
                        ? 'border-l-[3px] border-gold bg-gold-subtle -ml-3 pl-2.5'
                        : 'border-t border-border/60'
                    }`}
                  >
                    <div className="shrink-0">
                      <span className={`text-xs font-semibold ${picked ? 'text-gold' : 'text-text-primary'}`}>
                        {g.gameNumber ? `Game ${g.gameNumber}` : fmtDate(g.date)}
                      </span>
                      <span className="text-[11px] text-text-tertiary whitespace-nowrap"> · {fmtDate(g.date)}</span>
                    </div>

                    <div className="flex-1 flex justify-center min-w-0">
                      {picked && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-text-on-accent bg-gold px-1.5 py-0.5 rounded whitespace-nowrap">
                          {pickLabel}
                        </span>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`text-[11px] whitespace-nowrap ${picked ? 'text-gold' : 'text-text-tertiary'}`}>
                        {g.qualityLabel}
                        {g.comeback ? ' · comeback' : ''}
                      </span>
                      <span className="text-xs font-bold text-text-primary tabular-nums">
                        {g.colorScore}&ndash;{g.whiteScore}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
