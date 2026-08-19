import { useCallback, useEffect, useMemo, useState } from 'react';
import { Player } from '../api/players';
import {
  DuesGuestRow, DuesMemberRow, DuesStatus, DuesYearNotConfigured, DuesYearReport,
  addDuesEntry, deleteDuesPayment, fetchDuesReport, fetchDuesYears, isCollectionWindow,
  markDuesEntriesLeft, markDuesEntryLeft, openDuesYear, saveDuesConfig, updateDuesEntry,
} from '../api/dues';
import RecordPaymentModal from './RecordPaymentModal';
import AddDuesEntryModal from './AddDuesEntryModal';

// The October collection, on one page. Sorted by what's outstanding so the
// chase list is the top of the list, and part-payers read as part-payers rather
// than being lumped in with people who haven't answered at all.

const money = (v: string) => {
  const n = Number(v);
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

const STATUS_LABEL: Record<DuesStatus, string> = {
  left: 'Left', exempt: 'Alumni', unpaid: 'No payment', partial: 'Part paid', paid: 'Paid', overpaid: 'Overpaid',
};

const STATUS_CLASS: Record<DuesStatus, string> = {
  left: 'bg-surface-raised text-text-tertiary',
  exempt: 'bg-info-bg text-info',
  unpaid: 'bg-surface-raised text-text-tertiary',
  partial: 'bg-warning-bg text-warning',
  paid: 'bg-success-bg text-success',
  overpaid: 'bg-info-bg text-info',
};

// 'active' is everyone still in the group. Leavers are settled and gone, so
// they sit behind their own chip instead of padding the working list.
type Filter = 'active' | 'owing' | 'partial' | 'paid' | 'exempt' | 'left';

const currentDuesYear = () => new Date().getFullYear();

export default function DuesTab({ players }: { players: Player[] }) {
  const [year, setYear] = useState(currentDuesYear());
  const [report, setReport] = useState<DuesYearReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paying, setPaying] = useState<{ name: string; balance: string; playerId?: string; guestId?: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingRates, setEditingRates] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [configuredYears, setConfiguredYears] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    setError(null);
    setNeedsSetup(false);
    try {
      setReport(await fetchDuesReport(y));
    } catch (err) {
      if (err instanceof DuesYearNotConfigured) { setNeedsSetup(true); setReport(null); }
      else setError(err instanceof Error ? err.message : 'Failed to load dues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(year); }, [year, load]);

  // Which years exist at all, so the page can notice that collection has opened
  // and the year ahead has not. Nothing else reminds him — there is no cron in
  // this app, and a dues year only exists once someone opens it by hand.
  useEffect(() => {
    fetchDuesYears()
      .then(rows => setConfiguredYears(rows.map(r => r.duesYear)))
      .catch(() => setConfiguredYears([]));
  }, [report]);

  const nextYearNeedsOpening = useMemo(() => {
    if (!isCollectionWindow()) return null;
    const next = new Date().getFullYear() + 1;
    return configuredYears.includes(next) ? null : next;
  }, [configuredYears]);

  const matches = useCallback((status: DuesStatus) => {
    if (filter === 'active') return status !== 'left';
    if (filter === 'owing') return status === 'unpaid' || status === 'partial';
    if (filter === 'partial') return status === 'partial';
    if (filter === 'paid') return status === 'paid' || status === 'overpaid';
    if (filter === 'left') return status === 'left';
    return status === 'exempt';
  }, [filter]);

  const members = useMemo(
    () => (report ? report.members.filter(m => matches(m.status)) : []),
    [report, matches]
  );

  const collectedPct = useMemo(() => {
    if (!report) return 0;
    const target = Number(report.targetAmount);
    if (!(target > 0)) return 0;
    return Math.min(100, Math.round((Number(report.totals.amountCollected) / target) * 100));
  }, [report]);

  if (loading) return <div className="text-center py-8 text-text-tertiary text-sm">Loading dues…</div>;

  if (needsSetup) return <SetupYear year={year} onDone={() => load(year)} onYearChange={setYear} />;

  if (error) {
    return <div className="p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{error}</div>;
  }
  if (!report) return null;

  const filterButton = (key: Filter, label: string, count: number) => (
    <button
      onClick={() => setFilter(key)}
      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
        filter === key ? 'bg-accent text-text-on-accent' : 'bg-surface-raised text-text-secondary hover:bg-surface-hover'
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );

  const adjustOwed = async (m: DuesMemberRow) => {
    const raw = window.prompt(`What should ${m.name} owe for ${year}?`, Number(m.amountOwed).toFixed(2));
    if (raw === null) return;
    const n = Number(raw);
    if (Number.isNaN(n) || n < 0) { setError('Amount must be a non-negative number.'); return; }
    setBusy(true);
    try {
      await updateDuesEntry(m.entryId, { amountOwed: n.toFixed(2) });
      await load(year);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally { setBusy(false); }
  };

  const editNote = async (m: DuesMemberRow) => {
    const raw = window.prompt(`Note for ${m.name} (${year})`, m.note ?? '');
    if (raw === null) return;
    setBusy(true);
    try {
      await updateDuesEntry(m.entryId, { note: raw.trim() || null });
      await load(year);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally { setBusy(false); }
  };

  // Dues are kept, not refunded — people leave the city and usually say so
  // late. So the confirm states plainly what is being kept, and points at the
  // only refund mechanism there is rather than pretending to offer one.
  const markLeft = async (m: DuesMemberRow) => {
    const kept = Number(m.amountPaid);
    const message = kept > 0
      ? `Mark ${m.name} as having left?\n\nKeeping the ${money(m.amountPaid)} they have paid — their balance goes to zero and they come off next year's roster.\n\nRefunding instead? Delete the payment first, then mark them Left.`
      : `Mark ${m.name} as having left?\n\nThey come off the ${year} bill and off next year's roster.`;
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      await markDuesEntryLeft(m.entryId);
      await load(year);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as left');
    } finally { setBusy(false); }
  };

  const bringBack = async (m: DuesMemberRow) => {
    if (!window.confirm(`Bring ${m.name} back into ${year}?\n\nThey go back on the roster and are billed ${money(report.memberAmount)}, less anything already paid.`)) return;
    setBusy(true);
    try {
      await addDuesEntry(year, {
        playerId: m.playerId,
        amountOwed: report.memberAmount,
        joinedAt: new Date().toISOString(),
      });
      await load(year);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bring them back');
    } finally { setBusy(false); }
  };

  const removePayment = async (paymentId: string) => {
    if (!window.confirm('Delete this payment? The balance will go back up.')) return;
    setBusy(true);
    try {
      await deleteDuesPayment(paymentId);
      await load(year);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete payment');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {/* Rates + progress */}
      <div className="border border-border rounded-xl bg-surface/40 p-3 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-surface border border-border text-text-primary text-sm font-semibold rounded-lg px-2 py-1.5 outline-none cursor-pointer"
            >
              {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {/* The rates were only editable while the year had no config row at
                all, so a figure announced differently later had nowhere to go. */}
            <button
              onClick={() => setEditingRates(v => !v)}
              className="text-[11px] text-text-tertiary hover:text-text-secondary underline decoration-dotted underline-offset-2"
            >
              ${Number(report.memberAmount).toFixed(0)}/member · ${Number(report.guestGameRate).toFixed(0)}/guest game
            </button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setAdding(true)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-accent text-text-on-accent"
            >
              Add someone
            </button>
            {report.totals.unpaid > 0 && (
              <button
                onClick={() => setSweeping(true)}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-raised text-text-secondary border border-border-emphasis hover:bg-surface-hover"
              >
                Close out
              </button>
            )}
            <button
              onClick={async () => {
                setBusy(true);
                try { const r = await openDuesYear(year); await load(year);
                  if (r.added === 0) setError(null);
                } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
                finally { setBusy(false); }
              }}
              disabled={busy}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-raised text-text-secondary border border-border-emphasis hover:bg-surface-hover disabled:opacity-50"
            >
              Sync roster
            </button>
          </div>
        </div>

        {editingRates && (
          <RatesEditor
            year={year}
            report={report}
            billable={report.totals.billed}
            onClose={() => setEditingRates(false)}
            onSaved={() => { setEditingRates(false); load(year); }}
          />
        )}

        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-lg font-semibold text-text-primary tabular-nums">
              {money(report.totals.amountCollected)}
            </span>
            <span className="text-[11px] text-text-tertiary tabular-nums">
              of {money(report.targetAmount)} target · {collectedPct}%
            </span>
          </div>
          <div className="h-2 bg-surface-raised rounded-full overflow-hidden">
            <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${collectedPct}%` }} />
          </div>
          <p className="text-[11px] text-text-tertiary mt-1.5 tabular-nums">
            {money(report.totals.amountOutstanding)} still owed by {report.totals.unpaid + report.totals.partPaid} people
            {Number(report.totals.amountOverpaid) > 0 && ` · ${money(report.totals.amountOverpaid)} overpaid`}
          </p>
        </div>
      </div>

      {/* Collection opens in October for the year ahead, and nothing in this app
          runs on a clock — a dues year exists only once someone opens it. */}
      {nextYearNeedsOpening && (
        <div className="flex items-center gap-3 border border-warning-border bg-warning-bg rounded-xl px-3 py-2.5">
          <p className="text-sm text-text-primary flex-1">
            Collection is open — <span className="font-semibold">{nextYearNeedsOpening}</span> hasn't been set up yet.
          </p>
          <button
            onClick={() => setYear(nextYearNeedsOpening)}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-accent text-text-on-accent shrink-0"
          >
            Set up {nextYearNeedsOpening}
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{error}</div>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {filterButton('active', 'Active', report.members.length - report.totals.left)}
        {filterButton('owing', 'Owing', report.totals.unpaid + report.totals.partPaid)}
        {filterButton('partial', 'Part paid', report.totals.partPaid)}
        {filterButton('paid', 'Paid', report.totals.paidInFull)}
        {filterButton('exempt', 'Alumni', report.totals.exempt)}
        {report.totals.left > 0 && filterButton('left', 'Left', report.totals.left)}
      </div>

      {members.length === 0 ? (
        <div className="text-center py-8 text-text-tertiary text-sm">Nobody in this group.</div>
      ) : (
        <div className="space-y-1.5">
          {members.map(m => {
            const isOpen = expanded === m.entryId;
            return (
              <div key={m.entryId} className="border border-border rounded-xl bg-surface/40 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : m.entryId)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary truncate">{m.name}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_CLASS[m.status]}`}>
                        {STATUS_LABEL[m.status]}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-tertiary tabular-nums">
                      {m.status === 'left'
                        ? <>Left {fmtDate(m.leftAt)}{Number(m.amountPaid) > 0 && ` · kept ${money(m.amountPaid)}`}</>
                        : m.status === 'exempt'
                          ? 'Not billed'
                          : <>{money(m.amountPaid)} of {money(m.amountOwed)}{m.joinedAt && ` · joined ${fmtDate(m.joinedAt)}`}</>}
                      {m.memberSince && ` · since ${m.memberSince}`}
                    </div>
                    {m.note && <div className="text-[11px] text-text-tertiary italic truncate">{m.note}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-semibold tabular-nums ${
                      Number(m.balance) > 0 ? 'text-text-primary' : Number(m.balance) < 0 ? 'text-info' : 'text-text-tertiary'
                    }`}>
                      {m.status === 'exempt' || m.status === 'left' ? '—' : money(m.balance)}
                    </div>
                    {m.payments.length > 1 && (
                      <div className="text-[10px] text-text-tertiary">{m.payments.length} payments</div>
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border px-3 py-2.5 space-y-2">
                    {m.payments.length > 0 && (
                      <div className="space-y-1">
                        {m.payments.map(p => (
                          <div key={p.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-text-secondary">
                              <span className="tabular-nums font-medium">{money(p.amount)}</span>
                              {' · '}{p.method}{' · '}{fmtDate(p.paidAt)}
                              {p.note && <span className="text-text-tertiary italic"> — {p.note}</span>}
                            </span>
                            <button onClick={() => removePayment(p.id)} disabled={busy}
                              className="text-text-tertiary hover:text-error shrink-0">Delete</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1.5 flex-wrap">
                      {m.status === 'left' ? (
                        <button onClick={() => bringBack(m)} disabled={busy}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-accent text-text-on-accent disabled:opacity-50">
                          Bring back
                        </button>
                      ) : (
                        <button
                          onClick={() => setPaying({ name: m.name, balance: m.balance, playerId: m.playerId })}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-accent text-text-on-accent"
                        >
                          Record payment
                        </button>
                      )}
                      <button onClick={() => adjustOwed(m)} disabled={busy}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-raised text-text-secondary border border-border-emphasis hover:bg-surface-hover">
                        Change amount
                      </button>
                      <button onClick={() => editNote(m)} disabled={busy}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-raised text-text-secondary border border-border-emphasis hover:bg-surface-hover">
                        {m.note ? 'Edit note' : 'Add note'}
                      </button>
                      {m.status !== 'left' && (
                        <button onClick={() => markLeft(m)} disabled={busy}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-raised text-text-tertiary border border-border-emphasis hover:bg-surface-hover hover:text-error">
                          Left
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {report.guests.length > 0 && <GuestSection guests={report.guests} onPay={setPaying} />}

      {paying && (
        <RecordPaymentModal
          duesYear={year}
          name={paying.name}
          balance={paying.balance}
          playerId={paying.playerId}
          guestId={paying.guestId}
          onClose={() => setPaying(null)}
          onSaved={() => { setPaying(null); load(year); }}
        />
      )}

      {sweeping && (
        <SweepModal
          duesYear={year}
          unpaid={report.members.filter(m => m.status === 'unpaid')}
          onClose={() => setSweeping(false)}
          onSaved={() => { setSweeping(false); load(year); }}
        />
      )}

      {adding && (
        <AddDuesEntryModal
          duesYear={year}
          memberAmount={report.memberAmount}
          members={report.members}
          players={players}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load(year); }}
          onSwitchYear={setYear}
        />
      )}
    </div>
  );
}

// Staying on the roster is the default and only leaving is an action, so
// someone who never paid and never said they were going rolls silently into
// next year's bill. This is the one pass that catches them — nothing else does.
//
// Nobody is pre-selected. The people on this list are exactly the ones who
// might be mid-conversation about paying, and sweeping one of those by accident
// is a worse mistake than the extra tap.
function SweepModal({
  duesYear, unpaid, onClose, onSaved,
}: {
  duesYear: number;
  unpaid: DuesMemberRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allPicked = picked.size === unpaid.length && unpaid.length > 0;

  const submit = async () => {
    if (picked.size === 0) { setError('Nobody selected.'); return; }
    setSaving(true);
    setError(null);
    try {
      await markDuesEntriesLeft(duesYear, [...picked]);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close out the year');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Close out {duesYear}</h2>
            <p className="text-sm text-text-tertiary">
              {unpaid.length} {unpaid.length === 1 ? 'person has' : 'people have'} paid nothing for {duesYear}.
              Marking them Left takes them off next year's roster. Part-payers are never listed here.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{error}</div>
          )}

          <button
            onClick={() => setPicked(allPicked ? new Set() : new Set(unpaid.map(m => m.entryId)))}
            className="text-xs font-medium text-text-secondary hover:text-text-primary underline decoration-dotted underline-offset-2"
          >
            {allPicked ? 'Clear all' : 'Select all'}
          </button>

          <div className="space-y-1">
            {unpaid.map(m => (
              <button
                key={m.entryId} onClick={() => toggle(m.entryId)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                  picked.has(m.entryId)
                    ? 'bg-surface-active border-border-emphasis'
                    : 'bg-surface-raised border-transparent hover:bg-surface-hover'
                }`}
              >
                <span className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                  picked.has(m.entryId) ? 'bg-accent border-accent' : 'border-border-emphasis'
                }`}>
                  {picked.has(m.entryId) && (
                    <svg className="w-3 h-3 text-text-on-accent" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-sm text-text-primary flex-1 truncate">{m.name}</span>
                <span className="text-[11px] text-text-tertiary tabular-nums shrink-0">
                  owes {money(m.amountOwed)}
                </span>
              </button>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-raised text-text-secondary border border-border-emphasis hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              onClick={submit} disabled={saving || picked.size === 0}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-text-on-accent disabled:opacity-50"
            >
              {saving ? 'Marking…' : `Mark ${picked.size} Left`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// The rates were entered once at setup and then became read-only text, so a
// figure announced differently later had nowhere to go. Changing them does not
// re-price anyone: amountOwed is captured per person, which is what lets alumni
// sit at zero and hand-adjusted figures survive.
function RatesEditor({
  year, report, billable, onClose, onSaved,
}: {
  year: number;
  report: DuesYearReport;
  billable: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [targetAmount, setTargetAmount] = useState(Number(report.targetAmount).toFixed(2));
  const [memberAmount, setMemberAmount] = useState(Number(report.memberAmount).toFixed(2));
  const [guestGameRate, setGuestGameRate] = useState(Number(report.guestGameRate).toFixed(2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Target ÷ heads is what the per-member figure gets rounded from, never what
  // it is derived as — payers aren't known until the collection ends.
  const perHead = billable > 0 ? Number(targetAmount) / billable : null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveDuesConfig(year, { targetAmount, memberAmount, guestGameRate });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rates');
      setSaving(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void) => (
    <div className="flex-1 min-w-[6rem]">
      <label className="block text-[10px] font-medium text-text-tertiary uppercase tracking-wide mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary text-sm">$</span>
        <input
          type="number" step="1" min="0" inputMode="decimal" value={value}
          onChange={e => set(e.target.value)}
          className="w-full bg-surface-raised border border-border-emphasis rounded-lg pl-6 pr-2 py-1.5 text-sm text-text-primary tabular-nums outline-none focus:border-accent"
        />
      </div>
    </div>
  );

  return (
    <div className="border-t border-border pt-3 space-y-2">
      {error && <div className="p-2 bg-error-bg border border-error-border rounded-lg text-error text-xs">{error}</div>}
      <div className="flex gap-2">
        {field('Target', targetAmount, setTargetAmount)}
        {field('Per member', memberAmount, setMemberAmount)}
        {field('Per guest game', guestGameRate, setGuestGameRate)}
      </div>
      {perHead !== null && (
        <p className="text-[11px] text-text-tertiary tabular-nums">
          ${Number(targetAmount).toFixed(0)} ÷ {billable} billable = ${perHead.toFixed(2)} a head.
          {' '}Announce a round number near it — the figure you enter is what everyone owes.
        </p>
      )}
      <p className="text-[11px] text-text-tertiary">
        Changing these does not re-price anyone already on the {year} list. Use “Change amount” on a row for that.
      </p>
      <div className="flex gap-1.5">
        <button onClick={save} disabled={saving}
          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-accent text-text-on-accent disabled:opacity-50">
          {saving ? 'Saving…' : 'Save rates'}
        </button>
        <button onClick={onClose}
          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-raised text-text-secondary border border-border-emphasis hover:bg-surface-hover">
          Cancel
        </button>
      </div>
    </div>
  );
}

// Guests bill per game with no ceiling. Once a balance passes what membership
// costs, converting is the cheaper option for them — which is the whole point
// of leaving it uncapped, so the page says so rather than leaving it to memory.
type GuestFilter = 'all' | 'owing' | 'partial' | 'paid' | 'convert';

function GuestSection({
  guests, onPay,
}: {
  guests: DuesGuestRow[];
  onPay: (p: { name: string; balance: string; guestId: string }) => void;
}) {
  // Guests get their own chips rather than sharing the member row's: alumni and
  // left have no meaning for a guest, and "about to be worth converting" is the
  // one bucket that matters here and nowhere else.
  const [filter, setFilter] = useState<GuestFilter>('all');
  const convert = guests.filter(g => g.shouldConvert);

  const shown = guests.filter(g => {
    if (filter === 'all') return true;
    if (filter === 'convert') return g.shouldConvert;
    if (filter === 'owing') return g.status === 'unpaid' || g.status === 'partial';
    if (filter === 'partial') return g.status === 'partial';
    return g.status === 'paid' || g.status === 'overpaid';
  });

  const chip = (key: GuestFilter, label: string, count: number) => (
    <button
      onClick={() => setFilter(key)}
      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
        filter === key ? 'bg-accent text-text-on-accent' : 'bg-surface-raised text-text-secondary hover:bg-surface-hover'
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="space-y-2 pt-2">
      <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Guests</h3>

      {convert.map(g => (
        <div key={g.guestId} className="border border-warning-border bg-warning-bg rounded-xl px-3 py-2.5">
          <p className="text-sm text-text-primary">
            <span className="font-semibold">{g.name}</span> — {g.billableVisits} billable game
            {g.billableVisits === 1 ? '' : 's'} · <span className="tabular-nums">{money(g.balance)}</span> owed
          </p>
          <p className="text-[11px] text-text-secondary">Past what membership costs. Worth suggesting they join.</p>
        </div>
      ))}

      <div className="flex gap-1.5 flex-wrap">
        {chip('all', 'All', guests.length)}
        {chip('owing', 'Owing', guests.filter(g => g.status === 'unpaid' || g.status === 'partial').length)}
        {chip('partial', 'Part paid', guests.filter(g => g.status === 'partial').length)}
        {chip('paid', 'Paid', guests.filter(g => g.status === 'paid' || g.status === 'overpaid').length)}
        {convert.length > 0 && chip('convert', 'Convert', convert.length)}
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-4 text-text-tertiary text-sm">No guests in this group.</div>
      ) : (
      <div className="space-y-1.5">
        {shown.map(g => (
          <div key={g.guestId} className="flex items-center gap-3 border border-border rounded-xl bg-surface/40 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-text-primary truncate">{g.name}</div>
              <div className="text-[11px] text-text-tertiary tabular-nums">
                {g.visits} visit{g.visits === 1 ? '' : 's'} · {g.billableVisits} billable
                {Number(g.amountPaid) > 0 && ` · ${money(g.amountPaid)} paid`}
              </div>
            </div>
            <div className="text-sm font-semibold tabular-nums text-text-primary shrink-0">{money(g.balance)}</div>
            {Number(g.balance) > 0 && (
              <button
                onClick={() => onPay({ name: g.name, balance: g.balance, guestId: g.guestId })}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-accent text-text-on-accent shrink-0"
              >
                Pay
              </button>
            )}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

// A year nobody has set up shows this instead of an empty page that could be
// mistaken for "everyone has paid".
function SetupYear({
  year, onDone, onYearChange,
}: {
  year: number;
  onDone: () => void;
  onYearChange: (y: number) => void;
}) {
  const [targetAmount, setTargetAmount] = useState('6000');
  const [memberAmount, setMemberAmount] = useState('150');
  const [guestGameRate, setGuestGameRate] = useState('30');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveDuesConfig(year, { targetAmount, memberAmount, guestGameRate });
      await openDuesYear(year);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up the year');
      setSaving(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, hint: string) => (
    <div>
      <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">$</span>
        <input
          type="number" step="1" min="0" inputMode="decimal" value={value}
          onChange={e => set(e.target.value)}
          className="w-full bg-surface-raised border border-border-emphasis rounded-xl pl-7 pr-3 py-2.5 text-text-primary tabular-nums outline-none focus:border-accent"
        />
      </div>
      <p className="text-[11px] text-text-tertiary mt-1">{hint}</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="max-w-md mx-auto space-y-4 py-4">
      <div className="flex items-center gap-2">
        <select
          value={year}
          onChange={e => onYearChange(Number(e.target.value))}
          className="bg-surface border border-border text-text-primary text-sm font-semibold rounded-lg px-2 py-1.5 outline-none cursor-pointer"
        >
          {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <h3 className="text-sm font-semibold text-text-primary">hasn't been set up yet</h3>
      </div>
      <p className="text-sm text-text-tertiary">
        Set the rates and copy the current roster in. Alumni come in at zero automatically; everyone else is billed.
        You can change any individual amount afterwards.
      </p>

      {error && <div className="p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{error}</div>}

      {field('Club target', targetAmount, setTargetAmount, 'What the club needs for the year. Drives the progress bar only.')}
      {field('Per member', memberAmount, setMemberAmount, 'What each non-alumni member is billed. Fixed once you announce it.')}
      {field('Per guest game', guestGameRate, setGuestGameRate, 'Charged after a guest’s 2 free games each year.')}

      <button
        type="submit" disabled={saving}
        className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-text-on-accent disabled:opacity-50"
      >
        {saving ? 'Setting up…' : `Open ${year} and copy the roster`}
      </button>
    </form>
  );
}
