import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DuesGuestRow, DuesMemberRow, DuesStatus, DuesYearNotConfigured, DuesYearReport,
  deleteDuesPayment, fetchDuesReport, openDuesYear, saveDuesConfig, updateDuesEntry,
} from '../api/dues';
import RecordPaymentModal from './RecordPaymentModal';

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
  exempt: 'Alumni', unpaid: 'No payment', partial: 'Part paid', paid: 'Paid', overpaid: 'Overpaid',
};

const STATUS_CLASS: Record<DuesStatus, string> = {
  exempt: 'bg-info-bg text-info',
  unpaid: 'bg-surface-raised text-text-tertiary',
  partial: 'bg-warning-bg text-warning',
  paid: 'bg-success-bg text-success',
  overpaid: 'bg-info-bg text-info',
};

type Filter = 'all' | 'owing' | 'partial' | 'paid' | 'exempt';

const currentDuesYear = () => new Date().getFullYear();

export default function DuesTab() {
  const [year, setYear] = useState(currentDuesYear());
  const [report, setReport] = useState<DuesYearReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paying, setPaying] = useState<{ name: string; balance: string; playerId?: string; guestId?: string } | null>(null);
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

  const members = useMemo(() => {
    if (!report) return [];
    return report.members.filter(m => {
      if (filter === 'all') return true;
      if (filter === 'owing') return m.status === 'unpaid' || m.status === 'partial';
      if (filter === 'partial') return m.status === 'partial';
      if (filter === 'paid') return m.status === 'paid' || m.status === 'overpaid';
      return m.status === 'exempt';
    });
  }, [report, filter]);

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
            <span className="text-[11px] text-text-tertiary">
              ${Number(report.memberAmount).toFixed(0)}/member · ${Number(report.guestGameRate).toFixed(0)}/guest game
            </span>
          </div>
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

      {error && (
        <div className="p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{error}</div>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {filterButton('all', 'All', report.members.length)}
        {filterButton('owing', 'Owing', report.totals.unpaid + report.totals.partPaid)}
        {filterButton('partial', 'Part paid', report.totals.partPaid)}
        {filterButton('paid', 'Paid', report.totals.paidInFull)}
        {filterButton('exempt', 'Alumni', report.totals.exempt)}
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
                      {m.status === 'exempt'
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
                      {m.status === 'exempt' ? '—' : money(m.balance)}
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
                      <button
                        onClick={() => setPaying({ name: m.name, balance: m.balance, playerId: m.playerId })}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-accent text-text-on-accent"
                      >
                        Record payment
                      </button>
                      <button onClick={() => adjustOwed(m)} disabled={busy}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-raised text-text-secondary border border-border-emphasis hover:bg-surface-hover">
                        Change amount
                      </button>
                      <button onClick={() => editNote(m)} disabled={busy}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-raised text-text-secondary border border-border-emphasis hover:bg-surface-hover">
                        {m.note ? 'Edit note' : 'Add note'}
                      </button>
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
    </div>
  );
}

// Guests bill per game with no ceiling. Once a balance passes what membership
// costs, converting is the cheaper option for them — which is the whole point
// of leaving it uncapped, so the page says so rather than leaving it to memory.
function GuestSection({
  guests, onPay,
}: {
  guests: DuesGuestRow[];
  onPay: (p: { name: string; balance: string; guestId: string }) => void;
}) {
  const convert = guests.filter(g => g.shouldConvert);
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

      <div className="space-y-1.5">
        {guests.map(g => (
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
