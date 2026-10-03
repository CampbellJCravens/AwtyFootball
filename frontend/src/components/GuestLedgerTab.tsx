import { useEffect, useMemo, useState } from 'react';
import { Player } from '../api/players';
import {
  GuestLedgerRow,
  fetchGuestLedger,
  renameGuest,
  fetchPromotionPlan,
  promoteGuest,
  type PromotionPlan,
} from '../api/guests';
import { DuesGuestRow, DuesYearNotConfigured, fetchDuesReport } from '../api/dues';

interface GuestLedgerTabProps {
  players: Player[];
}

type SortKey = 'visits' | 'name' | 'lastSeen' | 'owed';

const money = (v: string) => {
  const n = Number(v);
  return `${n < 0 ? '\u2212' : ''}$${Math.abs(n).toFixed(2)}`;
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—';

// Guest appearances, for chasing dues. The guest is the unit of collection —
// one row per person, sorted by how often they've turned up. "Usual host" is
// context for who to nudge, not a second thing to total.
export default function GuestLedgerTab({ players }: GuestLedgerTabProps) {
  const [rows, setRows] = useState<GuestLedgerRow[]>([]);
  // Renaming lives here rather than on the in-game guest chip because the chip
  // depends on the GuestN slot Player still existing, and those get deleted —
  // as of 2026-08-17 both real visits point at slot players that are gone, so
  // in-game was not a reachable place to fix a name. The identity survives.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('visits');
  // Money comes from the dues report so there is one balance calculation, not
  // two. A year nobody has opened yet has no rates, so the tab simply falls
  // back to counts rather than inventing a total.
  const [dues, setDues] = useState<Map<string, DuesGuestRow> | null>(null);
  const [memberAmount, setMemberAmount] = useState<string | null>(null);
  const [plan, setPlan] = useState<PromotionPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    fetchGuestLedger()
      .then(setRows)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load guest ledger'))
      .finally(() => setLoading(false));

    fetchDuesReport(new Date().getFullYear())
      .then(report => {
        setDues(new Map(report.guests.map(g => [g.guestId, g])));
        setMemberAmount(report.memberAmount);
      })
      .catch(err => {
        if (!(err instanceof DuesYearNotConfigured)) console.error('Dues rates unavailable', err);
        setDues(null);
      });
  }, []);

  const duesYear = new Date().getFullYear();

  // The preview IS the confirm step: promotion writes across four tables, so
  // nothing happens until the admin has seen what changes.
  async function openPromotion(guestId: string) {
    setPlanError(null);
    setPlan(null);
    const result = await fetchPromotionPlan(guestId, duesYear);
    if ('error' in result) {
      setPlanError(
        result.error === 'name_taken'
          ? 'A player with that name already exists — rename one of them first, so two people are never merged by accident.'
          : result.error
      );
      return;
    }
    setPlan(result);
  }

  async function confirmPromotion() {
    if (!plan) return;
    setPromoting(true);
    const result = await promoteGuest(plan.guestId, plan.duesYear, {
      acknowledgeNameClash: plan.nameClashPlayerIds.length > 0,
    });
    setPromoting(false);
    if ('error' in result) {
      setPlanError(result.error);
      return;
    }
    setPlan(null);
    const [ledger, report] = await Promise.all([
      fetchGuestLedger(),
      fetchDuesReport(duesYear).catch(() => null),
    ]);
    setRows(ledger);
    if (report) setDues(new Map(report.guests.map(g => [g.guestId, g])));
  }

  async function saveRename(guestId: string, merge = false) {
    const name = draftName.trim();
    if (!name) return;
    setSaving(true);
    setRenameError('');
    try {
      const result = await renameGuest(guestId, name, merge);
      if ('conflict' in result) {
        // Two rows for one person is exactly what splits a dues balance, so the
        // merge is offered rather than refused — but it is confirmed, never
        // silent, because it moves their visits and their money.
        const ok = window.confirm(
          `"${result.name}" already exists with ${result.visits} visit${result.visits === 1 ? '' : 's'}.\n\n` +
          'Merge these two into one guest? Their visits and any dues will be combined. This cannot be undone.'
        );
        if (ok) return saveRename(guestId, true);
        setSaving(false);
        return;
      }
      setRows(await fetchGuestLedger());
      setEditingId(null);
      setDraftName('');
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Could not rename');
    } finally {
      setSaving(false);
    }
  }

  const playerNames = useMemo(
    () => new Map(players.map(p => [p.id, p.name])),
    [players]
  );

  // The unnamed aggregate always sinks to the bottom whatever the sort — it
  // reconciles the count, it isn't someone you can chase.
  const sorted = useMemo(() => {
    const named = rows.filter(r => r.guestId !== null);
    const unnamed = rows.filter(r => r.guestId === null);
    const owedOf = (r: GuestLedgerRow) => Number(dues?.get(r.guestId ?? '')?.balance ?? 0);
    const cmp = (a: GuestLedgerRow, b: GuestLedgerRow) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'lastSeen') return (b.lastSeen ?? '').localeCompare(a.lastSeen ?? '');
      if (sortKey === 'owed') return owedOf(b) - owedOf(a) || a.name.localeCompare(b.name);
      return b.visits - a.visits || a.name.localeCompare(b.name);
    };
    return [...named.sort(cmp), ...unnamed];
  }, [rows, sortKey, dues]);

  // Uncapped guest charges only push people toward membership if somebody
  // notices they have crossed the line. This is where that gets noticed.
  const toConvert = useMemo(
    () => (dues ? [...dues.values()].filter(g => g.shouldConvert) : []),
    [dues]
  );

  const namedTotal = useMemo(
    () => rows.filter(r => r.guestId !== null).reduce((s, r) => s + r.visits, 0),
    [rows]
  );
  const unnamedTotal = useMemo(
    () => rows.filter(r => r.guestId === null).reduce((s, r) => s + r.visits, 0),
    [rows]
  );

  if (loading) return <div className="text-center py-8 text-text-tertiary text-sm">Loading guests…</div>;
  if (error) return <div className="p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{error}</div>;

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-text-tertiary text-sm">
        No guest appearances recorded yet. Name a guest when you add them to a team and they'll show up here.
      </div>
    );
  }

  const sortButton = (key: SortKey, label: string) => (
    <button
      onClick={() => setSortKey(key)}
      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
        sortKey === key ? 'bg-accent text-text-on-accent' : 'bg-surface-raised text-text-secondary hover:bg-surface-hover'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-xl bg-surface/40 px-3 py-2.5">
        <p className="text-[11px] text-text-tertiary">
          Appearances by guest across all games. A guest in two slots in one game still counts once.
          <strong className="text-text-secondary"> Billable = visits beyond the 2 free games allowed each dues year (Jan–Dec).</strong>
          {' '}Unnamed visits can't count toward anyone's trial, so they never become billable.
          {unnamedTotal > 0 && ` ${namedTotal} named · ${unnamedTotal} unnamed.`}
        </p>
      </div>

      {toConvert.length > 0 && memberAmount && (
        <div className="border border-warning-border bg-warning-bg rounded-xl px-3 py-2.5 space-y-1.5">
          <p className="text-[11px] font-semibold text-text-primary uppercase tracking-wide">
            Worth suggesting membership
          </p>
          {toConvert.map(g => (
            <p key={g.guestId} className="text-sm text-text-primary">
              <span className="font-semibold">{g.name}</span>
              {' — '}
              <span className="tabular-nums">{money(g.balance)}</span> owed across {g.billableVisits} billable
              game{g.billableVisits === 1 ? '' : 's'}, against{' '}
              <span className="tabular-nums">{money(memberAmount)}</span> for the year.
            </p>
          ))}
          <p className="text-[11px] text-text-secondary">
            Guest games have no ceiling, so these balances keep climbing. Record what they pay on the Dues tab.
          </p>
        </div>
      )}

      <div className="flex gap-1.5">
        {sortButton('visits', 'Most visits')}
        {dues && sortButton('owed', 'Most owed')}
        {sortButton('lastSeen', 'Recent')}
        {sortButton('name', 'Name')}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-tertiary text-[11px] uppercase tracking-wide">
              <th className="text-left font-medium py-2 pr-2">Guest</th>
              <th className="text-right font-medium py-2 px-2">Visits</th>
              <th className="text-right font-medium py-2 px-2" title="Visits beyond the 2 free trial games each dues year (Jan-Dec)">
                Billable{dues && <span className="block normal-case tracking-normal">owed</span>}
              </th>
              <th className="text-left font-medium py-2 px-2 whitespace-nowrap">First</th>
              <th className="text-left font-medium py-2 px-2 whitespace-nowrap">Last</th>
              <th className="text-left font-medium py-2 pl-2">Usual host</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr
                key={row.guestId ?? '__unnamed__'}
                className={`border-t border-border ${row.guestId === null ? 'text-text-tertiary italic' : ''}`}
              >
                <td className="py-2 pr-2 text-text-primary font-medium">
                  {editingId === row.guestId ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={draftName}
                        maxLength={60}
                        onChange={e => setDraftName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveRename(row.guestId!);
                          if (e.key === 'Escape') { setEditingId(null); setRenameError(''); }
                        }}
                        className="w-28 px-1.5 py-1 text-xs rounded border border-border bg-surface text-text-primary outline-none"
                      />
                      <button
                        onClick={() => saveRename(row.guestId!)}
                        disabled={saving || !draftName.trim()}
                        className="text-[11px] font-semibold text-gold disabled:text-text-tertiary"
                      >
                        {saving ? '…' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setRenameError(''); }}
                        className="text-[11px] text-text-tertiary"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      {row.name}
                      {/* The unnamed aggregate is not one person, so it has no name to edit. */}
                      {row.guestId && (
                        <button
                          onClick={() => { setEditingId(row.guestId!); setDraftName(row.name); setRenameError(''); }}
                          className="ml-1.5 text-[11px] text-text-tertiary hover:text-gold"
                          aria-label={`Rename ${row.name}`}
                          title="Rename this guest"
                        >
                          ✎
                        </button>
                      )}
                      {row.formerPlayerId && !row.promotedPlayerId && (
                        <span
                          className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-hover text-text-secondary whitespace-nowrap"
                          title="Was a member; visiting as a guest. Converting re-attaches them to their player record."
                        >
                          former member
                        </span>
                      )}
                      {row.promotedPlayerId ? (
                        <span
                          className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-hover text-text-tertiary whitespace-nowrap"
                          title={`Joined in ${row.promotedYear ?? ''} — kept here as the history of how they got here`}
                        >
                          member{row.promotedYear ? ` since ${row.promotedYear}` : ''}
                        </span>
                      ) : (
                        // Any named guest can join at any time - most decide within their two free
                        // games. The warning colour still marks the ones whose balance has passed
                        // what membership costs.
                        row.guestId && (
                          dues?.get(row.guestId)?.shouldConvert ? (
                            <button
                              onClick={() => openPromotion(row.guestId!)}
                              className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-warning-bg text-warning whitespace-nowrap hover:brightness-110"
                              title="Their balance has passed what membership costs — make them a member"
                            >
                              convert →
                            </button>
                          ) : (
                            <button
                              onClick={() => openPromotion(row.guestId!)}
                              className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-hover text-text-secondary whitespace-nowrap hover:text-gold"
                              title="Make this guest a member"
                            >
                              convert →
                            </button>
                          )
                        )
                      )}
                    </>
                  )}
                  {editingId === row.guestId && renameError && (
                    <p className="text-[10px] text-red-400 mt-1">{renameError}</p>
                  )}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-text-secondary">{row.visits}</td>
                <td className="py-2 px-2 text-right tabular-nums font-semibold text-gold">
                  {row.billableVisits === null ? '—' : row.billableVisits}
                  {dues && row.guestId && (() => {
                    const d = dues.get(row.guestId);
                    if (!d) return null;
                    return (
                      <span className={`block text-[11px] font-medium ${
                        Number(d.balance) > 0 ? 'text-text-secondary' : 'text-text-tertiary'
                      }`}>
                        {money(d.balance)}
                      </span>
                    );
                  })()}
                </td>
                <td className="py-2 px-2 text-text-secondary whitespace-nowrap">{fmtDate(row.firstSeen)}</td>
                <td className="py-2 px-2 text-text-secondary whitespace-nowrap">{fmtDate(row.lastSeen)}</td>
                <td className="py-2 pl-2 text-text-secondary">
                  {row.usualHostId ? (
                    <>
                      {playerNames.get(row.usualHostId) ?? 'Unknown'}
                      {row.usualHostVisits < row.visits && (
                        <span className="text-text-tertiary text-xs"> ({row.usualHostVisits})</span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {planError && !plan && (
        <p className="mt-3 text-xs text-red-400">{planError}</p>
      )}

      {plan && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl border border-border shadow-modal w-full max-w-md p-4">
            <h3 className="text-lg font-semibold text-text-primary">Make {plan.guestName} a member</h3>
            <p className="text-xs text-text-tertiary mt-1">
              Dues year {plan.duesYear}. This is what changes — nothing has happened yet.
            </p>

            <ul className="mt-3 space-y-1.5 text-sm text-text-secondary">
              <li>
                {plan.attachPlayerId ? 'Attaches to the existing player' : 'Creates the player'}{' '}
                <strong className="text-text-primary">{plan.playerName}</strong>
                {plan.memberSince != null && (
                  <span className="text-text-tertiary"> · member since {plan.memberSince} (first turned up)</span>
                )}
              </li>
              <li>
                Owes the full member amount{' '}
                <strong className="text-text-primary">${plan.memberAmount}</strong>
              </li>
              <li>
                Stops billing <strong className="text-text-primary">{plan.visitsRetiredFromBilling}</strong>{' '}
                guest game{plan.visitsRetiredFromBilling === 1 ? '' : 's'} from {plan.duesYear} on
              </li>
              {plan.billableVisitsRemaining > 0 && (
                <li className="text-warning">
                  Still owes for <strong>{plan.billableVisitsRemaining}</strong> guest game
                  {plan.billableVisitsRemaining === 1 ? '' : 's'} from earlier years — joining now does not clear those
                </li>
              )}
              {plan.paymentsCredited.count > 0 && (
                <li>
                  Credits <strong className="text-text-primary">${plan.paymentsCredited.total}</strong> already paid as
                  a guest against their member dues
                </li>
              )}
              {plan.phone && <li>Moves their WhatsApp number onto the member</li>}
              <li className="text-text-tertiary">
                Past games are left exactly as played — they already show their name.
              </li>
            </ul>

            {plan.nameClashPlayerIds.length > 0 && (
              <p className="mt-3 text-xs text-warning">
                A player called {plan.playerName} already exists. Confirming creates a SECOND one — if they are the same
                person, cancel and rename instead.
              </p>
            )}
            {planError && <p className="mt-3 text-xs text-red-400">{planError}</p>}

            <div className="flex gap-2 mt-4">
              <button
                onClick={confirmPromotion}
                disabled={promoting}
                className="flex-1 px-3 py-2 rounded-lg bg-gold text-black text-sm font-semibold disabled:opacity-50"
              >
                {promoting ? 'Converting…' : 'Make a member'}
              </button>
              <button
                onClick={() => { setPlan(null); setPlanError(null); }}
                className="px-3 py-2 rounded-lg border border-border text-sm text-text-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
