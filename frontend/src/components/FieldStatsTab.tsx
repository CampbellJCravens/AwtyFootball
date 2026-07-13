import { useState, useEffect, useMemo } from 'react';
import { fetchFieldStats, FieldGameRecord as GameRecord } from '../api/stats';

const FIELD_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  yes:           { label: 'Awty',        color: 'text-emerald-400', bg: 'bg-emerald-400' },
  alt:           { label: 'Alternate',   color: 'text-blue-400',    bg: 'bg-blue-400'    },
  no:            { label: 'Cancelled',   color: 'text-red-400',     bg: 'bg-red-400'     },
  weather:       { label: 'Weather',     color: 'text-yellow-400',  bg: 'bg-yellow-400'  },
  'low numbers': { label: 'Low Numbers', color: 'text-orange-400',  bg: 'bg-orange-400'  },
  'school use':  { label: 'School Use',  color: 'text-purple-400',  bg: 'bg-purple-400'  },
};

const LOCATION_BADGE: Record<string, string> = {
  stadium: 'bg-green-900/40 text-green-300',
  grass:   'bg-yellow-900/40 text-yellow-300',
  turf:    'bg-yellow-900/40 text-yellow-300',
};

const ROW_TINT: Record<string, string> = {
  alt:           'bg-blue-400/10',
  no:            'bg-red-400/10',
  weather:       'bg-yellow-400/10',
  'low numbers': 'bg-orange-400/10',
  'school use':  'bg-purple-400/10',
};

// For pre-Oct 2025 records without a known location: yes→stadium, alt stays alt
function effectiveLocation(r: GameRecord): string | null {
  if (r.location) return r.location;
  if (r.isoDate < '2025-10-01' && r.played === 'yes') return 'stadium';
  return null;
}

