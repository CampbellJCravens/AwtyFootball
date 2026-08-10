import { useState } from 'react';
import { Player } from '../api/players';
import DuesTab from './DuesTab';
import GuestLedgerTab from './GuestLedgerTab';

type DuesView = 'dues' | 'guests';

// Dues and the guest ledger used to be views inside the Stats hub, which made
// "Performance Data" the home of the money. They are the same job — who owes
// what — so they live together here, and Stats goes back to being stats.
export default function DuesPage({ players }: { players: Player[] }) {
  const [view, setView] = useState<DuesView>('dues');

  const tab = (id: DuesView, label: string) => (
    <button
      onClick={() => setView(id)}
      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
        view === id ? 'bg-gold text-text-on-accent' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="mb-2">
          <h2 className="text-2xl font-bold text-gold italic">DUES</h2>
          <p className="text-text-tertiary text-sm">Who owes what</p>
        </div>

        <div className="flex gap-1 mb-4 bg-surface-hover/50 rounded-lg p-1">
          {tab('dues', 'Dues')}
          {tab('guests', 'Guests')}
        </div>

        {view === 'dues' ? <DuesTab players={players} /> : <GuestLedgerTab players={players} />}
      </div>
    </div>
  );
}
