import { useState, FormEvent } from 'react';
import { PAYMENT_METHODS, recordDuesPayment } from '../api/dues';

interface RecordPaymentModalProps {
  duesYear: number;
  name: string;
  balance: string; // what's left; pre-fills the amount
  playerId?: string;
  guestId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const METHOD_LABELS: Record<string, string> = {
  venmo: 'Venmo', cash: 'Cash', paypal: 'PayPal', zelle: 'Zelle', other: 'Other',
};

const today = () => new Date().toISOString().slice(0, 10);

// Recording an installment is the same action as recording a full payment —
// the amount just defaults to whatever is still outstanding.
export default function RecordPaymentModal({
  duesYear, name, balance, playerId, guestId, onClose, onSaved,
}: RecordPaymentModalProps) {
  const outstanding = Math.max(0, Number(balance));
  const [amount, setAmount] = useState(outstanding > 0 ? outstanding.toFixed(2) : '');
  const [method, setMethod] = useState<string>('venmo');
  const [paidAt, setPaidAt] = useState(today());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount);
  const isPartial = amountNum > 0 && outstanding > 0 && amountNum < outstanding;
  const isOver = amountNum > 0 && outstanding > 0 && amountNum > outstanding;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!(amountNum > 0)) { setError('Enter an amount greater than zero.'); return; }
    setSaving(true);
    setError(null);
    try {
      await recordDuesPayment({
        duesYear, playerId, guestId,
        amount: amountNum.toFixed(2),
        method,
        paidAt: new Date(`${paidAt}T12:00:00`).toISOString(),
        note: note.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Record payment</h2>
            <p className="text-sm text-text-tertiary">
              {name} · {duesYear}
              {outstanding > 0 && <> · <span className="tabular-nums">${outstanding.toFixed(2)}</span> outstanding</>}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">$</span>
              <input
                type="number" step="0.01" min="0.01" inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                autoFocus
                className="w-full bg-surface-raised border border-border-emphasis rounded-xl pl-7 pr-3 py-2.5 text-text-primary tabular-nums outline-none focus:border-accent"
              />
            </div>
            {isPartial && (
              <p className="text-xs text-text-tertiary mt-1.5">
                Part payment — ${(outstanding - amountNum).toFixed(2)} will remain outstanding.
              </p>
            )}
            {isOver && (
              <p className="text-xs text-warning mt-1.5">
                ${(amountNum - outstanding).toFixed(2)} more than owed. It will be recorded as an overpayment, not discarded.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">Method</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m} type="button" onClick={() => setMethod(m)}
                  className={`px-2 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    method === m
                      ? 'bg-accent text-text-on-accent border-accent'
                      : 'bg-surface-raised text-text-secondary border-border-emphasis hover:bg-surface-hover'
                  }`}
                >
                  {METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">Date</label>
            <input
              type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)}
              className="w-full bg-surface-raised border border-border-emphasis rounded-xl px-3 py-2.5 text-text-primary outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Note <span className="normal-case tracking-normal text-text-tertiary">(optional)</span>
            </label>
            <input
              type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. second instalment"
              className="w-full bg-surface-raised border border-border-emphasis rounded-xl px-3 py-2.5 text-text-primary text-sm outline-none focus:border-accent placeholder:text-text-tertiary"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-raised text-text-secondary border border-border-emphasis hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-text-on-accent disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
