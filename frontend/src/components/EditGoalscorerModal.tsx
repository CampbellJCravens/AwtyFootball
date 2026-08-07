import { useState, useMemo } from 'react';
import { Player } from '../api/players';
import TimePickerModal from './TimePickerModal';

interface EditGoalscorerModalProps {
  currentScorer: Player;
  teamPlayers: Player[];
  // Players on the team that CONCEDED. An own goal is scored by one of them —
  // the goal stays credited to the team it's already credited to.
  opposingPlayers: Player[];
  currentGoalTime: Date;
  isOwnGoal?: boolean;
  onSelectScorer: (scorer: Player) => void;
  onMarkOwnGoal: (scorer: Player) => void;
  onSkip: () => void;
  onTimeChange: (time: Date) => void;
  onClose: () => void;
}

export default function EditGoalscorerModal({ currentScorer, teamPlayers, opposingPlayers, currentGoalTime, isOwnGoal = false, onSelectScorer, onMarkOwnGoal, onSkip, onTimeChange, onClose }: EditGoalscorerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [ownGoalMode, setOwnGoalMode] = useState(isOwnGoal);

  const getInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const handlePlayerClick = (player: Player) => {
    if (ownGoalMode) onMarkOwnGoal(player);
    else onSelectScorer(player);
  };

  // In own-goal mode the scorer comes from the conceding team instead.
  const sourceList = ownGoalMode ? opposingPlayers : teamPlayers;

  // Filter and sort players alphabetically
  const filteredAndSortedPlayers = useMemo(() => {
    const filtered = sourceList.filter(player =>
      player.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [sourceList, searchQuery]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-modal max-w-md w-full max-h-[80vh] flex flex-col border border-border">
        {/* Header */}
        <div className="p-6 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-semibold text-text-primary">Edit Goalscorer</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTimePicker(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover active:bg-surface-active transition-colors"
                aria-label="Edit time"
                data-tooltip="Edit Time"
              >
                <svg
                  className="w-5 h-5 text-text-secondary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>
              <button
                onClick={onSkip}
                className="px-4 py-2 bg-surface-active hover:bg-gray-300 text-text-primary text-sm font-medium rounded-xl transition-colors"
              >
                Skip
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover active:bg-surface-active transition-colors"
                aria-label="Close"
                data-tooltip="Close"
              >
                <svg
                  className="w-6 h-6 text-text-secondary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-text-secondary text-base">
            {ownGoalMode ? 'Own goal — pick who put it in their own net' : `Goal Scored by ${currentScorer.name}`}
          </p>
          <button
            onClick={() => { setOwnGoalMode(v => !v); setSearchQuery(''); }}
            className={`mt-3 w-full px-4 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${
              ownGoalMode
                ? 'bg-red-400/15 border-red-400/60 text-red-400'
                : 'bg-surface-raised border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            {ownGoalMode ? '✓ Own goal — credited to the other team' : 'This was an own goal'}
          </button>
          {ownGoalMode && (
            <p className="text-text-tertiary text-xs mt-2">
              The scoreline doesn't change — it stays credited to the team that benefited.
              Any assist on this goal is removed.
            </p>
          )}
        </div>

        {/* Scrollable Player List */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col">
          {/* Search Bar */}
          <div className="mb-4 flex-shrink-0">
            <input
              type="text"
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary placeholder-text-muted"
            />
          </div>

          {filteredAndSortedPlayers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-text-tertiary">
                {sourceList.length === 0
                  ? 'No players available on this team'
                  : `No players found matching "${searchQuery}"`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAndSortedPlayers.map((player) => (
                <button
                  key={player.id}
                  onClick={() => handlePlayerClick(player)}
                  className="w-full bg-surface rounded-xl shadow-card p-3 mb-2 flex items-center gap-3 border border-border hover:border-accent transition-colors text-left"
                >
                  {player.pictureUrl ? (
                    <img
                      src={player.pictureUrl}
                      alt={player.name}
                      className="w-12 h-12 rounded-full object-cover border-2 border-border-emphasis flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-lg font-semibold flex-shrink-0">
                      {getInitial(player.name)}
                    </div>
                  )}
                  <span className="text-base font-medium text-text-primary flex-1">{player.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showTimePicker && (
        <TimePickerModal
          currentTime={currentGoalTime}
          onSelect={onTimeChange}
          onClose={() => setShowTimePicker(false)}
        />
      )}
    </div>
  );
}
