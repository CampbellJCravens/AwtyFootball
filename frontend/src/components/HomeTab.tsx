import { useState, useEffect, useRef } from 'react';
import { fetchMonthlyStats, MonthlyStatsResponse, MonthlyAward, LeaderboardEntry } from '../api/stats';
import ImageLightbox from './ImageLightbox';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface HomeTabProps {
  onPlayerClick?: (playerId: string) => void;
  initialMonth?: { month: number; year: number };
  onMonthViewed?: () => void;
}

function AwardCard({ award, statLabel, showDetailedStats, onPlayerClick, onImageClick }: {
  award: MonthlyAward;
  statLabel: string;
  showDetailedStats?: boolean;
  onPlayerClick?: (playerId: string) => void;
  onImageClick?: (src: string) => void;
}) {
  const getInitial = (name: string) => name.charAt(0).toUpperCase();
  const nameParts = award.player.name.split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden relative min-h-[140px]">
      <div className="relative z-10 p-5 pr-28">
        <p
          className={`text-2xl font-black italic text-gold leading-tight ${onPlayerClick ? 'cursor-pointer hover:underline' : ''}`}
          onClick={onPlayerClick ? () => onPlayerClick(award.player.id) : undefined}
        >
          {firstName.toUpperCase()}
          {lastName && <><br />{lastName.toUpperCase()}</>}
        </p>
        <p className="text-xs text-text-tertiary font-semibold tracking-wider uppercase mt-1">
          {statLabel}
        </p>
        {showDetailedStats && (
          <p className="text-[10px] text-text-tertiary font-medium tracking-wider uppercase mt-0.5">
            {[award.games != null && `${award.games} Games`, award.wins != null && `${award.wins} Wins`, award.ties != null && `${award.ties} Ties`].filter(Boolean).join(' · ')}
          </p>
        )}
        {onPlayerClick && (
          <button
            onClick={() => onPlayerClick(award.player.id)}
            className="mt-2 px-4 py-1.5 bg-gold text-text-on-accent text-xs font-bold rounded-lg hover:bg-gold-hover active:bg-gold-active transition-colors uppercase tracking-wider"
          >
            View Profile
          </button>
        )}
      </div>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
        {award.player.pictureUrl ? (
          <img
            src={award.player.pictureUrl}
            alt={award.player.name}
            className="w-28 h-28 rounded-full object-cover border-4 border-gold/30 cursor-pointer"
            onClick={onImageClick ? () => onImageClick(award.player.pictureUrl!) : undefined}
          />
        ) : (
          <div className="w-28 h-28 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-4xl font-black border-4 border-gold/30">
            {getInitial(award.player.name)}
          </div>
        )}
      </div>
    </div>
  );
}

