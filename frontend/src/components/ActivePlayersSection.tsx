import { useState, useMemo, ComponentType } from 'react';
import { SoccerBall, Handshake, Star, DoorOpen, Warning, ArrowUUpLeft, PencilSimple, IconProps } from '@phosphor-icons/react';
import { Player } from '../api/players';

// Goals are tracked in the parent as Player objects (after restoring from API).
type GameGoal = { scorer: Player; assister: Player | null; timestamp: Date; team: 'color' | 'white' | null; ownGoal?: boolean };

interface ActivePlayersSectionProps {
  players: Player[];
  playerTeams: Record<string, 'color' | 'white'>;
  leftPlayers: Record<string, boolean>;
  sportsmanship?: Record<string, number>;
  fouls?: Record<string, number>;
  goals?: GameGoal[];
  onTeamSelect: (playerId: string, team: 'color' | 'white') => void;
  onAddGuest: (team: 'color' | 'white') => void;
  onRemoveFromTeam: (playerId: string) => void;
  onSwapTeam: (playerId: string) => void;
  onGoalClick: (player: Player) => void;
  onOwnGoalClick?: (player: Player) => void;
  onLeaveTeam: (playerId: string) => void;
  onReturnToTeam: (playerId: string) => void;
  onSportsmanshipChange?: (playerId: string, delta: number) => void;
  onFoulsChange?: (playerId: string, delta: number) => void;
  isAdmin?: boolean; // Whether user is admin (can modify games)
  // Resolves a guest's per-game label. Falls back to Player.name, which is what
  // guest exclusion elsewhere matches on and is never overwritten.
  displayName?: (player: Player) => string;
  guestHosts?: Record<string, string>; // slotPlayerId -> host's name
  onEditGuest?: (slotPlayerId: string) => void;
}

// Stat badge: stacks a Phosphor icon `count` times with a slight overlap so
// 3 goals reads as three balls leaning on each other rather than "ball ×3".
// Caps at 5 visible icons; anything beyond shows the cap + a small "+N" tail.
const ICON_CAP = 5;
function StatStack({
  Icon,
  count,
  className = 'text-text-secondary',
  weight = 'fill',
  size = 16,
  label,
}: {
  Icon: ComponentType<IconProps>;
  count: number;
  className?: string;
  weight?: IconProps['weight'];
  size?: number;
  label: string;
}) {
  if (count <= 0) return null;
  const visible = Math.min(count, ICON_CAP);
  const overflow = count - visible;
  return (
    <span className={`inline-flex items-center ${className}`} title={`${count} ${label}${count === 1 ? '' : 's'}`}>
      <span className="inline-flex items-center -space-x-1">
        {Array.from({ length: visible }).map((_, i) => (
          <Icon key={i} size={size} weight={weight} />
        ))}
      </span>
      {overflow > 0 && <span className="ml-0.5 text-[10px] font-bold tabular-nums">+{overflow}</span>}
    </span>
  );
}

// Admin −/+ counter used for both sportsmanship (blue) and fouls (red).
function Stepper({
  value,
  onChange,
  tooltip,
  label,
  activeClass,
}: {
  value: number;
  onChange: (delta: number) => void;
  tooltip: string;
  label: string;
  activeClass: string;
}) {
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0" data-tooltip={tooltip}>
      <button
        onClick={() => onChange(-1)}
        className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold ${activeClass} hover:bg-surface-hover active:bg-surface-active transition-colors`}
        aria-label={`Decrease ${label}`}
      >-</button>
      <span className={`text-sm font-semibold min-w-[1rem] text-center tabular-nums ${value > 0 ? activeClass : 'text-text-tertiary'}`}>
        {value}
      </span>
      <button
        onClick={() => onChange(1)}
        className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold ${activeClass} hover:bg-surface-hover active:bg-surface-active transition-colors`}
        aria-label={`Increase ${label}`}
      >+</button>
    </div>
  );
}

