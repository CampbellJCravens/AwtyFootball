import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { fetchPlayerStats, PlayerStatsResponse, fetchPlayerAwards, PlayerAward, fetchPlayerAchievements, Achievement } from '../api/stats';
import { updatePlayer } from '../api/players';
import GroupDetailModal from './GroupDetailModal';
import ImageLightbox from './ImageLightbox';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface PlayerProfileProps {
  playerId: string;
  isOwnProfile?: boolean;
  onBack?: () => void;
  onPlayerClick?: (playerId: string) => void;
}

export default function PlayerProfile({ playerId, isOwnProfile, onBack, onPlayerClick }: PlayerProfileProps) {
  const [stats, setStats] = useState<PlayerStatsResponse | null>(null);
  const [awards, setAwards] = useState<PlayerAward[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [showAchievements, setShowAchievements] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [expandedAward, setExpandedAward] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<{ players: { id: string; name: string; pictureUrl: string | null }[]; stats: { label: string; value: string }[] } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        setShowAllGroups(false);
        setShowAllMatches(false);
        setExpandedAward(null);
        setShowAchievements(false);
        const [data, playerAwards, playerAchievements] = await Promise.all([
          fetchPlayerStats(playerId),
          fetchPlayerAwards(playerId),
          fetchPlayerAchievements(playerId),
        ]);
        setStats(data);
        setAwards(playerAwards);
        setAchievements(playerAchievements);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load player stats');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [playerId]);

  const handlePictureChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !stats) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    try {
      await updatePlayer(playerId, { pictureUrl: dataUrl });
      setStats({ ...stats, player: { ...stats.player, pictureUrl: dataUrl } });
    } catch {
      // silently fail
    }
    e.target.value = '';
  };

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

  const ClickableName = ({ id, name, className = '' }: { id: string; name: string; className?: string }) => (
    onPlayerClick ? (
      <span className={`cursor-pointer hover:underline ${className}`} onClick={(e) => { e.stopPropagation(); onPlayerClick(id); }}>{name}</span>
    ) : (
      <span className={className}>{name}</span>
    )
  );

  if (showAchievements) {
    const completed = achievements.filter(a => a.current >= a.target).length;
    const total = achievements.length;
    return (
      <div className="h-full overflow-y-auto max-w-lg mx-auto px-4 py-4 pb-8">
        <button onClick={() => setShowAchievements(false)} className="flex items-center gap-1 text-text-secondary hover:text-text-primary mb-4 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">Back to Profile</span>
        </button>

        <h2 className="text-2xl font-bold text-gold italic mb-1">ACHIEVEMENTS</h2>
        <p className="text-text-tertiary text-sm mb-4">{completed} of {total} unlocked</p>

        <div className="space-y-2">
          {achievements.map(a => {
            const done = a.current >= a.target;
            const pct = Math.round((a.current / a.target) * 100);
            return (
              <div key={a.id} className={`rounded-xl border p-4 ${done ? 'bg-surface border-gold/40' : 'bg-surface border-border opacity-70'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-lg ${done ? 'bg-gold/20' : 'bg-surface-active'}`}>
                    {done ? '✅' : '🔒'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className={`text-sm font-semibold ${done ? 'text-text-primary' : 'text-text-secondary'}`}>{a.name}</p>
                      <p className="text-xs text-text-tertiary">{a.current}/{a.target}</p>
                    </div>
                    <p className="text-xs text-text-tertiary mb-2">{a.description}</p>
                    <div className="w-full h-1.5 bg-surface-active rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${done ? 'bg-gold' : 'bg-text-tertiary'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto max-w-lg mx-auto px-4 py-4 pb-8">
      {/* Back button */}
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-text-secondary hover:text-text-primary mb-4 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">Back</span>
        </button>
      )}

      {/* Hero */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-shrink-0">
          {player.pictureUrl ? (
            <img src={player.pictureUrl} alt={player.name} className="w-20 h-20 rounded-full object-cover border-4 border-gold cursor-pointer" onClick={() => setLightboxImage(player.pictureUrl)} />
          ) : (
            <div className="w-20 h-20 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-3xl font-bold border-4 border-gold">
              {getInitial(player.name)}
            </div>
          )}
          {isOwnProfile && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-gold flex items-center justify-center shadow-lg hover:bg-gold/80 transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePictureChange}
              />
            </>
          )}
        </div>
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
          { label: 'POINTS', value: (aggregate.wins * 3) + (aggregate.ties * 1), rank: ranks?.points },
          { label: 'PPG', value: aggregate.ppg.toFixed(2), rank: ranks?.ppg },
          { label: 'G+A', value: aggregate.goals + aggregate.assists, rank: ranks?.goalInvolvements },
          { label: 'GOALS', value: aggregate.goals, rank: ranks?.goals },
          { label: 'ASSISTS', value: aggregate.assists, rank: ranks?.assists },
        ].map(stat => (
          <div key={stat.label} className="bg-surface rounded-xl border border-border p-3 text-center">
            <p className="text-[10px] text-text-tertiary font-semibold tracking-wider">{stat.label}</p>
            <p className="text-xl font-bold text-text-primary">
              {stat.value}
              {stat.rank && <span className={`ml-1 ${stat.rank <= 3 ? 'text-sm' : 'text-[10px] text-text-tertiary font-medium'}`}>{stat.rank <= 3 ? rankDisplay(stat.rank) : `(${rankDisplay(stat.rank)})`}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Achievements */}
      {achievements.length > 0 && (() => {
        const completed = achievements.filter(a => a.current >= a.target).length;
        const total = achievements.length;
        const pct = Math.round((completed / total) * 100);
        return (
          <button
            onClick={() => setShowAchievements(true)}
            className="w-full mb-6 bg-surface rounded-xl border border-border p-4 flex items-center gap-4 hover:bg-surface-hover transition-colors text-left"
          >
            <div className="text-2xl flex-shrink-0">🎮</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-semibold text-text-primary">Achievements</p>
                <p className="text-xs text-text-tertiary">{completed}/{total}</p>
              </div>
              <div className="w-full h-2 bg-surface-active rounded-full overflow-hidden">
                <div
                  className="h-full bg-gold rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <svg className="w-4 h-4 text-text-tertiary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        );
      })()}

      {/* Awards */}
      {awards.length > 0 && (() => {
        const awardEmojis: Record<string, string> = {
          'Player of the Month': '👑',
          'Top Goal Contributor': '🎯',
          'Top Scorer': '⚽',
          'Top Assister': '🤝',
        };
        const grouped = awards.reduce<Record<string, typeof awards>>((acc, a) => {
          if (!acc[a.award]) acc[a.award] = [];
          acc[a.award].push(a);
          return acc;
        }, {});
        return (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gold uppercase tracking-wider mb-3">Awards</h3>
            <div className="space-y-2">
              {Object.entries(grouped).map(([name, items]) => {
                const isExpanded = expandedAward === name;
                return (
                  <div key={name}>
                    <button
                      onClick={() => setExpandedAward(isExpanded ? null : name)}
                      className="w-full bg-surface rounded-xl border border-border p-3 flex items-center gap-3 hover:bg-surface-hover transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-base">{awardEmojis[name] || '🏆'}</span>
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium text-text-primary">
                          {name}{items.length > 1 && <span className="text-gold ml-1">x{items.length}</span>}
                        </p>
                      </div>
                      <svg className={`w-4 h-4 text-text-tertiary transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isExpanded && (
                      <div className="ml-6 mt-1 space-y-1">
                        {items.map((a, i) => (
                          <div key={i} className="bg-surface-hover/50 rounded-lg px-3 py-2 flex items-center justify-between">
                            <span className="text-xs text-text-secondary">{MONTH_NAMES[a.month]} {a.year}</span>
                            <span className="text-xs font-medium text-text-primary">{a.value} {a.unit}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Best Partners by PPG */}
      {bestPartnersByPPG.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gold uppercase tracking-wider mb-3">Best Partners (PPG)</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {bestPartnersByPPG.map(partner => (
              <div
                key={partner.player.id}
                className="bg-surface rounded-xl border border-border p-3 min-w-[140px] flex-shrink-0 cursor-pointer hover:bg-surface-hover transition-colors"
                onClick={() => setSelectedGroup({
                  players: [{ id: player.id, name: player.name, pictureUrl: player.pictureUrl }, partner.player],
                  stats: [{ label: 'PPG', value: partner.ppg.toFixed(2) }, { label: 'Games', value: String(partner.gamesPlayed) }],
                })}
              >
                <div className="flex items-center gap-2 mb-2">
                  {partner.player.pictureUrl ? (
                    <img src={partner.player.pictureUrl} alt={partner.player.name} className="w-8 h-8 rounded-full object-cover border border-border-emphasis" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-xs font-semibold">
                      {partner.player.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate"><ClickableName id={partner.player.id} name={partner.player.name} /></p>
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
          <div className="space-y-2">
            {(showAllGroups ? bestGroups : bestGroups.slice(0, 5)).map((group, i) => (
              <div
                key={i}
                className="bg-surface rounded-xl border border-border p-3 flex items-center gap-3 cursor-pointer hover:bg-surface-hover transition-colors"
                onClick={() => setSelectedGroup({
                  players: group.players,
                  stats: [{ label: 'PPG', value: group.ppg.toFixed(2) }, { label: 'Games', value: String(group.gamesPlayed) }, { label: 'Size', value: String(group.size) }],
                })}
              >
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
                    {group.players.map((p, j) => (
                      <span key={p.id}>{j > 0 && ', '}<ClickableName id={p.id} name={p.name.split(' ')[0]} /></span>
                    ))}
                  </p>
                  <p className="text-[10px] text-text-tertiary">{group.gamesPlayed} GP · Group of {group.size}</p>
                </div>
                <span className="text-lg font-bold text-gold flex-shrink-0">{group.ppg.toFixed(2)}</span>
              </div>
            ))}
          </div>
          {bestGroups.length > 5 && (
            <button
              onClick={() => setShowAllGroups(!showAllGroups)}
              className="w-full mt-2 text-sm text-gold font-medium hover:text-gold/80 transition-colors py-2"
            >
              {showAllGroups ? 'Show Less' : `Show All (${bestGroups.length})`}
            </button>
          )}
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
                    <p className="text-xs font-medium text-text-primary truncate"><ClickableName id={entry.player.id} name={entry.player.name} /></p>
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
                    <p className="text-xs font-medium text-text-primary truncate"><ClickableName id={entry.player.id} name={entry.player.name} /></p>
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
          <>
            <div className="space-y-2">
              {(showAllMatches ? matchHistory : matchHistory.slice(0, 5)).map((match, i) => {
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
            {matchHistory.length > 5 && (
              <button
                onClick={() => setShowAllMatches(!showAllMatches)}
                className="w-full mt-2 text-sm text-gold font-medium hover:text-gold/80 transition-colors py-2"
              >
                {showAllMatches ? 'Show Less' : `Show All (${matchHistory.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {selectedGroup && (
        <GroupDetailModal
          players={selectedGroup.players}
          stats={selectedGroup.stats}
          onPlayerClick={onPlayerClick}
          onClose={() => setSelectedGroup(null)}
        />
      )}

      {lightboxImage && (
        <ImageLightbox src={lightboxImage} alt={player.name} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  );
}
