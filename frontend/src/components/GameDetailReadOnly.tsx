import { useState, useEffect } from 'react';
import { fetchGame, Game, Goal, TeamChange } from '../api/games';
import { Player, fetchPlayers } from '../api/players';

interface GameDetailReadOnlyProps {
  gameId: string;
  gameNumber: number | null;
  gameDate: string;
  onBack: () => void;
}

export default function GameDetailReadOnly({ gameId, gameNumber, gameDate, onBack }: GameDetailReadOnlyProps) {
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [gameData, playersData] = await Promise.all([fetchGame(gameId), fetchPlayers()]);
        setGame(gameData);
        setPlayers(playersData);
      } catch (err) {
        console.error('Error loading game:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [gameId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-text-tertiary">Loading game...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-error">Failed to load game</p>
        <button onClick={onBack} className="text-gold underline text-sm">Go back</button>
      </div>
    );
  }

  const playerMap = new Map(players.map(p => [p.id, p]));
  const teamAssignments = game.teamAssignments || {};
  const goals: Goal[] = game.goals || [];
  const teamChanges: TeamChange[] = game.teamChanges || [];
  const colorGoals = goals.filter(g => g.team === 'color').length;
  const whiteGoals = goals.filter(g => g.team === 'white').length;

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  // Combine goals and team changes into a timeline, sorted newest first
  const timeline = [
    ...goals.map((g, i) => ({ type: 'goal' as const, timestamp: new Date(g.timestamp), data: g, index: i })),
    ...teamChanges.map((tc, i) => ({ type: 'change' as const, timestamp: new Date(tc.timestamp), data: tc, index: i })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const colorPlayers = Object.entries(teamAssignments).filter(([, t]) => t === 'color').map(([pid]) => playerMap.get(pid)).filter(Boolean) as Player[];
  const whitePlayers = Object.entries(teamAssignments).filter(([, t]) => t === 'white').map(([pid]) => playerMap.get(pid)).filter(Boolean) as Player[];

  return (
    <div className="h-full overflow-y-auto max-w-lg mx-auto px-4 py-4 pb-8">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1 text-text-secondary hover:text-text-primary mb-4 transition-colors">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span className="text-sm font-medium">Back</span>
      </button>

      {/* Score Hero */}
      <div className="flex items-center justify-center gap-6 mb-2">
        <div className="text-center">
          <div className="w-14 h-14 rounded-xl bg-surface-active flex items-center justify-center mb-2 mx-auto border border-border">
            <svg className="w-7 h-7 text-text-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" opacity="0.7" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-text-primary">Color</p>
        </div>

        <div className="bg-gold rounded-2xl px-6 py-3 shadow-glow-gold">
          <span className="text-3xl font-bold text-text-on-accent">{colorGoals} - {whiteGoals}</span>
          <p className="text-[10px] text-text-on-accent/70 text-center font-medium">FULL TIME</p>
        </div>

        <div className="text-center">
          <div className="w-14 h-14 rounded-xl bg-surface-active flex items-center justify-center mb-2 mx-auto border border-border">
            <svg className="w-7 h-7 text-text-secondary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" opacity="0.3" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-text-primary">White</p>
        </div>
      </div>

      <p className="text-center text-text-tertiary text-xs mb-6">Game #{gameNumber ?? '?'} · {formatDate(gameDate)}</p>

      {/* Match Timeline */}
      {timeline.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gold uppercase tracking-wider mb-3">Match Timeline</h3>
          <div className="relative pl-6">
            {/* Vertical line */}
            <div className="absolute left-2 top-1 bottom-1 w-0.5 bg-border" />

            <div className="space-y-3">
              {timeline.map((event, i) => {
                if (event.type === 'goal') {
                  const goal = event.data as Goal;
                  const scorer = playerMap.get(goal.scorerId);
                  const assister = goal.assisterId ? playerMap.get(goal.assisterId) : null;
                  return (
                    <div key={`goal-${i}`} className="relative">
                      <div className={`absolute -left-4 top-1.5 w-3 h-3 rounded-full border-2 border-surface ${goal.team === 'color' ? 'bg-gold' : 'bg-text-secondary'}`} />
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-gold text-xs font-bold">{formatTime(goal.timestamp)} GOAL</p>
                          <p className="text-sm text-text-primary font-medium">{scorer?.name || 'Unknown'}</p>
                          {assister && <p className="text-xs text-text-tertiary">Assist: {assister.name}</p>}
                        </div>
                        <span className="text-xs text-text-tertiary">{goal.team === 'color' ? 'Color Team' : 'White Team'}</span>
                      </div>
                    </div>
                  );
                } else {
                  const change = event.data as TeamChange;
                  const player = playerMap.get(change.playerId);
                  return (
                    <div key={`change-${i}`} className="relative">
                      <div className="absolute -left-4 top-1.5 w-3 h-3 rounded-full border-2 border-surface bg-text-tertiary" />
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-text-tertiary text-xs font-bold">{formatTime(change.timestamp)} {change.type === 'swap' ? 'SWAP' : 'LEFT'}</p>
                          <p className="text-sm text-text-primary font-medium">
                            {change.type === 'swap'
                              ? `${player?.name || 'Unknown'} swapped`
                              : `${player?.name || 'Unknown'} left`
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          </div>
        </div>
      )}

      {/* Team Rosters */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-gold uppercase tracking-wider mb-3">Team Rosters</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Color Team */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-sm bg-surface-active border border-border" />
              <span className="text-xs font-semibold text-text-primary">Team Color</span>
            </div>
            <div className="space-y-2">
              {colorPlayers.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  {p.pictureUrl ? (
                    <img src={p.pictureUrl} alt={p.name} className="w-7 h-7 rounded-full object-cover border border-border-emphasis" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-[10px] font-semibold">
                      {getInitial(p.name)}
                    </div>
                  )}
                  <span className="text-xs text-text-primary truncate">{p.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* White Team */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-sm bg-gray-300" />
              <span className="text-xs font-semibold text-text-primary">Team White</span>
            </div>
            <div className="space-y-2">
              {whitePlayers.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  {p.pictureUrl ? (
                    <img src={p.pictureUrl} alt={p.name} className="w-7 h-7 rounded-full object-cover border border-border-emphasis" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-[10px] font-semibold">
                      {getInitial(p.name)}
                    </div>
                  )}
                  <span className="text-xs text-text-primary truncate">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
