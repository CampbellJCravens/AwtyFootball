import { useState, useEffect } from 'react';
import { fetchPlayerStats, PlayerStatsResponse } from '../api/stats';

interface PlayerProfileProps {
  playerId: string;
  onBack: () => void;
}

export default function PlayerProfile({ playerId, onBack }: PlayerProfileProps) {
  const [stats, setStats] = useState<PlayerStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchPlayerStats(playerId);
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load player stats');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [playerId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-text-tertiary">Loading player stats...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-error">{error || 'Failed to load'}</p>
        <button onClick={onBack} className="text-gold underline text-sm">Go back</button>
      </div>
    );
  }

  const { player, aggregate, ranks, matchHistory, bestPartnersByPPG, bestGroups, myAssistsTo, assistsToMe, form } = stats;

  const rankDisplay = (n: number) => {
    if (n === 1) return '🥇';
    if (n === 2) return '🥈';
    if (n === 3) return '🥉';
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  return (
    <div className="h-full overflow-y-auto max-w-lg mx-auto px-4 py-4 pb-8">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1 text-text-secondary hover:text-text-primary mb-4 transition-colors">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span className="text-sm font-medium">Back</span>
      </button>

      {/* Hero */}
      <div className="flex items-center gap-4 mb-6">
        {player.pictureUrl ? (
          <img src={player.pictureUrl} alt={player.name} className="w-20 h-20 rounded-full object-cover border-4 border-gold" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-3xl font-bold border-4 border-gold">
            {getInitial(player.name)}
          </div>
        )}
        <div>
          <h2 className="text-2xl font-bold text-text-primary">{player.name}</h2>
          {/* Form dots */}
          <div className="flex gap-1 mt-2">
            {form.map((result, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  result === 'W' ? 'bg-green-700' : result === 'L' ? 'bg-red-600' : 'bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Stat Grid */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {[
          { label: 'GAMES', value: aggregate.games, rank: ranks?.games },
          { label: 'PPG', value: aggregate.ppg.toFixed(2), highlight: true, rank: ranks?.ppg },
          { label: 'GOALS', value: aggregate.goals, rank: ranks?.goals },
          { label: 'WINS', value: aggregate.wins, rank: ranks?.wins },
          { label: 'LOSSES', value: aggregate.losses },
          { label: 'ASSISTS', value: aggregate.assists, rank: ranks?.assists },
        ].map(stat => (
          <div key={stat.label} className="bg-surface rounded-xl border border-border p-3 text-center">
            <p className="text-[10px] text-text-tertiary font-semibold tracking-wider">{stat.label}</p>
            <p className={`text-xl font-bold ${stat.highlight ? 'text-gold' : 'text-text-primary'}`}>
              {stat.value}
              {stat.rank && <span className={`ml-1 ${stat.rank <= 3 ? 'text-sm' : 'text-[10px] text-text-tertiary font-medium'}`}>{stat.rank <= 3 ? rankDisplay(stat.rank) : `(${rankDisplay(stat.rank)})`}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Best Partners by PPG */}
      {bestPartnersByPPG.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gold uppercase tracking-wider mb-3">Best Partners (PPG)</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {bestPartnersByPPG.map(partner => (
              <div key={partner.player.id} className="bg-surface rounded-xl border border-border p-3 min-w-[140px] flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  {partner.player.pictureUrl ? (
                    <img src={partner.player.pictureUrl} alt={partner.player.name} className="w-8 h-8 rounded-full object-cover border border-border-emphasis" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-xs font-semibold">
                      {partner.player.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">{partner.player.name}</p>
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-bold text-gold">{partner.ppg.toFixed(2)}</span>
                  <span className="text-[10px] text-text-tertiary">{partner.gamesPlayed} GP</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best Groups (trios/squads) */}
      {bestGroups.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gold uppercase tracking-wider mb-3">Best Groups (PPG)</h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {bestGroups.map((group, i) => (
              <div key={i} className="bg-surface rounded-xl border border-border p-3 flex items-center gap-3">
                {/* Overlapping avatars */}
                <div className="flex -space-x-2 flex-shrink-0">
                  {group.players.map((p, j) => (
                    p.pictureUrl ? (
                      <img
                        key={p.id}
                        src={p.pictureUrl}
                        alt={p.name}
                        className="w-8 h-8 rounded-full object-cover border-2 border-surface"
                        style={{ zIndex: group.players.length - j }}
                      />
                    ) : (
                      <div
                        key={p.id}
                        className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-xs font-semibold border-2 border-surface"
                        style={{ zIndex: group.players.length - j }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">
                    {group.players.map(p => p.name.split(' ')[0]).join(', ')}
                  </p>
                  <p className="text-[10px] text-text-tertiary">{group.gamesPlayed} GP · Group of {group.size}</p>
                </div>
                <span className="text-lg font-bold text-gold flex-shrink-0">{group.ppg.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Players I've Assisted */}
      {myAssistsTo.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gold uppercase tracking-wider mb-3">My Assists To</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {myAssistsTo.map(entry => (
              <div key={entry.player.id} className="bg-surface rounded-xl border border-border p-3 min-w-[130px] flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  {entry.player.pictureUrl ? (
                    <img src={entry.player.pictureUrl} alt={entry.player.name} className="w-8 h-8 rounded-full object-cover border border-border-emphasis" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-xs font-semibold">
                      {entry.player.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">{entry.player.name}</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-gold">{entry.count} <span className="text-[10px] text-text-tertiary font-normal">assists</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Players Who've Assisted Me */}
      {assistsToMe.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gold uppercase tracking-wider mb-3">Assisted By</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {assistsToMe.map(entry => (
              <div key={entry.player.id} className="bg-surface rounded-xl border border-border p-3 min-w-[130px] flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  {entry.player.pictureUrl ? (
                    <img src={entry.player.pictureUrl} alt={entry.player.name} className="w-8 h-8 rounded-full object-cover border border-border-emphasis" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-xs font-semibold">
                      {entry.player.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">{entry.player.name}</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-gold">{entry.count} <span className="text-[10px] text-text-tertiary font-normal">assists</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Match History */}
      <div>
        <h3 className="text-sm font-bold text-gold uppercase tracking-wider mb-3">Match History</h3>
        {matchHistory.length === 0 ? (
          <p className="text-text-tertiary text-sm">No games played yet.</p>
        ) : (
          <div className="space-y-2">
            {matchHistory.map((match, i) => {
              const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <div key={i} className="bg-surface rounded-xl border border-border p-3 flex items-center gap-3">
                  {/* Result badge */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    match.result === 'W' ? 'bg-green-700 text-white'
                    : match.result === 'L' ? 'bg-red-600 text-white'
                    : 'bg-gray-600 text-white'
                  }`}>
                    {match.result}
                  </div>

                  {/* Game info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">Game #{match.gameNumber ?? '?'}</p>
                    <p className="text-xs text-text-tertiary">{formatDate(match.date)} · {match.team === 'color' ? 'Color' : 'White'}</p>
                  </div>

                  {/* Stats + Score */}
                  <div className="text-right flex-shrink-0">
                    <div className="flex gap-1 justify-end mb-0.5">
                      {match.goalsScored > 0 && <span className="text-[10px] bg-surface-active text-text-primary px-1.5 py-0.5 rounded font-medium">{match.goalsScored}G</span>}
                      {match.assists > 0 && <span className="text-[10px] bg-surface-active text-text-primary px-1.5 py-0.5 rounded font-medium">{match.assists}A</span>}
                    </div>
                    <p className="text-sm font-bold text-text-primary">{match.colorScore} - {match.whiteScore}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
