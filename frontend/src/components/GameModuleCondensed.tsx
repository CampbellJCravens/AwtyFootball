import { useState } from 'react';
import EditGameModal from './EditGameModal';
import { updateGame, Goal, GameField } from '../api/games';

interface GameModuleCondensedProps {
  gameId: string;
  date: string;
  gameNumber: number | null;
  field?: GameField | null;
  goals?: Goal[];
  teamAssignments?: Record<string, 'color' | 'white'>;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onDateUpdated?: () => void;
  showDelete?: boolean;
  showEditDate?: boolean;
}

export default function GameModuleCondensed({ gameId, date, gameNumber, field = null, goals, teamAssignments, onClick, onDelete, onDateUpdated, showDelete = true, showEditDate = true }: GameModuleCondensedProps) {
  const [showEditModal, setShowEditModal] = useState(false);

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  };

  const colorGoals = goals?.filter(g => g.team === 'color').length ?? 0;
  const whiteGoals = goals?.filter(g => g.team === 'white').length ?? 0;
  const playerCount = teamAssignments ? Object.keys(teamAssignments).length : 0;

  const handleEdit = async (updates: { dateIso: string; gameNumber: number; field: GameField | null }) => {
    try {
      await updateGame(gameId, {
        createdAt: updates.dateIso,
        gameNumber: updates.gameNumber,
        field: updates.field,
      });
      if (onDateUpdated) onDateUpdated();
    } catch (err) {
      console.error('Error updating game:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to update game';
      if (errorMessage === 'Authentication required') {
        alert('Error: You must be logged in as an admin to edit games.');
      } else if (errorMessage.includes('already exists') || errorMessage.includes('unique')) {
        alert(`Error updating game: ${errorMessage}`);
      } else {
        alert(`Error updating game: ${errorMessage}. Make sure the game number is unique.`);
      }
    }
  };

  return (
    <>
      <div
        onClick={onClick}
        className={`bg-surface rounded-xl shadow-card p-4 mb-3 cursor-pointer hover:shadow-card-hover active:bg-surface-active transition-all border-l-4 ${
          field === 'cancelled' ? 'border-red-500' : 'border-gold'
        }`}
      >
        {/* Top row: Game number + date + actions */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-gold text-xs font-bold tracking-wider">GAME #{gameNumber ?? '?'}</span>
            <span className="text-text-muted text-xs">•</span>
            <span className="text-text-tertiary text-xs">{formatDate(date)}</span>
            <span className="text-text-muted text-xs">•</span>
            <span className="text-text-tertiary text-xs uppercase tracking-wider truncate">
              {field === 'stadium' ? 'Stadium' : field === 'grass' ? 'Grass' : field === 'cancelled' ? 'Cancelled' : 'N/A'}
            </span>
          </div>
          {(showEditDate || showDelete) && (
            <div className="flex gap-1 flex-shrink-0">
              {showEditDate && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowEditModal(true); }}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-hover active:bg-surface-active transition-colors"
                  aria-label="Edit game"
                >
                  <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              {showDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(e); }}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-error-bg active:bg-error-bg transition-colors"
                  aria-label="Delete game"
                >
                  <svg className="w-4 h-4 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Score row */}
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-text-primary">{colorGoals}</span>
            <span className="text-xl text-text-tertiary mx-1">-</span>
            <span className="text-3xl font-bold text-text-primary">{whiteGoals}</span>
          </div>
          {playerCount > 0 && (
            <span className="text-text-tertiary text-xs font-medium">{playerCount} PLAYERS</span>
          )}
        </div>
      </div>

      {showEditModal && (
        <EditGameModal
          currentDate={date}
          currentGameNumber={gameNumber}
          currentField={field}
          onSelect={handleEdit}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  );
}
