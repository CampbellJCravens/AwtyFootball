import { useState, useEffect, useMemo } from 'react';
import { fetchChemistry, ChemistryEntry } from '../api/stats';
import GroupDetailModal from './GroupDetailModal';

type ChemistryType = 'duos' | 'trios' | 'squads' | 'goalPartners';

interface ChemistrySectionProps {
  defaultType?: ChemistryType;
  showTypes?: ChemistryType[];
  onPlayerClick?: (playerId: string) => void;
}

const ALL_TABS: { id: ChemistryType; label: string }[] = [
  { id: 'duos', label: 'DUOS' },
  { id: 'trios', label: 'TRIOS' },
  { id: 'squads', label: 'SQUADS' },
  { id: 'goalPartners', label: 'GOALS' },
];

export default function ChemistrySection({ defaultType = 'duos', showTypes, onPlayerClick }: ChemistrySectionProps) {
  const tabs = showTypes ? ALL_TABS.filter(t => showTypes.includes(t.id)) : ALL_TABS;
  const [activeType, setActiveType] = useState<ChemistryType>(defaultType);
  const [results, setResults] = useState<ChemistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ChemistryEntry | null>(null);
  const [perGame, setPerGame] = useState(false);

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

  const sortedResults = useMemo(() => {
    if (activeType === 'goalPartners') return results;
    return [...results].sort((a, b) => {
      if (perGame) return (b.ppg ?? 0) - (a.ppg ?? 0) || (b.gamesPlayed ?? 0) - (a.gamesPlayed ?? 0);
      return (b.totalPoints ?? 0) - (a.totalPoints ?? 0) || (b.gamesPlayed ?? 0) - (a.gamesPlayed ?? 0);
    });
  }, [results, perGame, activeType]);

  const getInitial = (name: string) => name.charAt(0).toUpperCase();
  const isGoalPartners = activeType === 'goalPartners';

  return (
    <div>
      {/* Type tabs */}
      {tabs.length > 1 && (
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
      )}

      {/* Totals / Per Game toggle (not shown for goal partners) */}
      {!isGoalPartners && (
        <div className="flex justify-end mb-3">
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-[11px]">
            <button
              className={`px-3 py-1 font-semibold transition-colors ${!perGame ? 'bg-gold text-text-on-accent' : 'bg-surface text-text-secondary hover:bg-surface-hover'}`}
              onClick={() => setPerGame(false)}
            >
              Totals
            </button>
            <button
              className={`px-3 py-1 font-semibold transition-colors ${perGame ? 'bg-gold text-text-on-accent' : 'bg-surface text-text-secondary hover:bg-surface-hover'}`}
              onClick={() => setPerGame(true)}
            >
              Per Game
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-text-tertiary">Loading...</p>
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-error text-sm">{error}</p>
        </div>
      ) : sortedResults.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-text-tertiary text-sm">Not enough data yet. Need at least 3 games together.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedResults.map((entry, i) => (
            <div key={i} className="bg-surface rounded-xl border border-border p-3 flex items-center gap-3 cursor-pointer hover:bg-surface-hover transition-colors" onClick={() => setSelectedEntry(entry)}>
              {/* Rank */}
              <span className="text-gold font-bold text-sm w-5 text-center flex-shrink-0">{i + 1}</span>

              {/* Overlapping avatars */}
              <div className="flex -space-x-2 flex-shrink-0">
                {entry.players.slice(0, 4).map((player, j) => (
                  player.pictureUrl ? (
                    <img
                      key={player.id}
                      src={player.pictureUrl}
                      alt={player.name}
                      className="w-7 h-7 rounded-full object-cover border-2 border-surface"
                      style={{ zIndex: 4 - j }}
                    />
                  ) : (
                    <div
                      key={player.id}
                      className="w-7 h-7 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-[10px] font-semibold border-2 border-surface"
                      style={{ zIndex: 4 - j }}
                    >
                      {getInitial(player.name)}
                    </div>
                  )
                ))}
                {entry.players.length > 4 && (
                  <div className="w-7 h-7 rounded-full bg-surface-active flex items-center justify-center text-text-tertiary text-[10px] font-semibold border-2 border-surface">
                    +{entry.players.length - 4}
                  </div>
                )}
              </div>

              {/* Names */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary truncate">
                  {entry.players.map((p, j) => (
                    <span key={p.id}>
                      {j > 0 && ' & '}
                      {onPlayerClick ? (
                        <span className="cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); onPlayerClick(p.id); }}>
                          {p.name.split(' ')[0]}
                        </span>
                      ) : (
                        p.name.split(' ')[0]
                      )}
                    </span>
                  ))}
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
                  <span className="text-lg font-bold text-gold">{entry.totalContributions} <span className="text-[10px] text-text-tertiary">G+A</span></span>
                ) : perGame ? (
                  <span className="text-lg font-bold text-gold">{entry.ppg?.toFixed(2)} <span className="text-[10px] text-text-tertiary">PPG</span></span>
                ) : (
                  <span className="text-lg font-bold text-gold">{entry.totalPoints ?? 0} <span className="text-[10px] text-text-tertiary">Pts</span></span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {selectedEntry && (
        <GroupDetailModal
          players={selectedEntry.players}
          stats={
            selectedEntry.totalContributions != null
              ? [
                  { label: 'Goal Contributions', value: String(selectedEntry.totalContributions) },
                ]
              : [
                  { label: 'Points', value: String(selectedEntry.totalPoints ?? 0) },
                  { label: 'PPG', value: selectedEntry.ppg?.toFixed(2) || '0' },
                  { label: 'Games', value: String(selectedEntry.gamesPlayed || 0) },
                ]
          }
          onPlayerClick={onPlayerClick}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}
