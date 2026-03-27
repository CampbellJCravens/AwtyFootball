interface Player {
  id: string;
  name: string;
  pictureUrl: string | null;
}

interface GroupDetailModalProps {
  players: Player[];
  stats: { label: string; value: string }[];
  onPlayerClick?: (playerId: string) => void;
  onClose: () => void;
}

export default function GroupDetailModal({ players, stats, onPlayerClick, onClose }: GroupDetailModalProps) {
  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-base rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm mx-auto p-5 pb-8 sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4 sm:hidden" />

        {/* Players */}
        <div className="space-y-3 mb-5">
          {players.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              {p.pictureUrl ? (
                <img src={p.pictureUrl} alt={p.name} className="w-10 h-10 rounded-full object-cover border-2 border-border-emphasis" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-sm font-semibold">
                  {getInitial(p.name)}
                </div>
              )}
              <span
                className={`text-sm font-medium text-text-primary ${onPlayerClick ? 'cursor-pointer hover:underline' : ''}`}
                onClick={onPlayerClick ? () => { onPlayerClick(p.id); onClose(); } : undefined}
              >
                {p.name}
              </span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="flex gap-4 justify-center">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-lg font-bold text-gold">{s.value}</p>
              <p className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
