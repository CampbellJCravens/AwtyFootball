import { useState } from 'react';
import EditGameModal from './EditGameModal';
import { updateGame } from '../api/games';

interface GameModuleCondensedProps {
  gameId: string;
  date: string;
  gameNumber: number | null;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onDateUpdated?: () => void; // Callback to refresh games list
  showDelete?: boolean; // Only admins can delete
  showEditDate?: boolean; // Only admins can edit date
}

export default function GameModuleCondensed({ gameId, date, gameNumber, onClick, onDelete, onDateUpdated, showDelete = true, showEditDate = true }: GameModuleCondensedProps) {
  const [showEditModal, setShowEditModal] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleEdit = async (newDate: string, newGameNumber: number) => {
    try {
      await updateGame(gameId, { 
        createdAt: newDate,
        gameNumber: newGameNumber 
      });
      if (onDateUpdated) {
        onDateUpdated();
      }
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
        className="bg-gray-800 rounded-lg shadow-md p-4 mb-4 flex items-center justify-between cursor-pointer hover:shadow-lg hover:bg-gray-800 active:bg-gray-700 transition-all border-2 border-transparent hover:border-blue-300"
      >
        <p className="text-gray-300 flex-1 font-medium">Game{gameNumber ?? '?'} - {formatDate(date)}</p>
        {(showEditDate || showDelete) && (
          <div className="flex gap-2 flex-shrink-0">
            {showEditDate && (
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent triggering the container's onClick
                  setShowEditModal(true);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-700 active:bg-gray-600 transition-colors"
                aria-label="Edit game"
                data-tooltip="Edit Game"
              >
                <svg
                  className="w-5 h-5 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
            )}
            {showDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent triggering the container's onClick
                  onDelete(e);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-900/30 active:bg-red-900/50 transition-colors"
                aria-label="Delete game"
                data-tooltip="Delete"
              >
                <svg
                  className="w-5 h-5 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {showEditModal && (
        <EditGameModal
          currentDate={date}
          currentGameNumber={gameNumber}
          onSelect={handleEdit}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  );
}

