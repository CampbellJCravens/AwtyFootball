import { useState, useMemo } from 'react';
import { Player } from '../api/players';
import { Game } from '../api/games';
import PlayerCard from './PlayerCard';

interface PlayerListProps {
  players: Player[];
  games?: Game[];
  onEdit: (player: Player) => void;
  onDelete: (player: Player) => void;
  onPlayerClick?: (player: Player) => void;
  showActions?: boolean;
}

export default function PlayerList({ players, games = [], onEdit, onDelete, onPlayerClick, showActions = true }: PlayerListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [alumniOnly, setAlumniOnly] = useState(false);
  const [priorOpen, setPriorOpen] = useState(false);

  // Compute per-player stats from games
  const playerStats = useMemo(() => {
    const stats = new Map<string, { gp: number; goals: number; assists: number }>();
    games.forEach(game => {
      if (!game.teamAssignments) return;
      const playersInGame = new Set<string>(Object.keys(game.teamAssignments));
      playersInGame.forEach(pid => {
        if (!stats.has(pid)) stats.set(pid, { gp: 0, goals: 0, assists: 0 });
        stats.get(pid)!.gp++;
      });
      game.goals?.forEach(goal => {
        if (stats.has(goal.scorerId)) stats.get(goal.scorerId)!.goals++;
        if (goal.assisterId && stats.has(goal.assisterId)) stats.get(goal.assisterId)!.assists++;
      });
    });
    return stats;
  }, [games]);

  // Search matches BOTH groups; current roster on top, prior members split out.
  const { current, prior } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = players
      .filter(player => !alumniOnly || player.isAlumni)
      // Typing a year finds that class — it is what anyone would try, and a
      // year never collides with a name.
      .filter(player =>
        player.name.toLowerCase().includes(q) ||
        (q !== '' && player.graduationYear != null && String(player.graduationYear).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      current: filtered.filter(p => p.onRoster),
      prior: filtered.filter(p => !p.onRoster),
    };
  }, [players, searchQuery, alumniOnly]);

  const alumniCount = useMemo(() => players.filter(p => p.isAlumni).length, [players]);

  // Alumni share of the current roster. Unfiltered by search — this is a
  // standing figure about the club, not about what you're looking at.
  const rosterAlumni = useMemo(() => {
    const roster = players.filter(p => p.onRoster);
    const count = roster.filter(p => p.isAlumni).length;
    return {
      count,
      total: roster.length,
      pct: roster.length ? Math.round((count / roster.length) * 100) : 0,
    };
  }, [players]);

  const searching = searchQuery.trim().length > 0;
  // Prior members are collapsed by default, but auto-revealed when a search matches one.
  const priorVisible = priorOpen || (searching && prior.length > 0);

  const renderGrid = (list: Player[]) => (
    <div className="grid grid-cols-2 gap-3 pb-4">
      {list.map((player) => {
        const stats = playerStats.get(player.id);
        return (
          <PlayerCard
            key={player.id}
            player={player}
            gp={stats?.gp ?? 0}
            goals={stats?.goals ?? 0}
            assists={stats?.assists ?? 0}
            onEdit={onEdit}
            onDelete={onDelete}
            onClick={onPlayerClick ? () => onPlayerClick(player) : undefined}
            showActions={showActions}
          />
        );
      })}
    </div>
  );

  if (players.length === 0) {
    return (
      <div className="text-center py-12 text-text-tertiary">
        <p className="text-lg">No players yet.</p>
        <p className="text-sm mt-2">Use the + button to add players!</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Search Bar */}
      <div className="mb-4 flex-shrink-0">
        <input
          type="text"
          placeholder="Search players..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2.5 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary placeholder-text-muted"
        />
        {alumniCount > 0 && (
          <button
            type="button"
            onClick={() => setAlumniOnly(v => !v)}
            aria-pressed={alumniOnly}
            className={`mt-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${alumniOnly ? 'bg-gold text-text-on-accent border-gold' : 'bg-surface-raised text-text-secondary border-border-emphasis hover:bg-surface-hover'}`}
          >
            Alumni ({alumniCount})
          </button>
        )}
      </div>

      {current.length === 0 && prior.length === 0 ? (
        <div className="text-center py-12 text-text-tertiary">
          <p className="text-lg">No players found matching "{searchQuery}"</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Current roster */}
          {current.length > 0 ? (
            <>
              <div className="flex items-baseline gap-2 text-xs px-1 mb-2">
                <span className="font-semibold text-text-secondary">Current Roster ({current.length})</span>
                <span className="text-text-tertiary">·</span>
                <span className="font-semibold text-gold tabular-nums">{rosterAlumni.pct}% alumni</span>
                <span className="text-text-tertiary">({rosterAlumni.count} of {rosterAlumni.total})</span>
              </div>
              {renderGrid(current)}
            </>
          ) : !searching ? (
            <div className="text-center py-8 text-text-tertiary text-sm">No current roster players.</div>
          ) : null}

          {/* Prior members — collapsible, at the very bottom */}
          {prior.length > 0 && (
            <div className="mt-2 border-t border-border-emphasis pt-2">
              <button
                onClick={() => setPriorOpen((o) => !o)}
                className="w-full flex items-center justify-between px-1 py-2.5 text-text-secondary hover:text-text-primary transition-colors"
                aria-expanded={priorVisible}
              >
                <span className="text-sm font-semibold">Prior Members ({prior.length})</span>
                <span className="text-xs">{priorVisible ? '▲ Hide' : '▼ Show'}</span>
              </button>
              {priorVisible && renderGrid(prior)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