function AwardSection({ title, titlePlural, emoji, statLabel, awards, showDetailedStats, onPlayerClick, onImageClick, titleExtra, noQualifierMessage, onShowLeaderboard }: {
  title: string;
  titlePlural?: string;
  emoji?: string;
  statLabel: string;
  awards: MonthlyAward[] | null;
  showDetailedStats?: boolean;
  onPlayerClick?: (playerId: string) => void;
  onImageClick?: (src: string) => void;
  titleExtra?: React.ReactNode;
  noQualifierMessage?: string;
  onShowLeaderboard?: () => void;
}) {
  if ((!awards || awards.length === 0) && !noQualifierMessage) return null;
  if (!awards || awards.length === 0) {
    return (
      <div className="mb-6">
        <h3 className="text-lg font-bold text-text-primary mb-2">{emoji && <span className="mr-1.5">{emoji}</span>}{title}{titleExtra}</h3>
        <p className="text-sm text-text-tertiary italic">{noQualifierMessage}</p>
      </div>
    );
  }
  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  const isTied = awards.length > 1;
  const displayTitle = isTied && titlePlural ? titlePlural : title;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold text-text-primary">{emoji && <span className="mr-1.5">{emoji}</span>}{displayTitle}{titleExtra}</h3>
        {onShowLeaderboard && (
          <button onClick={onShowLeaderboard} className="text-[11px] text-text-tertiary hover:text-gold transition-colors font-medium">
            Show Leaderboard
          </button>
        )}
      </div>
      {!isTied ? (
        <AwardCard award={awards[0]} statLabel={statLabel} showDetailedStats={showDetailedStats} onPlayerClick={onPlayerClick} onImageClick={onImageClick} />
      ) : (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden p-5">
          {/* Overlapping avatars */}
          <div className="flex -space-x-4 mb-3">
            {awards.map((award, i) => (
              award.player.pictureUrl ? (
                <img
                  key={award.player.id}
                  src={award.player.pictureUrl}
                  alt={award.player.name}
                  className="w-16 h-16 rounded-full object-cover border-4 border-surface cursor-pointer hover:scale-105 transition-transform"
                  style={{ zIndex: awards.length - i }}
                  onClick={onImageClick ? () => onImageClick(award.player.pictureUrl!) : undefined}
                />
              ) : (
                <div
                  key={award.player.id}
                  className="w-16 h-16 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-xl font-black border-4 border-surface cursor-pointer hover:scale-105 transition-transform"
                  style={{ zIndex: awards.length - i }}
                  onClick={onPlayerClick ? () => onPlayerClick(award.player.id) : undefined}
                >
                  {getInitial(award.player.name)}
                </div>
              )
            ))}
          </div>
          {/* Names */}
          <div className="flex flex-wrap gap-x-1 mb-1">
            {awards.map((award, i) => (
              <span key={award.player.id}>
                <span
                  className={`text-lg font-black italic text-gold leading-tight ${onPlayerClick ? 'cursor-pointer hover:underline' : ''}`}
                  onClick={onPlayerClick ? () => onPlayerClick(award.player.id) : undefined}
                >
                  {award.player.name.split(' ')[0].toUpperCase()}
                </span>
                {i < awards.length - 1 && <span className="text-text-tertiary font-medium">{i === awards.length - 2 ? ' &' : ','}</span>}
              </span>
            ))}
          </div>
          <p className="text-xs text-text-tertiary font-semibold tracking-wider uppercase">
            {statLabel}
          </p>
          {showDetailedStats && (
            <p className="text-[10px] text-text-tertiary font-medium tracking-wider uppercase mt-0.5">
              Tied
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function HomeTab({ onPlayerClick, initialMonth, onMonthViewed }: HomeTabProps) {
  const now = new Date();
  const [month, setMonth] = useState(initialMonth?.month ?? (now.getMonth() + 1));
  const [year, setYear] = useState(initialMonth?.year ?? now.getFullYear());
  const hasAutoNavigated = useRef(false);

  useEffect(() => {
    if (initialMonth) {
      setMonth(initialMonth.month);
      setYear(initialMonth.year);
      onMonthViewed?.();
    }
  }, [initialMonth]);
  const [data, setData] = useState<MonthlyStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [showDefenderInfo, setShowDefenderInfo] = useState(false);
  const [leaderboardModal, setLeaderboardModal] = useState<{ title: string; emoji: string; unit: string; entries: LeaderboardEntry[]; showFormula?: boolean } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await fetchMonthlyStats(month, year);
        // On first load, if current month has no games, jump to the most recent month that does
        if (!hasAutoNavigated.current && result.gamesPlayed === 0 && result.availableMonths?.length) {
          hasAutoNavigated.current = true;
          const latest = result.availableMonths.reduce((best, m) =>
            m.year > best.year || (m.year === best.year && m.month > best.month) ? m : best
          );
          setMonth(latest.month);
          setYear(latest.year);
          // Don't setLoading(false) — the month change will trigger another fetch
          return;
        }
        hasAutoNavigated.current = true;
        setData(result);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load monthly stats:', err);
        setLoading(false);
      }
    };
    load();
  }, [month, year]);

  const availableYears = data?.availableMonths
    ? [...new Set(data.availableMonths.map(m => m.year))].sort((a, b) => b - a)
    : [year];

  const canGoPrev = data?.availableMonths?.some(m =>
    m.year < year || (m.year === year && m.month < month)
  );
  const canGoNext = data?.availableMonths?.some(m =>
    m.year > year || (m.year === year && m.month > month)
  );

  const goToPrev = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const goToNext = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-4 pb-8">
        {/* Month/Year selector */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={goToPrev}
            disabled={!canGoPrev}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="text-center">
            <h2 className="text-xl font-bold text-gold">{MONTH_NAMES[month]}</h2>
            <div className="relative inline-flex items-center">
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="bg-transparent text-text-tertiary text-xs font-medium text-center cursor-pointer outline-none appearance-none pr-4"
              >
                {availableYears.map(y => (
                  <option key={y} value={y} className="bg-surface text-text-primary">{y}</option>
                ))}
              </select>
              <svg className="w-3 h-3 text-text-tertiary absolute right-0 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <button
            onClick={goToNext}
            disabled={!canGoNext}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-text-tertiary">Loading...</p>
          </div>
        ) : !data || data.gamesPlayed === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-tertiary">No games played in {MONTH_NAMES[month]} {year}.</p>
          </div>
        ) : (
          <div>
            {month === (now.getMonth() + 1) && year === now.getFullYear() && (
              <p className="text-xs text-gold font-semibold uppercase tracking-wider mb-2">In Progress</p>
            )}
            <p className="text-xs text-text-tertiary font-medium mb-4">{data.gamesPlayed} game{data.gamesPlayed !== 1 ? 's' : ''} played this month</p>

            <AwardSection
              title="Player of the Month"
              titlePlural="Players of the Month"
              emoji="👑"
              statLabel={`${data.awards.playerOfTheMonth?.[0]?.value ?? 0} Points`}
              awards={data.awards.playerOfTheMonth}
              showDetailedStats
              onPlayerClick={onPlayerClick}
              onImageClick={setLightboxImage}
              noQualifierMessage="No one surpassed 3 points this month."
              onShowLeaderboard={() => setLeaderboardModal({ title: 'Points', emoji: '👑', unit: 'Pts', entries: data.leaderboards.points })}
            />
            <AwardSection
              title="Top Goal Contributor"
              titlePlural="Top Goal Contributors"
              emoji="🎯"
              statLabel={`${data.awards.topGoalContributor?.[0]?.value ?? 0} Goals and Assists`}
              awards={data.awards.topGoalContributor}
              onPlayerClick={onPlayerClick}
              onImageClick={setLightboxImage}
              noQualifierMessage="No one surpassed 1 goal contribution this month."
              onShowLeaderboard={() => setLeaderboardModal({ title: 'Goal Contributions', emoji: '🎯', unit: 'G+A', entries: data.leaderboards.goalInvolvements })}
            />
            {(data.year > 2026 || (data.year === 2026 && data.month >= 5)) && (
              <AwardSection
                title="Sportsman of the Month"
                titlePlural="Sportsmen of the Month"
                emoji="🤙"
                statLabel={`${data.awards.sportsmanOfTheMonth?.[0]?.value ?? 0} Sportsmanship Points`}
                awards={data.awards.sportsmanOfTheMonth}
                onPlayerClick={onPlayerClick}
                onImageClick={setLightboxImage}
                noQualifierMessage="No one earned a sportsmanship point this month."
                onShowLeaderboard={() => setLeaderboardModal({ title: 'Sportsmanship', emoji: '🤙', unit: 'SP', entries: data.leaderboards.sportsmanship })}
              />
            )}
            <AwardSection
              title="Top Scorer"
              titlePlural="Top Scorers"
              emoji="⚽"
              statLabel={`${data.awards.topScorer?.[0]?.value ?? 0} Goals`}
              awards={data.awards.topScorer}
              onPlayerClick={onPlayerClick}
              onImageClick={setLightboxImage}
              noQualifierMessage="No one surpassed 1 goal this month."
              onShowLeaderboard={() => setLeaderboardModal({ title: 'Goals', emoji: '⚽', unit: 'G', entries: data.leaderboards.goals })}
            />
            <AwardSection
              title="Top Assister"
              titlePlural="Top Assisters"
              emoji="🤝"
              statLabel={`${data.awards.topAssister?.[0]?.value ?? 0} Assists`}
              awards={data.awards.topAssister}
              onPlayerClick={onPlayerClick}
              onImageClick={setLightboxImage}
              noQualifierMessage="No one surpassed 1 assist this month."
              onShowLeaderboard={() => setLeaderboardModal({ title: 'Assists', emoji: '🤝', unit: 'A', entries: data.leaderboards.assists })}
            />
            <AwardSection
              title="Top Defender"
              titlePlural="Top Defenders"
              emoji="🛡️"
              statLabel={`${data.awards.topDefender?.[0]?.games ?? 0} Games Played · ${data.awards.topDefender?.[0]?.goalsAllowed ?? 0} Goals Allowed`}
              awards={data.awards.topDefender}
              onPlayerClick={onPlayerClick}
              onImageClick={setLightboxImage}
              titleExtra={
                <button
                  onClick={() => setShowDefenderInfo(true)}
                  className="ml-2 w-5 h-5 rounded-full border border-border-emphasis text-text-tertiary text-[11px] font-bold inline-flex items-center justify-center hover:bg-surface-hover transition-colors align-middle"
                >
                  i
                </button>
              }
              onShowLeaderboard={() => setLeaderboardModal({ title: 'Defensive Rating', emoji: '🛡️', unit: 'DR', entries: data.leaderboards.defensiveRating, showFormula: true })}
            />
            <div className="mb-6">
              <h3 className="text-lg font-bold text-text-primary mb-2"><span className="mr-1.5">🤜🤛</span>{data.awards.topDuo && data.awards.topDuo.length > 1 ? 'Top Duos' : 'Top Duo'}</h3>
              {data.awards.topDuo && data.awards.topDuo.length > 0 ? (
                <div className="space-y-3">
                  {data.awards.topDuo.map((duo, duoIdx) => (
                    <div key={duoIdx} className="bg-surface rounded-2xl border border-border overflow-hidden p-5">
                      <div className="flex -space-x-4 mb-3">
                        {duo.players.map((player, i) => (
                          player.pictureUrl ? (
                            <img
                              key={player.id}
                              src={player.pictureUrl}
                              alt={player.name}
                              className="w-16 h-16 rounded-full object-cover border-4 border-surface cursor-pointer hover:scale-105 transition-transform"
                              style={{ zIndex: 2 - i }}
                              onClick={() => setLightboxImage(player.pictureUrl!)}
                            />
                          ) : (
                            <div
                              key={player.id}
                              className="w-16 h-16 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-xl font-black border-4 border-surface cursor-pointer hover:scale-105 transition-transform"
                              style={{ zIndex: 2 - i }}
                              onClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
                            >
                              {player.name.charAt(0).toUpperCase()}
                            </div>
                          )
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-x-1 mb-1">
                        {duo.players.map((player, i) => (
                          <span key={player.id}>
                            <span
                              className={`text-lg font-black italic text-gold leading-tight ${onPlayerClick ? 'cursor-pointer hover:underline' : ''}`}
                              onClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
                            >
                              {player.name.split(' ')[0].toUpperCase()}
                            </span>
                            {i === 0 && <span className="text-text-tertiary font-medium"> &</span>}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-text-tertiary font-semibold tracking-wider uppercase">
                        {duo.value} Goal Contributions
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-tertiary italic">No duo surpassed 1 goal contribution this month.</p>
              )}
            </div>
          </div>
        )}

        {lightboxImage && (
          <ImageLightbox src={lightboxImage} alt="Player" onClose={() => setLightboxImage(null)} />
        )}

        {showDefenderInfo && data?.awards.topDefender && data.awards.topDefender.length > 0 && (() => {
          const d = data.awards.topDefender![0];
          const gp = d.games ?? 0;
          const ga = d.goalsAllowed ?? 0;
          const rating = (gp * 3) - ga;
          return (
            <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center" onClick={() => setShowDefenderInfo(false)}>
              <div className="absolute inset-0 bg-black/60" />
              <div
                className="relative bg-base rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm mx-auto p-5 pb-8 sm:pb-5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4 sm:hidden" />
                <h3 className="text-lg font-bold text-text-primary mb-3">🛡️ Top Defender Formula</h3>
                <p className="text-sm text-text-secondary mb-4">
                  The defensive rating rewards players whose teams concede the fewest goals over the most games.
                </p>
                <div className="bg-surface rounded-xl border border-border p-4 text-center">
                  <p className="text-xs text-text-tertiary font-semibold tracking-wider uppercase mb-2">Formula</p>
                  <p className="text-lg font-bold text-text-primary mb-3">
                    (Games Played x 3) - Goals Allowed
                  </p>
                  <div className="h-px bg-border mb-3" />
                  <p className="text-xs text-text-tertiary font-semibold tracking-wider uppercase mb-2">
                    {d.player.name}'s Rating
                  </p>
                  <p className="text-lg font-bold text-gold">
                    ({gp} x 3) - {ga} = <span className="text-2xl">{rating}</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowDefenderInfo(false)}
                  className="mt-4 w-full py-2.5 bg-surface hover:bg-surface-hover text-text-primary text-sm font-semibold rounded-xl border border-border transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          );
        })()}

        {leaderboardModal && (() => {
          const { title, emoji, unit, entries, showFormula } = leaderboardModal;
          const getInitial = (name: string) => name.charAt(0).toUpperCase();
          // Assign ranks (ties get same rank)
          let rank = 0;
          let lastVal = -1;
          const ranked = entries.map(e => {
            if (e.value !== lastVal) { rank++; lastVal = e.value; }
            return { ...e, rank };
          });
          return (
            <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center" onClick={() => setLeaderboardModal(null)}>
              <div className="absolute inset-0 bg-black/60" />
              <div
                className="relative bg-base rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm mx-auto p-5 pb-8 sm:pb-5 max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4 sm:hidden flex-shrink-0" />
                <h3 className="text-lg font-bold text-text-primary mb-4 flex-shrink-0">{emoji} {title}</h3>
                <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
                  {ranked.map((entry) => (
                    <div
                      key={entry.player.id}
                      className={`flex items-center gap-3 rounded-xl p-3 ${entry.rank === 1 ? 'bg-gold/10 border border-gold/30' : 'bg-surface border border-border'}`}
                    >
                      <span className={`w-7 text-center font-bold text-sm flex-shrink-0 ${entry.rank <= 3 ? '' : 'text-text-tertiary'}`}>
                        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                      </span>
                      {entry.player.pictureUrl ? (
                        <img src={entry.player.pictureUrl} alt={entry.player.name} className="w-8 h-8 rounded-full object-cover border border-border-emphasis flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-xs font-semibold flex-shrink-0">
                          {getInitial(entry.player.name)}
                        </div>
                      )}
                      <span
                        className={`flex-1 text-sm font-medium text-text-primary truncate ${onPlayerClick ? 'cursor-pointer hover:underline' : ''}`}
                        onClick={onPlayerClick ? () => { onPlayerClick(entry.player.id); setLeaderboardModal(null); } : undefined}
                      >
                        {entry.player.name}
                      </span>
                      <span className={`text-sm font-bold flex-shrink-0 ${entry.rank === 1 ? 'text-gold' : 'text-text-secondary'}`}>
                        {showFormula && entry.games != null && entry.goalsAllowed != null ? (
                          <span className="text-xs">
                            <span className="text-text-tertiary font-normal">({entry.games}×3)-{entry.goalsAllowed}</span> = {entry.value}
                          </span>
                        ) : (
                          <>{entry.value} <span className="text-[10px] text-text-tertiary font-normal">{unit}</span></>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setLeaderboardModal(null)}
                  className="mt-4 w-full py-2.5 bg-surface hover:bg-surface-hover text-text-primary text-sm font-semibold rounded-xl border border-border transition-colors flex-shrink-0"
                >
                  Close
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
