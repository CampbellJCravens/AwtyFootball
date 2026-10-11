import { useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '../api/players';
import { Game } from '../api/games';
import { SortColumn, MIN_QUALIFIED_GAMES, computePlayerStats, compareStats } from '../utils/playerStats';

// Bump chart of the top 10 after every game in the selected period
// (docs/RANK_RACE_PRD.md). Ranks come from the same calculation and
// tiebreakers as the Players table, so the last column always matches it.

const TOP = 10;
const METRICS: { id: SortColumn; label: string }[] = [
  { id: 'points', label: 'Points' },
  { id: 'goalInvolvements', label: 'G+A' },
  { id: 'goals', label: 'Goals' },
  { id: 'assists', label: 'Assists' },
  { id: 'wins', label: 'Wins' },
];
// Ten distinct colours for the current top 10 (gold is reserved for the signed-in
// player); anyone who has dropped out is drawn in grey so colours never repeat.
const PALETTE = ['#60a5fa', '#f87171', '#34d399', '#a78bfa', '#fb923c', '#22d3ee', '#f472b6', '#a3e635', '#e879f9', '#fde047'];
const GOLD = '#d4af37';
const OUT = '#6b7280';

const ROW = 24, TOP_PAD = 12, BOTTOM_PAD = 26, AXIS_W = 30, LEFT = 10, NAME_W = 92, MIN_STEP = 26;

interface Props {
  players: Player[];
  games: Game[];
  currentPlayerId?: string | null;
}

export default function RankRaceChart({ players, games, currentPlayerId }: Props) {
  const [metric, setMetric] = useState<SortColumn>('points');
  const [open, setOpen] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(340);

  // Ranks after each game: rank[step][playerId] = 1..10
  const race = useMemo(() => {
    const tracked = games
      .filter(g => g.teamAssignments && g.goals)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const steps: { date: string; ranks: Map<string, number> }[] = [];
    for (let k = 1; k <= tracked.length; k++) {
      const top = computePlayerStats(players, tracked.slice(0, k))
        .filter(s => s.gamesPlayed >= MIN_QUALIFIED_GAMES)
        .sort((a, b) => compareStats(a, b, metric))
        .slice(0, TOP);
      if (!top.length) continue; // nobody qualified yet
      steps.push({ date: tracked[k - 1].createdAt, ranks: new Map(top.map((s, i) => [s.player.id, i + 1])) });
    }
    const ids: string[] = [];
    steps.forEach(s => s.ranks.forEach((_, id) => { if (!ids.includes(id)) ids.push(id); }));
    const last = steps[steps.length - 1]?.ranks ?? new Map<string, number>();
    // Final top 10 first (by final rank), then everyone who dropped out.
    ids.sort((a, b) => (last.get(a) ?? 99) - (last.get(b) ?? 99));
    const name = new Map(players.map(p => [p.id, p.name]));
    let n = 0;
    const colour = new Map(ids.map(id => [id, id === currentPlayerId ? GOLD : last.has(id) ? PALETTE[n++ % PALETTE.length] : OUT]));
    return { steps, ids, last, name, colour };
  }, [players, games, metric, currentPlayerId]);

  const { steps, ids, last, name, colour } = race;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    // Open on the latest games, where the names (current standings) are.
    requestAnimationFrame(() => { el.scrollLeft = el.scrollWidth; });
    return () => ro.disconnect();
  }, [open, steps.length]);

  const plotW = Math.max(boxW - LEFT - NAME_W, steps.length * MIN_STEP);  // boxW excludes the pinned axis
  const stepW = steps.length > 1 ? plotW / (steps.length - 1) : plotW;
  const x = (i: number) => LEFT + (steps.length > 1 ? i * stepW : plotW / 2);
  const y = (r: number) => TOP_PAD + (r - 1) * ROW + ROW / 2;
  const H = TOP_PAD + TOP * ROW + BOTTOM_PAD;
  const W = LEFT + plotW + NAME_W;
  const labelEvery = Math.max(1, Math.ceil(44 / stepW));
  const fmt = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const dim = (id: string) => (focus && focus !== id ? 0.12 : 1);
  const toggle = (id: string) => setFocus(f => (f === id ? null : id));

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
        <span>
          <span className="text-sm font-semibold text-text-primary">Rank race</span>
          <span className="ml-2 text-[11px] text-text-tertiary">Top {TOP} after each game · {MIN_QUALIFIED_GAMES}+ games to qualify</span>
        </span>
        <span className="text-text-tertiary text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {METRICS.map(m => (
              <button
                key={m.id}
                onClick={() => setMetric(m.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  metric === m.id ? 'bg-gold text-text-on-accent' : 'border border-border bg-base text-text-secondary hover:bg-surface-hover'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {steps.length < 2 ? (
            <p className="py-6 text-center text-xs text-text-tertiary">
              Not enough games yet — a race needs at least {MIN_QUALIFIED_GAMES + 1} tracked games in this period.
            </p>
          ) : (
            <div className="flex">
            {/* Rank labels stay put while the race scrolls sideways. */}
            <svg width={AXIS_W} height={H} className="shrink-0" aria-hidden="true">
              {Array.from({ length: TOP }, (_, i) => (
                <text key={i} x={AXIS_W - 4} y={y(i + 1) + 3.5} textAnchor="end" fontSize={10} fill="currentColor" className="text-text-tertiary">#{i + 1}</text>
              ))}
            </svg>
            <div ref={boxRef} className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin]">
              <svg width={W} height={H} role="img" aria-label="Rank of the top 10 players after each game">
                {Array.from({ length: TOP }, (_, i) => (
                  <line key={i} x1={LEFT} x2={LEFT + plotW} y1={y(i + 1)} y2={y(i + 1)} stroke="currentColor" className="text-border" strokeWidth={0.5} />
                ))}
                {steps.map((s, i) => (i % labelEvery === 0 || i === steps.length - 1) && (
                  <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={9} fill="currentColor" className="text-text-tertiary">{fmt(s.date)}</text>
                ))}
                {ids.map(id => {
                  const c = colour.get(id)!;
                  const segs: string[] = [];
                  for (let i = 1; i < steps.length; i++) {
                    const a = steps[i - 1].ranks.get(id), b = steps[i].ranks.get(id);
                    if (a && b) segs.push(`M${x(i - 1)},${y(a)}L${x(i)},${y(b)}`);
                  }
                  const wide = id === currentPlayerId || focus === id;
                  const out = !last.has(id) && focus !== id;
                  return (
                    <g key={id} opacity={dim(id)} onClick={() => toggle(id)} style={{ cursor: 'pointer' }}>
                      <path d={segs.join('')} stroke={c} strokeWidth={wide ? 3 : out ? 1.25 : 2} strokeOpacity={out ? 0.7 : 1} fill="none" strokeLinecap="round" />
                      {steps.map((s, i) => {
                        const r = s.ranks.get(id);
                        return r ? <circle key={i} cx={x(i)} cy={y(r)} r={wide ? 3.5 : out ? 1.75 : 2.5} fill={c} /> : null;
                      })}
                      {last.has(id) && (
                        <text x={x(steps.length - 1) + 7} y={y(last.get(id)!) + 3.5} fontSize={10.5} fontWeight={wide ? 700 : 500} fill={c}>
                          {(name.get(id) ?? '').split(' ')[0].slice(0, 12)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
            </div>
          )}
          {steps.length >= 2 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {ids.map(id => (
                <button key={id} onClick={() => toggle(id)} className="flex items-center gap-1 text-[11px]" style={{ opacity: dim(id) === 1 ? 1 : 0.4 }}>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: colour.get(id) }} />
                  <span className={last.has(id) ? 'text-text-secondary' : 'text-text-tertiary'}>
                    {name.get(id)}{last.has(id) ? ` #${last.get(id)}` : ' · out'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
