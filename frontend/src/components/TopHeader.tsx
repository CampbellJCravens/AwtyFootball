interface TopHeaderProps {
  userPicture?: string | null;
  userName?: string | null;
  onMenuClick?: () => void;
  onAvatarClick?: () => void;
}

export default function TopHeader({ userPicture, userName, onMenuClick, onAvatarClick }: TopHeaderProps) {
  return (
    <header className="bg-surface/80 backdrop-blur-xl border-b border-border px-4 py-3 sticky top-0 z-30">
      <div className="flex items-center justify-between max-w-lg mx-auto">
        {/* Menu */}
        <button
          onClick={onMenuClick}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover transition-colors"
          aria-label="Menu"
        >
          <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Branding */}
        <div className="flex items-center gap-2">
          <img src="/afc-logo.png" alt="Awty Soccer Club" className="h-9 w-auto rounded-md" />
          <h1 className="text-lg font-bold text-gold italic">Awty Football</h1>
        </div>

        {/* User Avatar */}
        <button
          onClick={onAvatarClick}
          className="w-8 h-8 rounded-full overflow-hidden border-2 border-border-emphasis hover:border-gold transition-colors"
          aria-label="Profile"
        >
          {userPicture ? (
            <img src={userPicture} alt={userName || 'Profile'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-surface-active flex items-center justify-center text-text-primary text-xs font-semibold">
              {userName?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
        </button>
      </div>
    </header>
  );
}
