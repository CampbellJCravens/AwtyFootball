import { Achievement } from '../api/stats';

interface AchievementUnlockedModalProps {
  achievements: Achievement[];
  onViewProfile: () => void;
  onViewAchievements: () => void;
  onDismiss: () => void;
}

export default function AchievementUnlockedModal({
  achievements,
  onViewProfile,
  onViewAchievements,
  onDismiss,
}: AchievementUnlockedModalProps) {
  if (achievements.length === 0) return null;

  const isSingle = achievements.length === 1;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4"
      onClick={onDismiss}
    >
      <div
        className="bg-surface rounded-2xl border border-gold/60 shadow-modal max-w-md w-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-b from-gold/20 to-transparent px-6 pt-6 pb-4 relative">
          <button
            onClick={onDismiss}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="text-center">
            <div className="text-4xl mb-2">🏆</div>
            <h3 className="text-xl font-bold text-gold italic tracking-wide">
              {isSingle ? 'ACHIEVEMENT UNLOCKED!' : `${achievements.length} ACHIEVEMENTS UNLOCKED!`}
            </h3>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-4">
          {isSingle ? (
            <div className="rounded-xl border border-gold/40 bg-surface p-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0 text-xl">
                  ✅
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-text-primary mb-0.5">{achievements[0].name}</p>
                  <p className="text-xs text-text-tertiary">{achievements[0].description}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto mb-4 pr-1">
              {achievements.map(a => (
                <div key={a.id} className="rounded-xl border border-gold/40 bg-surface p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0 text-base">
                      ✅
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary mb-0.5">{a.name}</p>
                      <p className="text-xs text-text-tertiary">{a.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={onViewAchievements}
              className="w-full px-4 py-3 bg-gold text-text-on-accent rounded-xl font-semibold hover:bg-gold-hover active:bg-gold-active transition-colors"
            >
              View Achievements
            </button>
            <button
              onClick={onViewProfile}
              className="w-full px-4 py-3 bg-surface-raised text-text-primary rounded-xl font-semibold hover:bg-surface-hover active:bg-surface-active transition-colors"
            >
              View Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
