import { useState } from 'react';
import { Game } from '../api/games';
import {
  toDateInputValue,
  toTimeInputValue,
  fromDateAndTimeInput,
} from '../utils/gameSchedule';

interface NewGameConflictModalProps {
  conflictingGame: Game;
  defaultKickoff: Date;
  onCancel: () => void;
  // Re-attempt with a new datetime. If this also conflicts, the parent will
  // re-open the modal pointing at the new conflict.
  onCreateAt: (when: Date) => Promise<void> | void;
  // Delete the conflicting game then create the new one at the original
  // default kickoff.
  onDeleteAndCreate: () => Promise<void> | void;
}

const formatLong = (d: Date) =>
  d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export default function NewGameConflictModal({
  conflictingGame,
  defaultKickoff,
  onCancel,
  onCreateAt,
  onDeleteAndCreate,
}: NewGameConflictModalProps) {
  const [mode, setMode] = useState<'choose' | 'pick' | 'confirm-delete'>('choose');
  const [busy, setBusy] = useState(false);
  const [dateValue, setDateValue] = useState(() => toDateInputValue(defaultKickoff));
  const [timeValue, setTimeValue] = useState(() => toTimeInputValue(defaultKickoff));

  const conflictDate = new Date(conflictingGame.createdAt);

  const handlePickCreate = async () => {
    const when = fromDateAndTimeInput(dateValue, timeValue);
    setBusy(true);
    try {
      await onCreateAt(when);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    setBusy(true);
    try {
      await onDeleteAndCreate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-modal max-w-md w-full border border-border">
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Time slot already booked</h3>
            <p className="text-xs text-text-tertiary mt-1">
              Game #{conflictingGame.gameNumber ?? '?'} is already at {formatLong(conflictDate)}.
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={busy}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3">
          {mode === 'choose' && (
            <>
              <p className="text-sm text-text-secondary">
                Are you sure you want to create another game? You can pick a different time, or
                delete the existing game first.
              </p>
              <div className="space-y-2 pt-1">
                <button
                  onClick={() => setMode('pick')}
                  className="w-full px-4 py-3 rounded-xl bg-accent text-text-on-accent font-semibold hover:bg-accent-hover transition-colors text-sm"
                >
                  Pick a different date / time
                </button>
                <button
                  onClick={() => setMode('confirm-delete')}
                  className="w-full px-4 py-3 rounded-xl bg-surface-raised text-text-primary font-medium hover:bg-surface-active transition-colors text-sm border border-border-emphasis"
                >
                  Delete existing game & create new
                </button>
                <button
                  onClick={onCancel}
                  className="w-full px-4 py-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {mode === 'pick' && (
            <>
              <p className="text-xs text-text-tertiary">
                Pre-filled with the default. Adjust as needed.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Date</label>
                  <input
                    type="date"
                    value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)}
                    disabled={busy}
                    className="w-full px-3 py-2 bg-surface-raised border border-border-emphasis rounded-lg text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Time</label>
                  <input
                    type="time"
                    value={timeValue}
                    onChange={(e) => setTimeValue(e.target.value)}
                    disabled={busy}
                    className="w-full px-3 py-2 bg-surface-raised border border-border-emphasis rounded-lg text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setMode('choose')}
                  disabled={busy}
                  className="flex-1 px-4 py-2 text-sm bg-surface-raised text-text-primary rounded-xl hover:bg-surface-active disabled:opacity-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handlePickCreate}
                  disabled={busy}
                  className="flex-1 px-4 py-2 text-sm bg-accent text-text-on-accent font-semibold rounded-xl hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Creating…' : 'Create at this time'}
                </button>
              </div>
            </>
          )}

          {mode === 'confirm-delete' && (
            <>
              <p className="text-sm text-text-secondary">
                Delete <span className="text-text-primary font-semibold">Game #{conflictingGame.gameNumber ?? '?'}</span> and replace it with the new game?
                This can't be undone.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setMode('choose')}
                  disabled={busy}
                  className="flex-1 px-4 py-2 text-sm bg-surface-raised text-text-primary rounded-xl hover:bg-surface-active disabled:opacity-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={busy}
                  className="flex-1 px-4 py-2 text-sm bg-error text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Working…' : 'Delete & create'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
