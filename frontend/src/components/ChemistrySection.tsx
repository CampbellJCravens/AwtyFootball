import { useState, useEffect } from 'react';
import { fetchChemistry, ChemistryEntry } from '../api/stats';

export default function ChemistrySection() {
  const [activeType, setActiveType] = useState<'duos' | 'trios' | 'squads' | 'goalPartners'>('duos');
  const [results, setResults] = useState<ChemistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchChemistry(activeType);
        setResults(data.results);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chemistry data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeType]);

  const tabs = [
    { id: 'duos' as const, label: 'DUOS' },
    { id: 'trios' as const, label: 'TRIOS' },
    { id: 'squads' as const, label: 'SQUADS' },
    { id: 'goalPartners' as const, label: 'GOAL PART.' },
  ];

  const getInitial = (name: string) => name.charAt(0).toUpperCase();
  const isGoalPartners = activeType === 'goalPartners';

  return (
    <div>
      <h2 className="text-2xl font-bold text-text-primary italic mb-1">CHEMISTRY</h2>
      <p className="text-text-tertiary text-sm mb-4">Player combination analytics</p>

      {/* Type tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveType(tab.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              activeType === tab.id
                ? 'bg-accent text-text-on-accent'
                : 'bg-surface-raised text-text-secondary hover:bg-surface-active'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-text-tertiary">Loading...</p>
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-error text-sm">{error}</p>
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-text-tertiary text-sm">Not enough data yet. Need at least 3 games together.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((entry, i) => (
            <div key={i} className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3">
              {/* Rank */}
              <span className="text-gold font-bold text-lg w-6 text-center flex-shrink-0">{i + 1}</span>

              {/* Overlapping avatars */}
              <div className="flex -space-x-2 flex-shrink-0">
                {entry.players.slice(0, 4).map((player, j) => (
                  player.pictureUrl ? (
                    <img
                      key={player.id}
                      src={player.pictureUrl}
                      alt={player.name}
                      className="w-8 h-8 rounded-full object-cover border-2 border-surface"
                      style={{ zIndex: 4 - j }}
                    />
                  ) : (
                    <div
                      key={player.id}
                      className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-xs font-semibold border-2 border-surface"
                      style={{ zIndex: 4 - j }}
                    >
                      {getInitial(player.name)}
                    </div>
                  )
                ))}
                {entry.players.length > 4 && (
                  <div className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-text-tertiary text-xs font-semibold border-2 border-surface">
                    +{entry.players.length - 4}
                  </div>
                )}
              </div>

              {/* Names */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {entry.players.map(p => p.name.split(' ')[0]).join(' & ')}
                </p>
                <p className="text-[10px] text-text-tertiary">
                  {isGoalPartners
                    ? 'Goal contributions'
                    : `${entry.gamesPlayed} Games Played`
                  }
                </p>
              </div>

              {/* Key stat */}
              <div className="text-right flex-shrink-0">
                {isGoalPartners ? (
                  <span className="text-xl font-bold text-gold">{entry.totalContributions} <span className="text-xs text-text-tertiary">G+A</span></span>
                ) : (
                  <span className="text-xl font-bold text-gold">{entry.winRate}%</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
