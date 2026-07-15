import { GameField } from '../api/games';

interface Props {
  onSelect: (field: GameField | null) => void;
  onSkip: () => void;
}

const OPTIONS: { value: GameField; label: string }[] = [
  { value: 'stadium', label: 'Stadium' },
  { value: 'grass', label: 'Grass' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * Shown right after creating a new game so the field is set up front (easy to
 * forget otherwise). "Decide later" leaves it unset.
 */
export default function FieldPickerModal({ onSelect, onSkip }: Props) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
      <div className="bg-surface rounded-2xl border border-border shadow-modal w-full max-w-sm p-5">
        <h3 className="text-lg font-semibold text-text-primary mb-1">Where's this game?</h3>
        <p className="text-sm text-text-tertiary mb-4">Set the field now so it shows on the schedule and the poll.</p>
        <div className="space-y-2">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => onSelect(o.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-raised border border-border-emphasis text-text-primary font-semibold hover:bg-surface-active transition-colors text-left"
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          onClick={onSkip}
          className="w-full mt-3 px-4 py-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
        >
          Decide later
        </button>
      </div>
    </div>
  );
}
