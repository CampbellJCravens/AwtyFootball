import { useState, useEffect, useMemo } from 'react';
import { fetchFieldStats, FieldGameRecord as GameRecord } from '../api/stats';

const FIELD_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  yes:          { label: 'Awty',         color: 'text-emerald-400', bg: 'bg-emerald-400' },
  alt:          { label: 'Alternate',    color: 'text-blue-400',    bg: 'bg-blue-400'    },
  no:           { label: 'Cancelled',    color: 'text-red-400',     bg: 'bg-red-400'     },
  weather:      { label: 'Weather',      color: 'text-yellow-400',  bg: 'bg-yellow-400'  },
  'low numbers':{ label: 'Low Numbers',  color: 'text-orange-400',  bg: 'bg-orange-400'  },
  'school use': { label: 'School Use',   color: 'text-purple-400',  bg: 'bg-purple-400'  },
};


export default function FieldStatsTab() {
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');

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

  const availability = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of filtered) {
      const k = r.played.toLowerCase();
      counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }, [filtered]);

  const rateStats = useMemo(() => {
    const valid = filtered.filter(r => r.responseRate > 0 || r.attendanceRate > 0);
    if (!valid.length) return { avgResponse: 0, avgAttendance: 0, diff: 0 };
    const avgResponse = valid.reduce((s, r) => s + r.responseRate, 0) / valid.length;
    const avgAttendance = valid.reduce((s, r) => s + r.attendanceRate, 0) / valid.length;
    return { avgResponse, avgAttendance, diff: avgAttendance - avgResponse };
  }, [filtered]);

  if (loading) return <p className="text-text-tertiary text-center py-8 text-sm">Loading field stats…</p>;
  if (error)   return <p className="text-red-400 text-center py-8 text-sm">{error}</p>;
  if (!records.length) return <p className="text-text-tertiary text-center py-8 text-sm">No data found.</p>;

  const total     = filtered.length;
  const awtyCount = availability['yes'] || 0;
  const altCount  = availability['alt'] || 0;
  const cancelled = total - awtyCount - altCount;

  const cancelReasons = Object.entries(availability)
    .filter(([k]) => k !== 'yes' && k !== 'alt')
    .sort((a, b) => b[1] - a[1]);

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

      {/* Field availability cards */}
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

      {/* Cancellation breakdown */}
      {cancelled > 0 && (
        <div className="bg-surface rounded-lg p-3 border border-border mb-3">
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">Cancellation Breakdown</p>
          <div className="space-y-2">
            {cancelReasons.map(([key, count]) => {
              const info = FIELD_STATUS[key] || { label: key, color: 'text-text-secondary', bg: 'bg-text-secondary' };
              const pct = total ? count / total * 100 : 0;
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className={`text-[11px] font-medium w-24 shrink-0 ${info.color}`}>{info.label}</span>
                  <div className="flex-1 bg-surface-hover rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${info.bg} opacity-70`} style={{ width: `${Math.min(pct * 3, 100)}%` }} />
                  </div>
                  <span className="text-[11px] text-text-tertiary w-16 text-right shrink-0">
                    {count} ({pct.toFixed(0)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Avg response vs show-up */}
      <div className="bg-surface rounded-lg p-3 border border-border mb-3">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">Avg Response vs Show-Up</p>
        <div className="flex gap-6">
          <div>
            <p className="text-xl font-bold text-gold">{rateStats.avgResponse.toFixed(1)}%</p>
            <p className="text-[10px] text-text-tertiary">Evite Response</p>
          </div>
          <div>
            <p className="text-xl font-bold text-emerald-400">{rateStats.avgAttendance.toFixed(1)}%</p>
            <p className="text-[10px] text-text-tertiary">Show-Up Rate</p>
          </div>
          <div>
            <p className={`text-xl font-bold ${rateStats.diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {rateStats.diff >= 0 ? '+' : ''}{rateStats.diff.toFixed(1)}%
            </p>
            <p className="text-[10px] text-text-tertiary">Difference</p>
          </div>
        </div>
      </div>

      {/* Per-game table */}
      <p className="text-[10px] text-text-tertiary mb-2">{total} game weeks tracked</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-gold">
              <th className="py-1.5 px-1 text-left text-text-secondary font-semibold">Date</th>
              <th className="py-1.5 px-1 text-left text-text-secondary font-semibold">Field</th>
              <th className="py-1.5 px-1 text-right text-text-secondary font-semibold">Resp%</th>
              <th className="py-1.5 px-1 text-right text-text-secondary font-semibold">Show%</th>
              <th className="py-1.5 px-1 text-right text-text-secondary font-semibold">Diff</th>
            </tr>
          </thead>
          <tbody>
            {[...filtered].reverse().map((r, i) => {
              const diff = r.attendanceRate - r.responseRate;
              const key  = r.played.toLowerCase();
              const info = FIELD_STATUS[key] || { label: r.played, color: 'text-text-secondary', bg: '' };
              const hasRates = r.responseRate > 0 || r.attendanceRate > 0;
              return (
                <tr key={i} className="border-b border-border hover:bg-surface-hover even:bg-surface-hover/50">
                  <td className="py-1.5 px-1 text-text-secondary whitespace-nowrap">{r.year} {r.date}</td>
                  <td className={`py-1.5 px-1 font-medium ${info.color}`}>{info.label}</td>
                  <td className="py-1.5 px-1 text-text-secondary text-right">
                    {r.responseRate > 0 ? `${r.responseRate.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-1.5 px-1 text-text-secondary text-right">
                    {r.attendanceRate > 0 ? `${r.attendanceRate.toFixed(1)}%` : '—'}
                  </td>
                  <td className={`py-1.5 px-1 text-right font-medium ${
                    hasRates ? (diff >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-text-muted'
                  }`}>
                    {hasRates ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
