import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { Player } from '../api/players';
import { Game } from '../api/games';


interface PlayerStats {
  player: Player;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  points: number; // 3 pts per win, 1 pt per tie, 0 pts per loss
  pointsPerGame: number; // points / gamesPlayed
  goalInvolvements: number; // goals + assists
  goals: number;
  assists: number;
  cleanSheets: number; // games where the opponent scored 0
  sportsmanship: number; // gold stars given during games
  score: number;
  form: ('W' | 'L' | 'T')[]; // Last 5 game results (oldest to newest, left to right)
  formWins: number; // Wins minus losses in the form array (for sorting)
}

interface OverallStatsTableProps {
  players: Player[];
  games: Game[];
  onPlayerClick?: (playerId: string) => void;
  currentPlayerId?: string | null;
}

type SortColumn = 'points' | 'gamesPlayed' | 'wins' | 'losses' | 'ties' | 'goalInvolvements' | 'goals' | 'assists' | 'cleanSheets' | 'sportsmanship' | 'formWins';
type SortDirection = 'asc' | 'desc';


const MIN_QUALIFIED_GAMES = 3;

export default function OverallStatsTable({ players, games, onPlayerClick, currentPlayerId }: OverallStatsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('points');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [perGame, setPerGame] = useState(false);
  
  // Refs for manual sticky header
  const verticalScrollRef = useRef<HTMLDivElement>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const headerOverlayRef = useRef<HTMLDivElement>(null);
  const headerHeightRef = useRef<HTMLTableElement>(null);
  const headerRef = useRef<HTMLTableCellElement>(null);
  
  // Header height for padding-top calculation
  const [headerHeight, setHeaderHeight] = useState(0);
  
  // Manual sticky header: Sync overlay transform with scroll positions
  useEffect(() => {
    const updateHeaderPosition = () => {
      const verticalEl = verticalScrollRef.current;
      const horizontalEl = horizontalScrollRef.current;
      const overlayEl = headerOverlayRef.current;
      
      if (!verticalEl || !horizontalEl || !overlayEl) return;
      
      const scrollX = horizontalEl.scrollLeft;
      
      // Transform header overlay to sync horizontal scroll only (vertical is handled by absolute positioning)
      // Header is positioned at top:0, so no vertical transform needed
      overlayEl.style.transform = `translate(${-scrollX}px, 0)`;
    };
    
    const verticalEl = verticalScrollRef.current;
    const horizontalEl = horizontalScrollRef.current;
    
    // Use requestAnimationFrame for smooth updates
    let rafId: number;
    const onScroll = () => {
      rafId = requestAnimationFrame(updateHeaderPosition);
    };
    
    updateHeaderPosition(); // Initial position
    verticalEl?.addEventListener('scroll', onScroll);
    horizontalEl?.addEventListener('scroll', onScroll);
    
    return () => {
      verticalEl?.removeEventListener('scroll', onScroll);
      horizontalEl?.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);
  

  // Calculate stats for each player
  const playerStats = useMemo(() => {
    const statsMap = new Map<string, PlayerStats>();

    // Initialize stats for all players
    players.forEach(player => {
      statsMap.set(player.id, {
        player,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        points: 0,
        pointsPerGame: 0,
        goalInvolvements: 0,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        sportsmanship: 0,
        score: 0,
        form: [],
        formWins: 0,
      });
    });

    // Process each game
    games.forEach(game => {
      if (!game.teamAssignments || !game.goals) return;

      const teamAssignments = game.teamAssignments;
      const goals = game.goals;

      // Count goals by team
      const colorGoals = goals.filter(g => g.team === 'color').length;
      const whiteGoals = goals.filter(g => g.team === 'white').length;

      // Determine winner or tie
      const colorWon = colorGoals > whiteGoals;
      const whiteWon = whiteGoals > colorGoals;
      const isTie = colorGoals === whiteGoals;

      // Track which players participated in this game
      const playersInGame = new Set<string>();

      // Process team assignments
      Object.entries(teamAssignments).forEach(([playerId, team]) => {
        // Skip if player not found (guests are now regular players, so they should be in the list)
        if (!statsMap.has(playerId)) {
          return;
        }

        const stats = statsMap.get(playerId)!;
        stats.gamesPlayed++;
        playersInGame.add(playerId);

        // Count wins/losses/ties
        if (isTie) {
          stats.ties++;
        } else if (team === 'color' && colorWon) {
          stats.wins++;
        } else if (team === 'color' && whiteWon) {
          stats.losses++;
        } else if (team === 'white' && whiteWon) {
          stats.wins++;
        } else if (team === 'white' && colorWon) {
          stats.losses++;
        }

        // Clean sheet: opponent scored 0 goals
        const opponentGoals = team === 'color' ? whiteGoals : colorGoals;
        if (opponentGoals === 0) {
          stats.cleanSheets++;
        }

        stats.sportsmanship += (game.sportsmanship?.[playerId] || 0);
      });

      // Process goals and assists
      goals.forEach(goal => {
        // Count goals
        if (statsMap.has(goal.scorerId)) {
          const stats = statsMap.get(goal.scorerId)!;
          stats.goals++;
          // Only count GP if they weren't already counted via team assignment
          if (!playersInGame.has(goal.scorerId)) {
            stats.gamesPlayed++;
            playersInGame.add(goal.scorerId);
          }
        } else {
          // Player should exist in the players list (guests are now regular players)
          // Skip if player not found
          return;
        }

        // Count assists
        if (goal.assisterId) {
          if (statsMap.has(goal.assisterId)) {
            const stats = statsMap.get(goal.assisterId)!;
            stats.assists++;
            // Only count GP if they weren't already counted
            if (!playersInGame.has(goal.assisterId)) {
              stats.gamesPlayed++;
              playersInGame.add(goal.assisterId);
            }
          } else {
            // Player should exist in the players list (guests are now regular players)
            // Skip if player not found
            return;
          }
        }
      });
    });

    // Calculate points, PPG, goal involvements, and scores
    statsMap.forEach(stats => {
      // Calculate points: 3 pts per win, 1 pt per tie, 0 pts per loss
      stats.points = (stats.wins * 3) + (stats.ties * 1);
      
      // Calculate points per game
      if (stats.gamesPlayed > 0) {
        stats.pointsPerGame = Math.round((stats.points / stats.gamesPlayed) * 100) / 100; // Round to 2 decimal places
      } else {
        stats.pointsPerGame = 0;
      }
      
      // Calculate goal involvements (goals + assists)
      stats.goalInvolvements = stats.goals + stats.assists;
      
      stats.score = stats.points + stats.gamesPlayed + stats.goals + stats.assists;
    });

    // Calculate form (last 5 games) for each player
    // Sort games by createdAt (newest first, so we can get the last 5 most recent)
    const sortedGames = [...games].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA; // Newest first
    });

    // For each player, collect their last 5 game results (most recent 5)
    statsMap.forEach((stats, playerId) => {
      const playerForm: ('W' | 'L' | 'T')[] = [];
      
      // Iterate through games from newest to oldest, collecting results
      for (const game of sortedGames) {
        if (!game.teamAssignments || !game.goals) continue;

        const teamAssignments = game.teamAssignments;
        const goals = game.goals;

        // Check if player participated in this game
        const playerTeam = teamAssignments[playerId];
        if (!playerTeam) continue;

        // Count goals by team
        const colorGoals = goals.filter(g => g.team === 'color').length;
        const whiteGoals = goals.filter(g => g.team === 'white').length;

        // Determine result for this player
        const isTie = colorGoals === whiteGoals;
        if (isTie) {
          playerForm.push('T');
        } else if (playerTeam === 'color' && colorGoals > whiteGoals) {
          playerForm.push('W');
        } else if (playerTeam === 'color' && whiteGoals > colorGoals) {
          playerForm.push('L');
        } else if (playerTeam === 'white' && whiteGoals > colorGoals) {
          playerForm.push('W');
        } else if (playerTeam === 'white' && colorGoals > whiteGoals) {
          playerForm.push('L');
        }

        // Only keep last 5
        if (playerForm.length >= 5) {
          break;
        }
      }

      // Reverse to show oldest to newest (left to right in display)
      stats.form = playerForm.reverse();
      
      // Calculate wins minus losses in form (for sorting)
      const wins = stats.form.filter(result => result === 'W').length;
      const losses = stats.form.filter(result => result === 'L').length;
      stats.formWins = wins - losses;
    });

    return Array.from(statsMap.values()).filter(stats => 
      stats.gamesPlayed > 0 && !stats.player.name.includes('Guest')
    );
  }, [players, games]);

  // Helper to get per-game value
  const pg = (val: number, gp: number) => gp > 0 ? val / gp : 0;

  // Sort stats
  const sortedStats = useMemo(() => {
    const v = (stats: PlayerStats, col: SortColumn) => {
      const gp = stats.gamesPlayed;
      switch (col) {
        case 'points': return perGame ? pg(stats.points, gp) : stats.points;
        case 'gamesPlayed': return stats.gamesPlayed;
        case 'wins': return perGame ? pg(stats.wins, gp) : stats.wins;
        case 'losses': return perGame ? pg(stats.losses, gp) : stats.losses;
        case 'ties': return perGame ? pg(stats.ties, gp) : stats.ties;
        case 'goalInvolvements': return perGame ? pg(stats.goalInvolvements, gp) : stats.goalInvolvements;
        case 'goals': return perGame ? pg(stats.goals, gp) : stats.goals;
        case 'assists': return perGame ? pg(stats.assists, gp) : stats.assists;
        case 'cleanSheets': return perGame ? pg(stats.cleanSheets, gp) : stats.cleanSheets;
        case 'sportsmanship': return perGame ? pg(stats.sportsmanship, gp) : stats.sportsmanship;
        case 'formWins': return stats.formWins;
      }
    };

    const tiebreakers: Record<SortColumn, SortColumn[]> = {
      points: ['goalInvolvements', 'goals'],
      gamesPlayed: ['points', 'goalInvolvements'],
      wins: ['points', 'goalInvolvements'],
      losses: ['points', 'goalInvolvements'],
      ties: ['points', 'goalInvolvements'],
      goalInvolvements: ['goals', 'points'],
      goals: ['assists', 'points'],
      assists: ['goals', 'points'],
      cleanSheets: ['wins', 'points'],
      sportsmanship: ['points', 'goalInvolvements'],
      formWins: ['points', 'goalInvolvements'],
    };

    const sorted = [...playerStats].sort((a, b) => {
      let comparison = v(a, sortColumn) - v(b, sortColumn);
      if (comparison === 0) {
        for (const tb of tiebreakers[sortColumn]) {
          comparison = v(a, tb) - v(b, tb);
          if (comparison !== 0) break;
        }
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [playerStats, sortColumn, sortDirection, perGame]);

  const qualifiedStats = useMemo(() => sortedStats.filter(s => s.gamesPlayed >= MIN_QUALIFIED_GAMES), [sortedStats]);
  const unqualifiedStats = useMemo(() => sortedStats.filter(s => s.gamesPlayed < MIN_QUALIFIED_GAMES), [sortedStats]);
  const [showUnqualified, setShowUnqualified] = useState(true);
  const [showQualified, setShowQualified] = useState(true);
  const TOP_N = 20;

  // Measure header height for padding-top calculation (must be after sortedStats is defined)
  useLayoutEffect(() => {
    const measureHeader = () => {
      if (headerHeightRef.current) {
        const height = headerHeightRef.current.offsetHeight;
        setHeaderHeight(height);
      }
    };
    
    measureHeader();
    // Re-measure on window resize and when table re-renders
    window.addEventListener('resize', measureHeader);
    // Use a small timeout to allow DOM to settle after render
    const timeoutId = setTimeout(measureHeader, 0);
    return () => {
      window.removeEventListener('resize', measureHeader);
      clearTimeout(timeoutId);
    };
  }, [sortedStats]); // Re-measure when data changes

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return null;
    return (
      <span className="ml-1">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const getInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const columns = [
    { key: 'rank', label: 'Rk', tooltip: 'Rank', width: 'w-6', widthPx: 24, sticky: true, left: '0' },
    { key: 'player', label: 'Player', tooltip: 'Player', width: 'w-28', widthPx: 112, sticky: true, left: '1.5rem' },
    { key: 'gamesPlayed', label: 'GP', tooltip: 'Games Played', width: 'w-11', widthPx: 44, sortable: true, sortKey: 'gamesPlayed' },
    { key: 'points', label: 'Pts', tooltip: 'Points', width: 'w-11', widthPx: 44, sortable: true, sortKey: 'points' },
    { key: 'wins', label: 'W', tooltip: 'Wins', width: 'w-11', widthPx: 44, sortable: true, sortKey: 'wins' },
    { key: 'losses', label: 'L', tooltip: 'Losses', width: 'w-11', widthPx: 44, sortable: true, sortKey: 'losses' },
    { key: 'ties', label: 'T', tooltip: 'Ties', width: 'w-11', widthPx: 44, sortable: true, sortKey: 'ties' },
    { key: 'goalInvolvements', label: 'G+A', tooltip: 'Goals + Assists', width: 'w-11', widthPx: 44, sortable: true, sortKey: 'goalInvolvements' },
    { key: 'goals', label: 'G', tooltip: 'Goals', width: 'w-10', widthPx: 40, sortable: true, sortKey: 'goals' },
    { key: 'assists', label: 'A', tooltip: 'Assists', width: 'w-10', widthPx: 40, sortable: true, sortKey: 'assists' },
    { key: 'cleanSheets', label: 'CS', tooltip: 'Clean Sheets', width: 'w-10', widthPx: 40, sortable: true, sortKey: 'cleanSheets' },
    { key: 'sportsmanship', label: 'SP', tooltip: 'Sportsmanship (gold stars)', width: 'w-10', widthPx: 40, sortable: true, sortKey: 'sportsmanship' },
    { key: 'form', label: 'Form', tooltip: 'Form', width: 'w-28', widthPx: 112, sortable: true, sortKey: 'formWins' },
  ];

  // Manual sticky header overlay: Uses absolute positioning + transform instead of CSS sticky
  // This works regardless of CSS containment/transform issues that break position: sticky
  return (
    <>
      <div className="flex justify-end px-2 py-1.5">
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
      <div ref={verticalScrollRef} className="flex-1 min-h-0 overflow-y-auto relative">
        {/* Manual sticky header overlay - synced with scroll via transform */}
        <div 
          ref={headerOverlayRef} 
          className="absolute top-0 left-0 right-0 z-[999] pointer-events-none"
          style={{ transform: 'translate(0, 0)' }}
        >
          <div className="pointer-events-auto bg-base">
            <table ref={headerHeightRef} className="min-w-max w-full table-fixed border-separate border-spacing-0 text-xs">
              <colgroup>
                {columns.map(col => (
                  <col key={col.key} style={{ width: `${col.widthPx}px` }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b-2 border-gold">
                  {columns.map((col, idx) => (
                    <th
                      key={col.key}
                      ref={idx === 0 ? headerRef : undefined}
                      title={col.tooltip}
                      className={[
                        'py-1.5 px-1 font-semibold text-text-secondary bg-base border-b-2 border-gold text-left',
                        col.sortable ? 'cursor-pointer hover:text-accent hover:bg-surface-hover transition-colors' : '',
                        idx === 0 ? 'sticky left-0 z-70' : '',
                        idx === 1 ? 'sticky z-70' : '',
                        idx >= 2 ? 'z-60' : '',
                      ].filter(Boolean).join(' ')}
                      style={idx === 1 ? { left: `${columns[0].widthPx}px` } : undefined}
                      onClick={col.sortable && col.sortKey ? () => handleSort(col.sortKey as SortColumn) : undefined}
                    >
                      {col.label} {col.sortable && col.sortKey && <SortIcon column={col.sortKey as SortColumn} />}
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          </div>
        </div>

        {/* Horizontal scroll wrapper - MUST have overflow-y: visible to avoid breaking sticky */}
        <div 
          ref={horizontalScrollRef} 
          className="overflow-x-auto" 
          style={{ overflowY: 'visible', paddingTop: `${headerHeight}px` }}
        >
          {/* Body table - padding-top keeps content below header overlay */}
          <table className="min-w-max w-full table-fixed border-separate border-spacing-0 text-xs">
            <colgroup>
              {columns.map(col => (
                <col key={col.key} style={{ width: `${col.widthPx}px` }} />
              ))}
            </colgroup>
            <tbody>
              {qualifiedStats.length === 0 && unqualifiedStats.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center py-8 text-text-tertiary">
                    No stats available. Play some games first!
                  </td>
                </tr>
              ) : (
                <>
                  {qualifiedStats.length > 0 && (
                    <tr>
                      <td colSpan={columns.length} className="py-2 px-2 bg-base">
                        <button
                          onClick={() => setShowQualified(prev => !prev)}
                          className="text-[11px] font-semibold text-text-secondary hover:text-text-primary transition-colors"
                        >
                          {showQualified ? '▾' : '▸'} Qualified ({MIN_QUALIFIED_GAMES}+ games){qualifiedStats.length > TOP_N ? ` · top ${TOP_N} of ${qualifiedStats.length}` : ` · ${qualifiedStats.length}`}
                        </button>
                      </td>
                    </tr>
                  )}
                  {showQualified && qualifiedStats.slice(0, TOP_N).map((stats, index) => {
                    const isCurrentUser = stats.player.id === currentPlayerId;
                    return (
                      <tr key={stats.player.id} className={`border-b border-border ${isCurrentUser ? 'bg-gold/10' : 'hover:bg-surface-hover even:bg-surface-hover/50'}`}>
                        <td className={`py-1.5 px-1 font-medium sticky left-0 z-20 text-[11px] ${isCurrentUser ? 'bg-gold/10 text-gold' : 'bg-base text-text-secondary'}`}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                        </td>
                        <td
                          className={`py-1.5 px-1 sticky z-20 ${isCurrentUser ? 'bg-gold/10' : 'bg-base'}`}
                          style={{ left: `${columns[0].widthPx}px` }}
                        >
                          <div className="flex items-center gap-1.5">
                            {stats.player.pictureUrl ? (
                              <img src={stats.player.pictureUrl} alt={stats.player.name} className="w-6 h-6 rounded-full object-cover border border-border-emphasis flex-shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-surface-active flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                                {getInitial(stats.player.name)}
                              </div>
                            )}
                            <span
                              className={`font-medium truncate text-[11px] ${isCurrentUser ? 'text-gold' : 'text-text-primary'} ${onPlayerClick ? 'cursor-pointer hover:underline' : ''}`}
                              onClick={onPlayerClick ? (e) => { e.stopPropagation(); onPlayerClick(stats.player.id); } : undefined}
                            >
                              {stats.player.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-1.5 px-1 text-text-secondary">{stats.gamesPlayed}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? pg(stats.points, stats.gamesPlayed).toFixed(2) : stats.points}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? `${Math.round(pg(stats.wins, stats.gamesPlayed) * 100)}%` : stats.wins}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? `${Math.round(pg(stats.losses, stats.gamesPlayed) * 100)}%` : stats.losses}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? `${Math.round(pg(stats.ties, stats.gamesPlayed) * 100)}%` : stats.ties}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? pg(stats.goalInvolvements, stats.gamesPlayed).toFixed(2) : stats.goalInvolvements}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? pg(stats.goals, stats.gamesPlayed).toFixed(2) : stats.goals}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? pg(stats.assists, stats.gamesPlayed).toFixed(2) : stats.assists}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? pg(stats.cleanSheets, stats.gamesPlayed).toFixed(2) : stats.cleanSheets}</td>
                        <td className="py-1.5 px-1 text-gold">{perGame ? pg(stats.sportsmanship, stats.gamesPlayed).toFixed(2) : stats.sportsmanship}</td>
                        <td className="py-1.5 px-1">
                          <div className="flex items-center gap-0.5">
                            {[0, 1, 2, 3, 4].map((i) => {
                              const result = stats.form[i];
                              return (
                                <div key={i} className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                                  result === 'W' ? 'bg-green-700 border-green-600 text-white'
                                  : result === 'L' ? 'bg-red-600 border-red-500 text-white'
                                  : result === 'T' ? 'bg-gray-600 border-gray-500 text-white'
                                  : 'bg-transparent border-border-emphasis text-text-muted'
                                }`}>{result || ''}</div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {unqualifiedStats.length > 0 && (
                    <tr>
                      <td colSpan={columns.length} className="py-2 px-2 bg-base">
                        <button
                          onClick={() => setShowUnqualified(prev => !prev)}
                          className="text-[11px] font-semibold text-text-tertiary hover:text-text-secondary transition-colors"
                        >
                          {showUnqualified ? '▾' : '▸'} Unqualified (&lt;{MIN_QUALIFIED_GAMES} games){unqualifiedStats.length > TOP_N ? ` · top ${TOP_N} of ${unqualifiedStats.length}` : ` · ${unqualifiedStats.length}`}
                        </button>
                      </td>
                    </tr>
                  )}
                  {showUnqualified && unqualifiedStats.slice(0, TOP_N).map((stats, index) => {
                    const isCurrentUser = stats.player.id === currentPlayerId;
                    return (
                      <tr key={stats.player.id} className={`border-b border-border ${isCurrentUser ? 'bg-gold/10' : 'hover:bg-surface-hover even:bg-surface-hover/50'} opacity-50`}>
                        <td className={`py-1.5 px-1 font-medium sticky left-0 z-20 text-[11px] ${isCurrentUser ? 'bg-gold/10 text-gold' : 'bg-base text-text-secondary'}`}>
                          {index + 1}
                        </td>
                        <td
                          className={`py-1.5 px-1 sticky z-20 ${isCurrentUser ? 'bg-gold/10' : 'bg-base'}`}
                          style={{ left: `${columns[0].widthPx}px` }}
                        >
                          <div className="flex items-center gap-1.5">
                            {stats.player.pictureUrl ? (
                              <img src={stats.player.pictureUrl} alt={stats.player.name} className="w-6 h-6 rounded-full object-cover border border-border-emphasis flex-shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-surface-active flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                                {getInitial(stats.player.name)}
                              </div>
                            )}
                            <span
                              className={`font-medium truncate text-[11px] ${isCurrentUser ? 'text-gold' : 'text-text-primary'} ${onPlayerClick ? 'cursor-pointer hover:underline' : ''}`}
                              onClick={onPlayerClick ? (e) => { e.stopPropagation(); onPlayerClick(stats.player.id); } : undefined}
                            >
                              {stats.player.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-1.5 px-1 text-text-secondary">{stats.gamesPlayed}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? pg(stats.points, stats.gamesPlayed).toFixed(2) : stats.points}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? `${Math.round(pg(stats.wins, stats.gamesPlayed) * 100)}%` : stats.wins}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? `${Math.round(pg(stats.losses, stats.gamesPlayed) * 100)}%` : stats.losses}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? `${Math.round(pg(stats.ties, stats.gamesPlayed) * 100)}%` : stats.ties}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? pg(stats.goalInvolvements, stats.gamesPlayed).toFixed(2) : stats.goalInvolvements}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? pg(stats.goals, stats.gamesPlayed).toFixed(2) : stats.goals}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? pg(stats.assists, stats.gamesPlayed).toFixed(2) : stats.assists}</td>
                        <td className="py-1.5 px-1 text-text-secondary">{perGame ? pg(stats.cleanSheets, stats.gamesPlayed).toFixed(2) : stats.cleanSheets}</td>
                        <td className="py-1.5 px-1 text-gold">{perGame ? pg(stats.sportsmanship, stats.gamesPlayed).toFixed(2) : stats.sportsmanship}</td>
                        <td className="py-1.5 px-1">
                          <div className="flex items-center gap-0.5">
                            {[0, 1, 2, 3, 4].map((i) => {
                              const result = stats.form[i];
                              return (
                                <div key={i} className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                                  result === 'W' ? 'bg-green-700 border-green-600 text-white'
                                  : result === 'L' ? 'bg-red-600 border-red-500 text-white'
                                  : result === 'T' ? 'bg-gray-600 border-gray-500 text-white'
                                  : 'bg-transparent border-border-emphasis text-text-muted'
                                }`}>{result || ''}</div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

