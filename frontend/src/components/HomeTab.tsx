import { useState, useEffect } from 'react';
import { fetchMonthlyStats, MonthlyStatsResponse, MonthlyAward } from '../api/stats';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface HomeTabProps {
  onPlayerClick?: (playerId: string) => void;
}

function AwardCard({ award, statLabel, showDetailedStats, onPlayerClick }: {
  award: MonthlyAward;
  statLabel: string;
  showDetailedStats?: boolean;
  onPlayerClick?: (playerId: string) => void;
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
            {[award.games != null && `${award.games} Games`, award.goals != null && `${award.goals} Goals`, award.assists != null && `${award.assists} Assists`].filter(Boolean).join(' · ')}
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
          <img src={award.player.pictureUrl} alt={award.player.name} className="w-28 h-28 rounded-full object-cover border-4 border-gold/30" />
        ) : (
          <div className="w-28 h-28 rounded-full bg-surface-active flex items-center justify-center text-text-primary text-4xl font-black border-4 border-gold/30">
            {getInitial(award.player.name)}
          </div>
        )}
      </div>
    </div>
  );
}

function AwardSection({ title, titlePlural, emoji, statLabel, awards, showDetailedStats, onPlayerClick }: {
  title: string;
  titlePlural?: string;
  emoji?: string;
  statLabel: string;
  awards: MonthlyAward[] | null;
  showDetailedStats?: boolean;
  onPlayerClick?: (playerId: string) => void;
}) {
  if (!awards || awards.length === 0) return null;
  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  const isTied = awards.length > 1;
  const displayTitle = isTied && titlePlural ? titlePlural : title;

  return (
    <div className="mb-6">
      <h3 className="text-lg font-bold text-text-primary mb-2">{emoji && <span className="mr-1.5">{emoji}</span>}{displayTitle}</h3>
      {!isTied ? (
        <AwardCard award={awards[0]} statLabel={statLabel} showDetailedStats={showDetailedStats} onPlayerClick={onPlayerClick} />
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
                  onClick={onPlayerClick ? () => onPlayerClick(award.player.id) : undefined}
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

export default function HomeTab({ onPlayerClick }: HomeTabProps) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<MonthlyStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const result = await fetchMonthlyStats(month, year);
        setData(result);
      } catch (err) {
        console.error('Failed to load monthly stats:', err);
      } finally {
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
            <p className="text-xs text-text-tertiary font-medium mb-4">{data.gamesPlayed} game{data.gamesPlayed !== 1 ? 's' : ''} played this month</p>

            <AwardSection
              title="Player of the Month"
              titlePlural="Players of the Month"
              emoji="👑"
              statLabel={`${data.awards.playerOfTheMonth?.[0]?.value ?? 0} Points`}
              awards={data.awards.playerOfTheMonth}
              showDetailedStats
              onPlayerClick={onPlayerClick}
            />
            <AwardSection
              title="Top Goal Contributor"
              titlePlural="Top Goal Contributors"
              emoji="🎯"
              statLabel={`${data.awards.topGoalContributor?.[0]?.value ?? 0} Goals and Assists`}
              awards={data.awards.topGoalContributor}
              onPlayerClick={onPlayerClick}
            />
            <AwardSection
              title="Top Scorer"
              titlePlural="Top Scorers"
              emoji="⚽"
              statLabel={`${data.awards.topScorer?.[0]?.value ?? 0} Goals`}
              awards={data.awards.topScorer}
              onPlayerClick={onPlayerClick}
            />
            <AwardSection
              title="Top Assister"
              titlePlural="Top Assisters"
              emoji="🤝"
              statLabel={`${data.awards.topAssister?.[0]?.value ?? 0} Assists`}
              awards={data.awards.topAssister}
              onPlayerClick={onPlayerClick}
            />
          </div>
        )}
      </div>
    </div>
  );
}
