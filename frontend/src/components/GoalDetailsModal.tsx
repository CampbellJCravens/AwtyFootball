import { useState } from 'react';
import { GoalQualifier, GOAL_QUALIFIERS, GOAL_QUALIFIER_LABELS } from '../api/games';

interface GoalDetailsModalProps {
  /** Already-rendered description of the goal, so the sheet says what it is editing. */
  summary: string;
  initialQualifiers?: GoalQualifier[];
  onSave: (qualifiers: GoalQualifier[]) => void;
  onClose: () => void;
}

/**
 * Tags-only editor for a goal that is already recorded.
 *
 * The qualifiers ride along on the assist sheet when a goal is first entered,
 * but changing them afterwards used to mean re-picking the scorer AND the
 * assister — three screens to add "Header" to a goal that was already right.
 * This edits nothing but the tags, so nobody can lose an assist to a typo.
 */
export default function GoalDetailsModal({ summary, initialQualifiers, onSave, onClose }: GoalDetailsModalProps) {
  const [qualifiers, setQualifiers] = useState<GoalQualifier[]>(initialQualifiers ?? []);

  const toggle = (q: GoalQualifier) =>
    setQualifiers(prev => (prev.includes(q) ? prev.filter(x => x !== q) : [...prev, q]));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-modal max-w-md w-full max-h-[80vh] flex flex-col border border-border">
        <div className="p-6 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-semibold text-text-primary">Goal details</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-raised text-text-secondary"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-text-tertiary">{summary}</p>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-sm text-text-secondary mb-3">
            Tag as many as apply — a corner met with a header is both. Tags are
            descriptive only and never change the score.
          </p>
          <div className="flex flex-wrap gap-2">
            {GOAL_QUALIFIERS.map(q => {
              const on = qualifiers.includes(q);
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => toggle(q)}
                  aria-pressed={on}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    on
                      ? 'bg-accent text-text-on-accent border-accent'
                      : 'bg-surface-raised text-text-secondary border-border-emphasis hover:bg-surface-hover'
                  }`}
                >
                  {GOAL_QUALIFIER_LABELS[q]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6 border-t border-border flex-shrink-0 flex items-center justify-between gap-3">
          <button
            onClick={() => setQualifiers([])}
            disabled={qualifiers.length === 0}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-40"
          >
            Clear all
          </button>
          <button
            onClick={() => { onSave(qualifiers); onClose(); }}
            className="px-6 py-2 bg-accent text-text-on-accent text-sm font-semibold rounded-xl"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
