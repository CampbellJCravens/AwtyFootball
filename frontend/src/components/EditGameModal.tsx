import { useState, useEffect } from 'react';
import { GameField } from '../api/games';
import {
  toDateInputValue,
  toTimeInputValue,
  fromDateAndTimeInput,
} from '../utils/gameSchedule';

interface EditGameModalProps {
  currentDate: string; // ISO date string
  currentGameNumber: number | null;
  currentField: GameField | null;
  onSelect: (updates: { dateIso: string; gameNumber: number; field: GameField | null }) => void;
  onClose: () => void;
  onTriggerImport?: () => void; // optional admin-only entry point to CSV import
}

const FIELD_OPTIONS: { value: GameField | ''; label: string }[] = [
  { value: '', label: 'N/A FIELD' },
  { value: 'stadium', label: 'Stadium' },
  { value: 'grass', label: 'Grass' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function EditGameModal({
  currentDate,
  currentGameNumber,
  currentField,
  onSelect,
  onClose,
  onTriggerImport,
}: EditGameModalProps) {
  const initial = new Date(currentDate);
  const [dateValue, setDateValue] = useState(() => toDateInputValue(initial));
  const [timeValue, setTimeValue] = useState(() => toTimeInputValue(initial));
  const [gameNumber, setGameNumber] = useState<number>(currentGameNumber || 1);
  const [field, setField] = useState<GameField | ''>(currentField ?? '');

  useEffect(() => {
    if (currentGameNumber !== null) setGameNumber(currentGameNumber);
  }, [currentGameNumber]);

  const handleSave = () => {
    const date = fromDateAndTimeInput(dateValue, timeValue);
    onSelect({
      dateIso: date.toISOString(),
      gameNumber,
      field: field === '' ? null : field,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-modal max-w-md w-full p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-text-primary">Edit Game</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover active:bg-surface-active transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Date</label>
            <input
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="w-full px-3 py-2 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Time</label>
            <input
              type="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              className="w-full px-3 py-2 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-text-secondary mb-2">Field</label>
          <select
            value={field}
            onChange={(e) => setField(e.target.value as GameField | '')}
            className="w-full px-3 py-2 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary"
          >
            {FIELD_OPTIONS.map(opt => (
              <option key={opt.label} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-text-secondary mb-2">Game Number</label>
          <input
            type="number"
            min="1"
            value={gameNumber}
            onChange={(e) => setGameNumber(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-border-emphasis text-text-secondary rounded-xl font-medium hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 bg-accent text-text-on-accent px-4 py-2 rounded-xl font-medium hover:bg-accent-hover active:bg-accent-active transition-colors"
          >
            Save
          </button>
        </div>

        {onTriggerImport && (
          <div className="mt-6 pt-6 border-t border-border">
            <button
              onClick={onTriggerImport}
              className="w-full px-4 py-2.5 border-2 border-border-emphasis text-text-secondary rounded-xl font-medium hover:bg-surface-hover transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 12l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Import from CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