export default function ActivePlayersSection({
  players,
  playerTeams,
  leftPlayers,
  sportsmanship = {},
  fouls = {},
  goals = [],
  onTeamSelect: _onTeamSelect,
  onAddGuest,
  onRemoveFromTeam: _onRemoveFromTeam,
  onSwapTeam,
  onGoalClick,
  onOwnGoalClick,
  onLeaveTeam,
  onReturnToTeam,
  onSportsmanshipChange,
  onFoulsChange,
  isAdmin = true,
  displayName,
  guestHosts = {},
  onEditGuest,
}: ActivePlayersSectionProps) {
  const label = (player: Player) => displayName?.(player) ?? player.name;
  const isGuestSlot = (player: Player) => /^Guest\d+$/.test(player.name.trim());

  // Pre-aggregate goals/assists per playerId so each row doesn't re-scan.
  const statsByPlayer = useMemo(() => {
    const m = new Map<string, { goals: number; ownGoals: number; assists: number }>();
    for (const g of goals) {
      const sId = g.scorer.id;
      const s = m.get(sId) ?? { goals: 0, ownGoals: 0, assists: 0 };
      // An own goal credits the opposition — never the scorer's own tally.
      if (g.ownGoal) s.ownGoals += 1;
      else s.goals += 1;
      m.set(sId, s);
      if (g.assister) {
        const aId = g.assister.id;
        const a = m.get(aId) ?? { goals: 0, ownGoals: 0, assists: 0 };
        a.assists += 1;
        m.set(aId, a);
      }
    }
    return m;
  }, [goals]);

  const renderStatBadges = (playerId: string, opts?: { showLeft?: boolean }) => {
    const s = statsByPlayer.get(playerId);
    const sportsCount = sportsmanship[playerId] || 0;
    const foulCount = fouls[playerId] || 0;
    const goalCount = s?.goals ?? 0;
    const ownGoalCount = s?.ownGoals ?? 0;
    const assistCount = s?.assists ?? 0;
    const showLeft = opts?.showLeft;
    if (!goalCount && !ownGoalCount && !assistCount && !sportsCount && !foulCount && !showLeft) return null;
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatStack Icon={SoccerBall} count={goalCount} weight="duotone" className="text-text-primary" label="goal" />
        <StatStack Icon={ArrowUUpLeft} count={ownGoalCount} weight="bold" className="text-red-400" label="own goal" />
        <StatStack Icon={Handshake} count={assistCount} weight="regular" className="text-text-secondary" label="assist" />
        <StatStack Icon={Star} count={sportsCount} weight="fill" className="text-gold" label="sportsmanship" />
        <StatStack Icon={Warning} count={foulCount} weight="fill" className="text-red-400" label="foul" />
        {showLeft && (
          <span className="inline-flex items-center text-warning" title="Left the game">
            <DoorOpen size={16} weight="bold" />
          </span>
        )}
      </div>
    );
  };

  // Alumni share of this game's roster. Guests are excluded, matching how the
  // backend computes the per-date alumni rate on the field stats tab.
  const gameAlumni = useMemo(() => {
    const assigned = players.filter(p => playerTeams[p.id] && !p.name.includes('Guest'));
    const count = assigned.filter(p => p.isAlumni).length;
    return {
      count,
      total: assigned.length,
      pct: assigned.length ? Math.round((count / assigned.length) * 100) : 0,
    };
  }, [players, playerTeams]);

  const [activeTab, setActiveTab] = useState<'color' | 'white'>('color');
  const colorTeamPlayers = players.filter(player => playerTeams[player.id] === 'color');
  const whiteTeamPlayers = players.filter(player => playerTeams[player.id] === 'white');

  const colorActive = colorTeamPlayers
    .filter(player => !leftPlayers[player.id])
    .sort((a, b) => a.name.localeCompare(b.name));
  const colorLeft = colorTeamPlayers
    .filter(player => leftPlayers[player.id])
    .sort((a, b) => a.name.localeCompare(b.name));

  const whiteActive = whiteTeamPlayers
    .filter(player => !leftPlayers[player.id])
    .sort((a, b) => a.name.localeCompare(b.name));
  const whiteLeft = whiteTeamPlayers
    .filter(player => leftPlayers[player.id])
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-lg font-semibold text-text-primary">Teams</h3>
        {gameAlumni.total > 0 && (
          <span className="text-xs" data-tooltip="Alumni share of this game's roster">
            <span className="font-semibold text-gold tabular-nums">{gameAlumni.pct}% alumni</span>
            <span className="text-text-tertiary ml-1">({gameAlumni.count} of {gameAlumni.total})</span>
          </span>
        )}
      </div>
      {/* Tabs */}
      <div className="flex border-b border-border mb-3">
        <button
          onClick={() => setActiveTab('color')}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === 'color'
              ? 'text-gold border-b-2 border-gold'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Color ({colorActive.length})
        </button>
        <button
          onClick={() => setActiveTab('white')}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === 'white'
              ? 'text-gold border-b-2 border-gold'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          White ({whiteActive.length})
        </button>
      </div>

      {/* Content */}
      <div className="bg-base rounded-xl p-4 min-h-[200px] max-h-[900px] flex flex-col relative border border-border">
        {activeTab === 'color' ? (
          <>
            <div className="flex items-center justify-between mb-3 flex-shrink-0 relative z-10">
              <h4 className="text-text-primary font-medium text-center flex-1">Color Team ({colorActive.length})</h4>
              {isAdmin && (
                <button
                  onClick={() => onAddGuest('color')}
                  className="px-3 py-1.5 bg-surface-raised hover:bg-surface-active text-text-primary text-xs font-medium rounded-xl transition-colors flex-shrink-0"
                  data-tooltip="Add Guest"
                >
                  Add Guest
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 relative z-0">
              {colorActive.length === 0 ? (
                <p className="text-text-tertiary text-sm text-center py-4">
                  {isAdmin
                    ? 'Add players to this team in the Choose Teams module above'
                    : 'Waiting on an admin to add players to this team'}
                </p>
              ) : (
                colorActive.map((player) => (
                  <div key={player.id} className="bg-surface rounded-xl p-2 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      {player.pictureUrl ? (
                        <img
                          src={player.pictureUrl}
                          alt={player.name}
                          className="w-8 h-8 rounded-full object-cover border border-border-emphasis flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-xs font-semibold flex-shrink-0">
                          {label(player).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-text-primary text-sm truncate">{label(player)}</span>
                          {isAdmin && onEditGuest && isGuestSlot(player) && (
                            <button
                              onClick={() => onEditGuest(player.id)}
                              className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors flex-shrink-0"
                              aria-label="Edit guest details"
                              data-tooltip="Guest details"
                            >
                              <PencilSimple size={12} />
                            </button>
                          )}
                        </div>
                        {guestHosts[player.id] && (
                          <span className="block text-[10px] text-text-tertiary truncate">guest of {guestHosts[player.id]}</span>
                        )}
                      </div>
                      {!isAdmin && renderStatBadges(player.id)}
                    </div>
                    {isAdmin && (
                    <div className="flex flex-wrap items-center justify-end gap-1 mt-1.5 pt-1.5 border-t border-border">
                      {isAdmin && onSportsmanshipChange && (
                        <Stepper
                          value={sportsmanship[player.id] || 0}
                          onChange={delta => onSportsmanshipChange(player.id, delta)}
                          tooltip="Sportsmanship"
                          label="sportsmanship"
                          activeClass="text-blue-400"
                        />
                      )}
                      {isAdmin && onFoulsChange && (
                        <Stepper
                          value={fouls[player.id] || 0}
                          onChange={delta => onFoulsChange(player.id, delta)}
                          tooltip="Fouls"
                          label="fouls"
                          activeClass="text-red-400"
                        />
                      )}
                      <div className="flex gap-1 flex-shrink-0">
                        {isAdmin && (
                          <button
                            onClick={() => onGoalClick(player)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover active:bg-surface-active transition-colors"
                            aria-label="Goal"
                            data-tooltip="Goal"
                          >
                            <svg
                              className="w-6 h-6 text-text-primary"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <line x1="5" y1="6" x2="5" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <line x1="19" y1="6" x2="19" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <circle cx="12" cy="12" r="4" fill="currentColor"/>
                              <path d="M12 8.5L13.5 11.5L16 12L13.5 12.5L12 15.5L10.5 12.5L8 12L10.5 11.5L12 8.5Z" fill="rgba(0, 0, 0, 0.6)" stroke="rgba(0, 0, 0, 0.8)" strokeWidth="0.3"/>
                            </svg>
                          </button>
                        )}
                        {isAdmin && onOwnGoalClick && (
                          <button
                            onClick={() => onOwnGoalClick(player)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover active:bg-surface-active transition-colors"
                            aria-label="Own goal"
                            data-tooltip="Own Goal"
                          >
                            <ArrowUUpLeft size={20} weight="bold" className="text-red-400" />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => onSwapTeam(player.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover active:bg-surface-active transition-colors"
                            aria-label="Swap"
                            data-tooltip="Swap Team"
                          >
                            <svg
                              className="w-5 h-5 text-text-primary"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                              />
                            </svg>
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => onLeaveTeam(player.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-warning-bg active:bg-warning-bg transition-colors"
                            aria-label="Mark player as left"
                            data-tooltip="Player left"
                          >
                            <svg
                              className="w-5 h-5 text-warning"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H6a2 2 0 00-2 2v8a2 2 0 002 2h4m4-4H6m8 0l-3-3m3 3l-3 3"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {colorLeft.length > 0 && (
              <>
                <div className="border-t border-border my-3" />
                <h5 className="text-sm text-text-secondary mb-2">
                  Players that have left ({colorLeft.length})
                </h5>
                <div className="space-y-2">
                  {colorLeft.map((player) => (
                    <div key={player.id} className="bg-surface rounded-xl p-2 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        {player.pictureUrl ? (
                          <img
                            src={player.pictureUrl}
                            alt={player.name}
                            className="w-8 h-8 rounded-full object-cover border border-border-emphasis flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-xs font-semibold flex-shrink-0">
                            {label(player).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 mr-2">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-text-primary text-sm truncate">{label(player)}</span>
                          {isAdmin && onEditGuest && isGuestSlot(player) && (
                            <button
                              onClick={() => onEditGuest(player.id)}
                              className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors flex-shrink-0"
                              aria-label="Edit guest details"
                              data-tooltip="Guest details"
                            >
                              <PencilSimple size={12} />
                            </button>
                          )}
                        </div>
                        {guestHosts[player.id] && (
                          <span className="block text-[10px] text-text-tertiary truncate">guest of {guestHosts[player.id]}</span>
                        )}
                      </div>
                        {!isAdmin && renderStatBadges(player.id, { showLeft: true })}
                        {isAdmin && (
                          <button
                            onClick={() => onReturnToTeam(player.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-accent-muted active:bg-accent-muted transition-colors"
                            aria-label="Return player"
                            data-tooltip="Return to game"
                          >
                            <svg
                              className="w-4 h-4 text-accent"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 19V5m0 0l-4 4m4-4l4 4"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 flex-shrink-0 relative z-10">
              <h4 className="text-text-primary font-medium text-center flex-1">White Team ({whiteActive.length})</h4>
              {isAdmin && (
                <button
                  onClick={() => onAddGuest('white')}
                  className="px-3 py-1.5 bg-surface-active hover:bg-gray-300 text-text-primary text-xs font-medium rounded-xl transition-colors flex-shrink-0"
                  data-tooltip="Add Guest"
                >
                  Add Guest
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 relative z-0">
              {whiteActive.length === 0 ? (
                <p className="text-text-tertiary text-sm text-center py-4">
                  {isAdmin
                    ? 'Add players to this team in the Choose Teams module above'
                    : 'Waiting on an admin to add players to this team'}
                </p>
              ) : (
                whiteActive.map((player) => (
                  <div key={player.id} className="bg-surface rounded-xl p-2 border border-border flex-shrink-0">
                    <div className="flex items-center gap-2">
                      {player.pictureUrl ? (
                        <img
                          src={player.pictureUrl}
                          alt={player.name}
                          className="w-8 h-8 rounded-full object-cover border border-border-emphasis flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-xs font-semibold flex-shrink-0">
                          {label(player).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-text-primary text-sm truncate">{label(player)}</span>
                          {isAdmin && onEditGuest && isGuestSlot(player) && (
                            <button
                              onClick={() => onEditGuest(player.id)}
                              className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors flex-shrink-0"
                              aria-label="Edit guest details"
                              data-tooltip="Guest details"
                            >
                              <PencilSimple size={12} />
                            </button>
                          )}
                        </div>
                        {guestHosts[player.id] && (
                          <span className="block text-[10px] text-text-tertiary truncate">guest of {guestHosts[player.id]}</span>
                        )}
                      </div>
                      {!isAdmin && renderStatBadges(player.id)}
                    </div>
                    {isAdmin && (
                    <div className="flex flex-wrap items-center justify-end gap-1 mt-1.5 pt-1.5 border-t border-border">
                      {isAdmin && onSportsmanshipChange && (
                        <Stepper
                          value={sportsmanship[player.id] || 0}
                          onChange={delta => onSportsmanshipChange(player.id, delta)}
                          tooltip="Sportsmanship"
                          label="sportsmanship"
                          activeClass="text-blue-400"
                        />
                      )}
                      {isAdmin && onFoulsChange && (
                        <Stepper
                          value={fouls[player.id] || 0}
                          onChange={delta => onFoulsChange(player.id, delta)}
                          tooltip="Fouls"
                          label="fouls"
                          activeClass="text-red-400"
                        />
                      )}
                      <div className="flex gap-1 flex-shrink-0">
                        {isAdmin && (
                          <button
                            onClick={() => onGoalClick(player)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover active:bg-surface-active transition-colors"
                            aria-label="Goal"
                            data-tooltip="Goal"
                          >
                            <svg
                              className="w-6 h-6 text-text-secondary"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <line x1="5" y1="6" x2="5" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <line x1="19" y1="6" x2="19" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <circle cx="12" cy="12" r="4" fill="currentColor"/>
                              <path d="M12 8.5L13.5 11.5L16 12L13.5 12.5L12 15.5L10.5 12.5L8 12L10.5 11.5L12 8.5Z" fill="rgba(255, 255, 255, 0.6)" stroke="rgba(255, 255, 255, 0.8)" strokeWidth="0.3"/>
                            </svg>
                          </button>
                        )}
                        {isAdmin && onOwnGoalClick && (
                          <button
                            onClick={() => onOwnGoalClick(player)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover active:bg-surface-active transition-colors"
                            aria-label="Own goal"
                            data-tooltip="Own Goal"
                          >
                            <ArrowUUpLeft size={20} weight="bold" className="text-red-400" />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => onSwapTeam(player.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover active:bg-surface-active transition-colors"
                            aria-label="Swap"
                            data-tooltip="Swap Team"
                          >
                            <svg
                              className="w-5 h-5 text-text-primary"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                              />
                            </svg>
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => onLeaveTeam(player.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-warning-bg active:bg-warning-bg transition-colors"
                            aria-label="Mark player as left"
                            data-tooltip="Player left"
                          >
                            <svg
                              className="w-5 h-5 text-warning"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H6a2 2 0 00-2 2v8a2 2 0 002 2h4m4-4H6m8 0l-3-3m3 3l-3 3"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {whiteLeft.length > 0 && (
              <>
                <div className="border-t border-border my-3" />
                <h5 className="text-sm text-text-secondary mb-2">
                  Players that have left ({whiteLeft.length})
                </h5>
                <div className="space-y-2">
                  {whiteLeft.map((player) => (
                    <div key={player.id} className="bg-surface rounded-xl p-2 border border-border flex-shrink-0">
                      <div className="flex items-center gap-2">
                        {player.pictureUrl ? (
                          <img
                            src={player.pictureUrl}
                            alt={player.name}
                            className="w-8 h-8 rounded-full object-cover border border-border-emphasis flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-xs font-semibold flex-shrink-0">
                            {label(player).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 mr-2">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-text-primary text-sm truncate">{label(player)}</span>
                          {isAdmin && onEditGuest && isGuestSlot(player) && (
                            <button
                              onClick={() => onEditGuest(player.id)}
                              className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors flex-shrink-0"
                              aria-label="Edit guest details"
                              data-tooltip="Guest details"
                            >
                              <PencilSimple size={12} />
                            </button>
                          )}
                        </div>
                        {guestHosts[player.id] && (
                          <span className="block text-[10px] text-text-tertiary truncate">guest of {guestHosts[player.id]}</span>
                        )}
                      </div>
                        {!isAdmin && renderStatBadges(player.id, { showLeft: true })}
                        {isAdmin && (
                          <button
                            onClick={() => onReturnToTeam(player.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-accent-muted active:bg-accent-muted transition-colors"
                            aria-label="Return player"
                            data-tooltip="Return to game"
                          >
                            <svg
                              className="w-4 h-4 text-accent"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 19V5m0 0l-4 4m4-4l4 4"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
