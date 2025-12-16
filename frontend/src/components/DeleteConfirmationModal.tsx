interface DeleteConfirmationModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  message?: string;
  itemType?: string; // e.g., "game", "player", etc. (deprecated, use message instead)
}

export default function DeleteConfirmationModal({ onConfirm, onCancel, message, itemType = 'game' }: DeleteConfirmationModalProps) {
  const displayMessage = message || `Are you sure you want to delete this ${itemType}?`;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">
          {displayMessage}
        </h3>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            No
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 active:bg-red-800 transition-colors"
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}