export default function FieldStatsTab() {
  const [records, setRecords]         = useState<GameRecord[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    fetchFieldStats()
      .then(setRecords)
      .catch(() => setError('Could not load field statistics.'))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(
    () => [...new Set(records.map(r => r.year))].sort((a, b) => b - a),
    [records]
  );

  const filtered = useMemo(
    () => selectedYear === 'all' ? records : records.filter(r => r.year === selectedYear),
    [records, selectedYear]
  );

  // Exclude records with no played status (they were blank rows in the sheet)
  const validFiltered = useMemo(() => filtered.filter(r => r.played), [filtered]);

  const availability = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of validFiltered) {
      const k = r.played.toLowerCase();
      counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }, [validFiltered]);

  const rateStats = useMemo(() => {
    const valid = validFiltered.filter(r => r.responseRate > 0 || r.attendanceRate > 0);
    if (!valid.length) return { avgResponse: 0, avgAttendance: 0, diff: 0 };
    const avgResponse   = valid.reduce((s, r) => s + r.responseRate,   0) / valid.length;
    const avgAttendance = valid.reduce((s, r) => s + r.attendanceRate, 0) / valid.length;
    return { avgResponse, avgAttendance, diff: avgAttendance - avgResponse };
  }, [validFiltered]);

  const locationStats = useMemo(() => {
    const wa = validFiltered.filter(r => r.waIn !== null);
    if (!wa.length) return null;
    const avgIn    = wa.reduce((s, r) => s + (r.waIn    ?? 0), 0) / wa.length;
    const avgPlus1 = wa.reduce((s, r) => s + (r.waPlus1 ?? 0), 0) / wa.length;
    const avgMaybe = wa.reduce((s, r) => s + (r.waMaybe ?? 0), 0) / wa.length;
    const avgOut   = wa.reduce((s, r) => s + (r.waOut   ?? 0), 0) / wa.length;
    const stadiumGames = wa.filter(r => effectiveLocation(r) === 'stadium').length;
    const grassGames   = wa.filter(r => effectiveLocation(r) === 'grass').length;
    return { avgIn, avgPlus1, avgMaybe, avgOut, stadiumGames, grassGames };
  }, [validFiltered]);

  // Year-by-year breakdown (always uses all records, unaffected by year filter)
  const yearTableData = useMemo(() => {
    const byYear: Record<number, Record<string, number>> = {};
    for (const r of records) {
      if (!r.played) continue;
      const y = r.year;
      if (!byYear[y]) byYear[y] = {};
      const k = r.played.toLowerCase();
      byYear[y][k] = (byYear[y][k] || 0) + 1;
    }
    return Object.entries(byYear)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, c]) => ({
        year:       Number(year),
        total:      Object.values(c).reduce((a, b) => a + b, 0),
        awty:       c['yes']         || 0,
        alt:        c['alt']         || 0,
        cancelled:  c['no']          || 0,
        schoolUse:  c['school use']  || 0,
        weather:    c['weather']     || 0,
        lowNumbers: c['low numbers'] || 0,
      }));
  }, [records]);

  // Per-year avg response/attendance for the graph (all records)
  const graphData = useMemo(() => {
    const byYear: Record<number, { r: number[]; a: number[] }> = {};
    for (const r of records) {
      if (!r.played) continue;
      const y = r.year;
      if (!byYear[y]) byYear[y] = { r: [], a: [] };
      if (r.responseRate   > 0) byYear[y].r.push(r.responseRate);
      if (r.attendanceRate > 0) byYear[y].a.push(r.attendanceRate);
    }
    return Object.entries(byYear)
      .filter(([, d]) => d.r.length > 0 || d.a.length > 0)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, d]) => ({
        year:       Number(year),
        response:   d.r.length ? d.r.reduce((s, v) => s + v, 0) / d.r.length : 0,
        attendance: d.a.length ? d.a.reduce((s, v) => s + v, 0) / d.a.length : 0,
      }));
  }, [records]);

  if (loading) return <p className="text-text-tertiary text-center py-8 text-sm">Loading field stats…</p>;
  if (error)   return <p className="text-red-400 text-center py-8 text-sm">{error}</p>;
  if (!records.length) return <p className="text-text-tertiary text-center py-8 text-sm">No data found.</p>;

  const total     = validFiltered.length;
  const awtyCount = availability['yes'] || 0;
  const altCount  = availability['alt'] || 0;
  const cancelled = total - awtyCount - altCount;

  // All breakdown entries (including awty/alt), filtered to known statuses, sorted by count
  const breakdownEntries = Object.entries(availability)
    .filter(([k]) => k && FIELD_STATUS[k])
    .sort((a, b) => b[1] - a[1]);
  const breakdownTotal = breakdownEntries.reduce((s, [, c]) => s + c, 0);

  // SVG graph dimensions
  const GW = 320, GH = 130, PL = 34, PR = 8, PT = 10, PB = 28;
  const plotW = GW - PL - PR;
  const plotH = GH - PT - PB;
  const maxY  = 80;
  const n = graphData.length;
  const gpx = (i: number) => PL + (i / Math.max(n - 1, 1)) * plotW;
  const gpy = (v: number) => PT + plotH - Math.min(v / maxY, 1) * plotH;

  return (
    <div>
      {/* Year filter */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        <button
          onClick={() => setSelectedYear('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            selectedYear === 'all'
              ? 'bg-gold text-text-on-accent'
              : 'bg-surface border border-border text-text-secondary hover:bg-surface-hover'
          }`}
        >
          All Years
        </button>
        {years.map(y => (
          <button
            key={y}
            onClick={() => setSelectedYear(y)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedYear === y
                ? 'bg-gold text-text-on-accent'
                : 'bg-surface border border-border text-text-secondary hover:bg-surface-hover'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Awty',      count: awtyCount, color: 'text-emerald-400' },
          { label: 'Alternate', count: altCount,  color: 'text-blue-400'    },
          { label: 'Cancelled', count: cancelled, color: 'text-red-400'     },
        ].map(({ label, count, color }) => (
          <div key={label} className="bg-surface rounded-lg p-3 border border-border text-center">
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
            <p className="text-[10px] text-text-tertiary">{total ? Math.round(count / total * 100) : 0}%</p>
          </div>
        ))}
      </div>

      {/* Game Breakdown (collapsible) */}
      <div className="bg-surface rounded-lg border border-border mb-3">
        <button
          onClick={() => setShowBreakdown(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-left"
        >
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Game Breakdown</span>
          <span className="text-text-tertiary text-[10px]">{showBreakdown ? '▲' : '▼'}</span>
        </button>
        {showBreakdown && (
          <div className="px-3 pb-3 space-y-1.5">
            {breakdownEntries.map(([key, count]) => {
              const info = FIELD_STATUS[key];
              const pct  = breakdownTotal ? count / breakdownTotal * 100 : 0;
              const rowBg = ROW_TINT[key] ?? '';
              return (
                <div key={key} className={`flex items-center gap-2 rounded px-1 py-0.5 ${rowBg}`}>
                  <span className={`text-[11px] font-medium w-24 shrink-0 ${info.color}`}>{info.label}</span>
                  <div className="flex-1 bg-surface-hover rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${info.bg} opacity-80`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] text-text-tertiary w-16 text-right shrink-0">
                    {count} ({pct.toFixed(0)}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Response vs Show-Up: overall averages + by-year graph in one card */}
      {(rateStats.avgResponse > 0 || rateStats.avgAttendance > 0) && (
        <div className="bg-surface rounded-lg p-3 border border-border mb-3">
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">Response vs Show-Up</p>
          <div className="flex gap-6 flex-wrap mb-3">
            <div>
              <p className="text-xl font-bold text-gold">{rateStats.avgResponse.toFixed(1)}%</p>
              <p className="text-[10px] text-text-tertiary">Response</p>
            </div>
            <div>
              <p className="text-xl font-bold text-emerald-400">{rateStats.avgAttendance.toFixed(1)}%</p>
              <p className="text-[10px] text-text-tertiary">Show-Up Est.</p>
            </div>
            <div>
              <p className={`text-xl font-bold ${rateStats.diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {rateStats.diff >= 0 ? '+' : ''}{rateStats.diff.toFixed(1)}%
              </p>
              <p className="text-[10px] text-text-tertiary">Difference</p>
            </div>
          </div>
          {n > 1 && (<>
          <div className="flex gap-4 mb-1.5">
            <span className="text-[10px] text-gold flex items-center gap-1.5">
              <span className="inline-block w-5 h-px bg-gold" />Resp%
            </span>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1.5">
              <span className="inline-block w-5 h-px bg-emerald-400" />Show%
            </span>
          </div>
          <svg viewBox={`0 0 ${GW} ${GH}`} className="w-full" style={{ maxHeight: GH }}>
            {[0, 25, 50, 75].map(v => (
              <g key={v}>
                <line x1={PL} y1={gpy(v)} x2={GW - PR} y2={gpy(v)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
                <text x={PL - 4} y={gpy(v) + 3.5} textAnchor="end" fontSize="7" fill="rgba(255,255,255,0.35)">{v}%</text>
              </g>
            ))}
            <polyline
              points={graphData.map((d, i) => `${gpx(i)},${gpy(d.response)}`).join(' ')}
              fill="none" stroke="#d4af37" strokeWidth="1.5" strokeLinejoin="round"
            />
            <polyline
              points={graphData.map((d, i) => `${gpx(i)},${gpy(d.attendance)}`).join(' ')}
              fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinejoin="round"
            />
            {graphData.map((d, i) => (
              <g key={d.year}>
                <circle cx={gpx(i)} cy={gpy(d.response)}   r="2.5" fill="#d4af37" />
                <circle cx={gpx(i)} cy={gpy(d.attendance)} r="2.5" fill="#34d399" />
                <text x={gpx(i)} y={GH - 4} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.4)">{d.year}</text>
              </g>
            ))}
          </svg>
          </>)}
        </div>
      )}

      {/* Field usage by year table */}
      <div className="bg-surface rounded-lg border border-border mb-3 overflow-x-auto">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider px-3 pt-2.5 pb-1.5">Field Usage by Year</p>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border">
              {['Year','Total','Awty','Alt','Cancelled','School','Weather','Low'].map(h => (
                <th key={h} className="py-1 px-2 text-right first:text-left text-text-tertiary font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {yearTableData.map(row => (
              <tr key={row.year} className="border-b border-border/40 hover:bg-surface-hover">
                <td className="py-1 px-2 font-medium text-text-secondary">{row.year}</td>
                <td className="py-1 px-2 text-right text-text-secondary">{row.total}</td>
                <td className="py-1 px-2 text-right text-emerald-400 font-medium">{row.awty || '—'}</td>
                <td className="py-1 px-2 text-right text-blue-400">{row.alt        || '—'}</td>
                <td className="py-1 px-2 text-right text-red-400">{row.cancelled   || '—'}</td>
                <td className="py-1 px-2 text-right text-purple-400">{row.schoolUse || '—'}</td>
                <td className="py-1 px-2 text-right text-yellow-400">{row.weather   || '—'}</td>
                <td className="py-1 px-2 text-right text-orange-400">{row.lowNumbers || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* WhatsApp RSVP averages (only when WA data in filtered set) */}
      {locationStats && (
        <div className="bg-surface rounded-lg p-3 border border-border mb-3">
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">Avg WhatsApp RSVP Breakdown</p>
          <div className="flex gap-4 flex-wrap mb-2">
            {[
              { label: 'In',    value: locationStats.avgIn,    color: 'text-emerald-400' },
              { label: '+1',    value: locationStats.avgPlus1, color: 'text-blue-400'    },
              { label: 'Maybe', value: locationStats.avgMaybe, color: 'text-yellow-400'  },
              { label: 'Out',   value: locationStats.avgOut,   color: 'text-red-400'     },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className={`text-lg font-bold ${color}`}>{value.toFixed(1)}</p>
                <p className="text-[10px] text-text-tertiary">{label}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            {locationStats.stadiumGames > 0 && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${LOCATION_BADGE.stadium}`}>
                Stadium: {locationStats.stadiumGames}
              </span>
            )}
            {locationStats.grassGames > 0 && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${LOCATION_BADGE.grass}`}>
                Grass: {locationStats.grassGames}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Per-game table */}
      <p className="text-[10px] text-text-tertiary mb-2">{total} game weeks tracked · tap row for RSVP detail</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-gold">
              <th className="py-1.5 px-1 text-left text-text-secondary font-semibold">Date</th>
              <th className="py-1.5 px-1 text-left text-text-secondary font-semibold">Loc</th>
              <th className="py-1.5 px-1 text-left text-text-secondary font-semibold">Field</th>
              <th className="py-1.5 px-1 text-right text-text-secondary font-semibold">In</th>
              <th className="py-1.5 px-1 text-right text-text-secondary font-semibold">Resp%</th>
              <th className="py-1.5 px-1 text-right text-text-secondary font-semibold">Show%</th>
              <th className="py-1.5 px-1 text-right text-text-secondary font-semibold">Tracked</th>
            </tr>
          </thead>
          <tbody>
            {[...validFiltered].reverse().map((r) => {
              const key      = r.played.toLowerCase();
              const info     = FIELD_STATUS[key] || { label: r.played, color: 'text-text-secondary', bg: '' };
              const isPlayed = key === 'yes';
              const tint     = ROW_TINT[key] ?? '';
              const totalIn  = (r.waIn ?? 0) + (r.waPlus1 ?? 0) * 2 + (r.waPlus2 ?? 0) * 3;
              const isExpanded   = expandedRow === r.isoDate;
              const locDisplay   = effectiveLocation(r);
              return [
                <tr
                  key={r.isoDate}
                  onClick={() => setExpandedRow(isExpanded ? null : r.isoDate)}
                  className={`border-b border-border cursor-pointer ${
                    isPlayed ? 'hover:bg-surface-hover even:bg-surface-hover/50' : tint
                  }`}
                >
                  <td className="py-1.5 px-1 text-text-secondary whitespace-nowrap">{r.year} {r.date}</td>
                  <td className="py-1.5 px-1">
                    {locDisplay ? (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${LOCATION_BADGE[locDisplay] ?? 'bg-blue-900/40 text-blue-300'}`}>
                        {locDisplay}
                      </span>
                    ) : key === 'alt' ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-900/40 text-blue-300">alt</span>
                    ) : null}
                  </td>
                  <td className={`py-1.5 px-1 font-medium ${info.color}`}>{info.label}</td>
                  <td className="py-1.5 px-1 text-right font-medium text-emerald-400">
                    {isPlayed ? (r.waIn !== null ? totalIn : r.eviteResponse ?? null) : null}
                  </td>
                  <td className="py-1.5 px-1 text-text-secondary text-right">
                    {isPlayed && r.responseRate > 0 ? `${r.responseRate.toFixed(1)}%` : null}
                  </td>
                  <td className="py-1.5 px-1 text-text-secondary text-right">
                    {isPlayed && r.attendanceRate > 0 ? `${r.attendanceRate.toFixed(1)}%` : null}
                  </td>
                  <td className="py-1.5 px-1 text-right">
                    {isPlayed && r.trackedPlayers !== null
                      ? <span className="text-gold font-medium">{r.trackedPlayers}</span>
                      : null}
                  </td>
                </tr>,
                isExpanded && (
                  <tr key={`${r.isoDate}-detail`} className="bg-surface-hover/70">
                    <td colSpan={7} className="px-3 py-2">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                        {r.waIn !== null ? <>
                          <span className="text-emerald-400">In: {r.waIn}</span>
                          {(r.waPlus1 ?? 0) > 0 && (
                            <span className="text-blue-400">+1: {r.waPlus1} <span className="text-text-tertiary">({r.waPlus1! * 2} bodies)</span></span>
                          )}
                          {(r.waPlus2 ?? 0) > 0 && (
                            <span className="text-blue-400">+2: {r.waPlus2} <span className="text-text-tertiary">({r.waPlus2! * 3} bodies)</span></span>
                          )}
                          <span className="text-yellow-400">Maybe: {r.waMaybe}</span>
                          <span className="text-red-400">Out: {r.waOut}</span>
                          <span className="text-text-tertiary">Est. bodies: <span className="text-white font-medium">{totalIn}</span></span>
                        </> : <>
                          {r.eviteResponse !== null && <span className="text-emerald-400">Evite responses: {r.eviteResponse}</span>}
                          {r.showUp !== null && <span className="text-text-tertiary">Show up: <span className="text-white font-medium">{r.showUp}</span></span>}
                        </>}
                        {r.trackedPlayers !== null && (
                          <span className="text-text-tertiary">
                            Tracked in app: <span className="text-gold font-medium">{r.trackedPlayers}</span>
                            {r.turnoutVsRsvp !== null && (
                              <span className={`ml-1 ${r.turnoutVsRsvp >= 90 ? 'text-emerald-400' : r.turnoutVsRsvp >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                                ({r.turnoutVsRsvp}% of RSVP'd)
                              </span>
                            )}
                          </span>
                        )}
                        {r.groupSize !== null && (
                          <span className="text-text-tertiary">Group size: {r.groupSize}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
