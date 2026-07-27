import { Player } from '../api/players';

interface PlayerCardProps {
  player: Player;
  gp?: number;
  goals?: number;
  assists?: number;
  onEdit: (player: Player) => void;
  onDelete: (player: Player) => void;
  onClick?: () => void;
  showActions?: boolean;
}

export default function PlayerCard({ player, gp = 0, goals = 0, assists = 0, onEdit, onDelete, onClick, showActions = true }: PlayerCardProps) {
  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  return (
    <div
      onClick={onClick}
      className={`bg-surface rounded-xl shadow-card border border-border p-4 flex flex-col items-center text-center relative ${!player.onRoster ? 'opacity-80' : ''} ${onClick ? 'cursor-pointer hover:shadow-card-hover hover:border-border-emphasis transition-all' : ''}`}
    >
      {/* Prior-member badge */}
      {!player.onRoster && (
        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-surface-active text-text-tertiary text-[9px] font-semibold uppercase tracking-wide">
          Former
        </span>
      )}

      {/* Admin edit button */}
      {showActions && (
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(player); }}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-surface-hover transition-colors"
            aria-label="Edit player"
          >
            <svg className="w-3.5 h-3.5 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(player); }}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-error-bg transition-colors"
            aria-label="Delete player"
          >
            <svg className="w-3.5 h-3.5 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}

      {/* Avatar, with the school mark pinned to it for alumni */}
      <div className="mb-3 mt-1 relative">
        {player.pictureUrl ? (
          <img
            src={player.pictureUrl}
            alt={player.name}
            className="w-16 h-16 rounded-full object-cover border-2 border-border-emphasis"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-2xl font-semibold border-2 border-border-emphasis">
            {getInitial(player.name)}
          </div>
        )}
        {player.isAlumni && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] rounded-full bg-white border border-border-emphasis flex items-center justify-center shadow-card"
            title="Awty alumni"
          >
            <img src="/awty-alumni.png" alt="Awty alumni" className="w-3.5 h-auto" />
          </span>
        )}
      </div>

      {/* Name */}
      <h3 className="text-sm font-semibold text-text-primary truncate w-full mb-3">{player.name}</h3>

      {/* Stats row */}
      <div className="flex items-center justify-around w-full border-t border-border pt-2">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-text-tertiary font-medium">GP</span>
          <span className="text-sm font-bold text-text-primary">{gp}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-text-tertiary font-medium">G</span>
          <span className="text-sm font-bold text-gold">{goals}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-text-tertiary font-medium">A</span>
          <span className="text-sm font-bold text-text-primary">{assists}</span>
        </div>
      </div>
    </div>
  );
}
