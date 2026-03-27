import { useState, useMemo } from 'react';
import { Player } from '../api/players';

interface GoalAssistModalProps {
  scorer: Player;
  teamPlayers: Player[];
  onSelectAssister: (assister: Player | null) => void;
  onClose: () => void;
}

export default function GoalAssistModal({ scorer, teamPlayers, onSelectAssister, onClose }: GoalAssistModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const getInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const handlePlayerClick = (player: Player) => {
    onSelectAssister(player);
    onClose();
  };

  const handleSkip = () => {
    onSelectAssister(null);
    onClose();
  };

  // Filter and sort players alphabetically
  const filteredAndSortedPlayers = useMemo(() => {
    const filtered = teamPlayers.filter(player =>
      player.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [teamPlayers, searchQuery]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-modal max-w-md w-full max-h-[80vh] flex flex-col border border-border">
        {/* Header */}
        <div className="p-6 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-semibold text-text-primary">Choose Assister!</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSkip}
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
          <p className="text-text-secondary text-base">Goal Scored by {scorer.name}</p>
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
                {teamPlayers.length === 0
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
    </div>
  );
}
