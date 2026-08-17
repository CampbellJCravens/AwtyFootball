import { PlayerPercentiles } from '../api/stats';

/**
 * Where this player sits against everyone with enough games.
 *
 * Own profile only (plus admins) — the server decides that and omits the block
 * entirely otherwise, so this component never receives another player's numbers.
 *
 * Design notes worth keeping:
 * - ONE accent for every bar, never red-for-low. Position already encodes
 *   magnitude; colouring someone's own stats red adds a value judgement the
 *   data does not support, on the one page they cannot avoid looking at.
 * - The value is printed, not hovered. This is a phone-first app and a tooltip
 *   you have to press for is a tooltip nobody reads.
 * - Cohort size is shown per bar. Sportsmanship is currently ranked against
 *   seven players, and a percentile out of seven should say so.
 * - The 50% tick is the cohort median by construction — on a percentile scale
 *   the median IS the 50th — so it is an honest reference line, not decoration.
 */

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function Bar({ percentile }: { percentile: number }) {
  return (
    <div className="relative h-2 rounded-full bg-surface-raised overflow-hidden" aria-hidden>
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-gold"
        style={{ width: `${Math.max(percentile, 2)}%` }}
      />
      {/* Cohort median. On a percentile scale this is exactly the 50th. */}
      <div className="absolute inset-y-0 w-px bg-text-tertiary/60" style={{ left: '50%' }} />
    </div>
  );
}

export default function PercentileBars({ data }: { data: PlayerPercentiles }) {
  if (!data) return null;

  if (!data.qualified) {
    const most = Math.max(0, ...data.metrics.map(m => m.games));
    return (
      <div className="border border-border rounded-xl bg-surface/40 p-3">
        <h3 className="text-sm font-bold text-text-primary">How you compare</h3>
        <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed">
          Unlocks at {data.minGames} games — enough for the numbers to mean something.
          {most > 0 && ` You're at ${most}.`}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl bg-surface/40 p-3">
      <h3 className="text-sm font-bold text-text-primary">How you compare</h3>
      <p className="text-[11px] text-text-tertiary mt-0.5">
        Against everyone with {data.minGames}+ games. The line is the club median.
      </p>

      <div className="mt-3 space-y-3">
        {data.metrics.map(m => (
          <div key={m.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-text-primary">{m.label}</span>
              {m.qualified ? (
                <span className="text-xs font-bold text-gold tabular-nums">{ordinal(m.percentile!)}</span>
              ) : (
                <span className="text-[10px] text-text-tertiary">
                  {m.games} of {data.minGames} games
                </span>
              )}
            </div>

            <div className="mt-1">
              {m.qualified
                ? <Bar percentile={m.percentile!} />
                : <div className="h-2 rounded-full bg-surface-raised" aria-hidden />}
            </div>

            <p className="text-[10px] text-text-tertiary mt-1">
              {m.qualified ? (
                <>
                  {fmt(m.value!)} {m.unit}
                  {m.cohortMedian !== null && <> · median {fmt(m.cohortMedian)}</>}
                  {' · vs '}{m.cohortSize} player{m.cohortSize === 1 ? '' : 's'}
                </>
              ) : (
                'Not enough games on record for this one yet.'
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
