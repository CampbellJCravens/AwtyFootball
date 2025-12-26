import { useState, useEffect } from 'react';

interface EditGameModalProps {
  currentDate: string; // ISO date string
  currentGameNumber: number | null;
  onSelect: (date: string, gameNumber: number) => void; // ISO date string and game number
  onClose: () => void;
}

export default function EditGameModal({ currentDate, currentGameNumber, onSelect, onClose }: EditGameModalProps) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const date = new Date(currentDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [gameNumber, setGameNumber] = useState<number>(currentGameNumber || 1);

  useEffect(() => {
    if (currentGameNumber !== null) {
      setGameNumber(currentGameNumber);
    }
  }, [currentGameNumber]);

  const handleSave = () => {
    // Convert the date string to ISO format
    const [year, month, day] = selectedDate.split('-').map(Number);
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    onSelect(date.toISOString(), gameNumber);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-gray-100">Edit Game</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-700 active:bg-gray-600 transition-colors"
            aria-label="Close"
            data-tooltip="Close"
          >
            <svg
              className="w-6 h-6 text-gray-300"
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

        <div className="mb-4">
          <label htmlFor="date-input" className="block text-sm font-medium text-gray-300 mb-2">
            Game Date
          </label>
          <input
            id="date-input"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-base bg-gray-800 text-gray-100"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="game-number-input" className="block text-sm font-medium text-gray-300 mb-2">
            Game Number
          </label>
          <input
            id="game-number-input"
            type="number"
            min="1"
            value={gameNumber}
            onChange={(e) => setGameNumber(parseInt(e.target.value) || 1)}
            className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-base bg-gray-800 text-gray-100"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 bg-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-600 active:bg-blue-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

