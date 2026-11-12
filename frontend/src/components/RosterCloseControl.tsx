import { useState } from 'react';
import { setRosterClose } from '../api/dues';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const nice = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Declares the year's roster final. From that day Response% and Show% on Field
// Stats use this roster; goals, awards and reports stay on the calendar year.
export default function RosterCloseControl({
  year, closedAt, size, onChanged, onError,
}: {
  year: number;
  closedAt: string | null;
  size: number;
  onChanged: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(closedAt ? closedAt.slice(0, 10) : today());
  const [busy, setBusy] = useState(false);

  const save = async (value: string | null) => {
    setBusy(true);
    try {
      await setRosterClose(year, value);
      setEditing(false);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update the roster close');
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-3 border border-border rounded-xl bg-surface/40 px-3 py-2.5">
        <p className="text-sm text-text-primary flex-1">
          {closedAt
            ? <>Roster closed <span className="font-semibold">{nice(closedAt)}</span> · {size} members</>
            : <>The {year} roster is still open · {size} members</>}
        </p>
        <button
          onClick={() => { setDate(closedAt ? closedAt.slice(0, 10) : today()); setEditing(true); }}
          className="text-xs font-semibold text-gold"
        >
          {closedAt ? 'Change' : `Close the ${year} roster`}
        </button>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl bg-surface/40 px-3 py-2.5 space-y-2">
      <p className="text-sm text-text-primary">
        Games from this date are measured against the {year} roster ({size} members) for Resp% and Show%.
        Goals, awards and reports stay on the calendar year.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text-primary"
        />
        <button
          onClick={() => save(date)}
          disabled={busy || !date}
          className="rounded-lg bg-gold px-3 py-1 text-sm font-semibold text-black disabled:opacity-50"
        >
          {busy ? 'Saving…' : closedAt ? 'Save date' : 'Close roster'}
        </button>
        {closedAt && (
          <button onClick={() => save(null)} disabled={busy} className="text-xs text-text-secondary underline">
            Re-open
          </button>
        )}
        <button onClick={() => setEditing(false)} disabled={busy} className="text-xs text-text-tertiary">
          Cancel
        </button>
      </div>
    </div>
  );
}
