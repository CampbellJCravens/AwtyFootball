const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export interface PlayerStatsPlayer {
  id: string;
  name: string;
  pictureUrl: string | null;
}

export interface MatchHistoryEntry {
  gameId: string;
  gameNumber: number | null;
  date: string;
  team: 'color' | 'white';
  result: 'W' | 'L' | 'T';
  goalsScored: number;
  assists: number;
  colorScore: number;
  whiteScore: number;
}

export interface BestPartnerPPG {
  player: PlayerStatsPlayer;
  gamesPlayed: number;
  ppg: number;
}

export interface AssistPartner {
  player: PlayerStatsPlayer;
  count: number;
}

export interface BestGroup {
  players: PlayerStatsPlayer[];
  gamesPlayed: number;
  ppg: number;
  size: number;
}

export interface PlayerStatsResponse {
  player: PlayerStatsPlayer;
  aggregate: {
    games: number;
    wins: number;
    losses: number;
    ties: number;
    winRate: number;
    ppg: number;
    goals: number;
    assists: number;
  };
  ranks: {
    games: number;
    points: number;
    wins: number;
    ppg: number;
    goalInvolvements: number;
    goals: number;
    assists: number;
  };
  matchHistory: MatchHistoryEntry[];
  bestPartnersByPPG: BestPartnerPPG[];
  bestGroups: BestGroup[];
  myAssistsTo: AssistPartner[];
  assistsToMe: AssistPartner[];
  form: ('W' | 'L' | 'T')[];
}

export interface ChemistryEntry {
  players: PlayerStatsPlayer[];
  gamesPlayed?: number;
  wins?: number;
  ppg?: number;
  totalPoints?: number;
  totalContributions?: number;
}

export interface ChemistryResponse {
  type: string;
  results: ChemistryEntry[];
}

export async function fetchPlayerStats(playerId: string): Promise<PlayerStatsResponse> {
  const response = await fetch(`${API_BASE_URL}/stats/player/${playerId}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch player stats');
  }
  return response.json();
}

export async function fetchChemistry(
  type: 'duos' | 'trios' | 'squads' | 'goalPartners',
  minGames: number = 3,
  limit: number = 20
): Promise<ChemistryResponse> {
  const params = new URLSearchParams({ type, minGames: String(minGames), limit: String(limit) });
  const response = await fetch(`${API_BASE_URL}/stats/chemistry?${params}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch chemistry stats');
  }
  return response.json();
}

export interface MonthlyAward {
  player: PlayerStatsPlayer;
  value: number;
  games?: number;
  wins?: number;
  ties?: number;
  goals?: number;
  assists?: number;
  goalsAllowed?: number;
}

export interface MonthlyStatsResponse {
  month: number;
  year: number;
  gamesPlayed: number;
  availableMonths: { month: number; year: number }[];
  highestScoringGame: { gameNumber: number | null; date: string; colorScore: number; whiteScore: number; totalGoals: number } | null;
  awards: {
    playerOfTheMonth: MonthlyAward[] | null;
    topGoalContributor: MonthlyAward[] | null;
    topScorer: MonthlyAward[] | null;
    topAssister: MonthlyAward[] | null;
    topDefender: MonthlyAward[] | null;
    sportsmanOfTheMonth: MonthlyAward[] | null;
    dirtiestPlayerOfTheMonth: MonthlyAward[] | null;
    // null in any month without an own goal — the section is then not rendered.
    ownGoalOfTheMonth: MonthlyAward[] | null;
    topDuo: { players: [PlayerStatsPlayer, PlayerStatsPlayer]; value: number }[] | null;
    topTrio: { players: PlayerStatsPlayer[]; value: number; games?: number; wins?: number }[] | null;
  };
  leaderboards: {
    points: LeaderboardEntry[];
    goalInvolvements: LeaderboardEntry[];
    goals: LeaderboardEntry[];
    assists: LeaderboardEntry[];
    defensiveRating: LeaderboardEntry[];
    sportsmanship: LeaderboardEntry[];
    fouls: LeaderboardEntry[];
    ownGoals: LeaderboardEntry[];
  };
}

export interface LeaderboardEntry {
  player: PlayerStatsPlayer;
  value: number;
  games?: number;
  goalsAllowed?: number;
}

export async function fetchMonthlyStats(month: number, year: number): Promise<MonthlyStatsResponse> {
  const params = new URLSearchParams({ month: String(month), year: String(year) });
  const response = await fetch(`${API_BASE_URL}/stats/monthly?${params}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch monthly stats');
  }
  return response.json();
}

export interface YearlyLeaderEntry {
  player: PlayerStatsPlayer;
  value: number;
  games?: number;
  wins?: number;
  goalsAllowed?: number;
}

export interface YearlyStatsResponse {
  year: number;
  gamesPlayed: number;
  totalGoals: number;
  availableYears: number[];
  highestScoringGame: { gameNumber: number | null; date: string; colorScore: number; whiteScore: number; totalGoals: number } | null;
  awards: {
    playerOfTheYear: MonthlyAward[] | null;
    goldenBoot: MonthlyAward[] | null;
    // Most golden goals in the season. Separate from goldenBoot (most goals).
    theDecider: MonthlyAward[] | null;
    playmaker: MonthlyAward[] | null;
    ironMan: MonthlyAward[] | null;
    topDefender: MonthlyAward[] | null;
    sportsman: MonthlyAward[] | null;
    dirtiestPlayer: MonthlyAward[] | null;
  };
  bestDuo: { players: [PlayerStatsPlayer, PlayerStatsPlayer]; value: number }[] | null;
  bestTrio: { players: PlayerStatsPlayer[]; value: number; games?: number; wins?: number }[] | null;
  leaderboards: {
    points: YearlyLeaderEntry[];
    goals: YearlyLeaderEntry[];
    assists: YearlyLeaderEntry[];
    goalInvolvements: YearlyLeaderEntry[];
    appearances: YearlyLeaderEntry[];
    ppg: YearlyLeaderEntry[];
    winRate: YearlyLeaderEntry[];
    sportsmanship: YearlyLeaderEntry[];
    fouls: YearlyLeaderEntry[];
    defensiveRating: YearlyLeaderEntry[];
  };
}

export async function fetchYearlyStats(year: number, limit = 10): Promise<YearlyStatsResponse> {
  const params = new URLSearchParams({ year: String(year), limit: String(limit) });
  const response = await fetch(`${API_BASE_URL}/stats/yearly?${params}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch yearly stats');
  }
  return response.json();
}

export interface PlayerAward {
  month: number;
  year: number;
  award: string;
  value: number;
  unit: string;
  partner?: PlayerStatsPlayer;
}

export async function fetchPlayerAwards(playerId: string): Promise<PlayerAward[]> {
  const response = await fetch(`${API_BASE_URL}/stats/player/${playerId}/awards`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch player awards');
  }
  return response.json();
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  current: number;
  target: number;
  reigning?: boolean; // Highlander: currently the reigning holder (sword badge)
}

export async function fetchPlayerAchievements(playerId: string): Promise<Achievement[]> {
  const response = await fetch(`${API_BASE_URL}/stats/player/${playerId}/achievements`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch player achievements');
  }
  return response.json();
}

// Returns newly-earned achievements for the logged-in user's linked player.
// The server atomically marks them as seen, so the popup won't reappear on
// refresh or across devices.
export async function fetchNewAchievements(): Promise<Achievement[]> {
  const response = await fetch(`${API_BASE_URL}/stats/me/new-achievements`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch new achievements');
  }
  return response.json();
}

export interface LegacySeasonStat {
  goals: number;
  assists: number;
  wins: number;
}

export interface LegacyPlayerStat {
  player: PlayerStatsPlayer;
  seasons: Record<string, LegacySeasonStat>;
  totals: LegacySeasonStat;
}

export interface LegacyStatsResponse {
  seasons: string[];
  stats: LegacyPlayerStat[];
}

export interface FieldGameRecord {
  year: number;
  date: string;
  isoDate: string;
  played: string;
  location: string | null;
  // WhatsApp RSVP breakdown
  waIn: number | null;
  waPlus1: number | null;
  waPlus2: number | null;
  waMaybe: number | null;
  waOut: number | null;
  groupSize: number | null;
  // Computed rates
  eviteResponse: number | null;
  responseRate: number;
  showUp: number | null;
  attendanceRate: number;
  // Cross-reference with actual tracked game player counts
  trackedPlayers: number | null;
  turnoutVsRsvp: number | null;
  // Share of non-guest players on the date who are school alumni.
  // null for the frozen pre-2026 history (no per-player roster recorded).
  alumniRate?: number | null;
  notes: string | null;
}

const HISTORICAL_FIELD_STATS: FieldGameRecord[] = [
  { year: 2018, date: '6-Jan', isoDate: '2018-01-06', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 18, attendanceRate: 41.86, trackedPlayers: null, turnoutVsRsvp: null, notes: 'One woman' },
  { year: 2018, date: '13-Jan', isoDate: '2018-01-13', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 26, responseRate: 60.47, showUp: 16, attendanceRate: 37.21, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '20-Jan', isoDate: '2018-01-20', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 14, attendanceRate: 32.56, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '27-Jan', isoDate: '2018-01-27', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 17, responseRate: 39.53, showUp: 20, attendanceRate: 46.51, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '3-Feb', isoDate: '2018-02-03', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 16, responseRate: 37.21, showUp: 23, attendanceRate: 53.49, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Salo is trying to get his group to use the other part of the field.' },
  { year: 2018, date: '10-Feb', isoDate: '2018-02-10', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 10, responseRate: 23.26, showUp: 1, attendanceRate: 2.33, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Cancelled due to Rain and low turnout' },
  { year: 2018, date: '17-Feb', isoDate: '2018-02-17', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 20, responseRate: 46.51, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Abdul\'s cousins (Abbas and Bashir) came to play and weren\'t on the evite.  Also Christian responded for 3 players but didn\'t show up' },
  { year: 2018, date: '24-Feb', isoDate: '2018-02-24', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Cancelled due to school use.  Guys went to play at Hermann Park....' },
  { year: 2018, date: '3-Mar', isoDate: '2018-03-03', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 11, responseRate: 25.58, showUp: 20, attendanceRate: 46.51, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Abdul\'s cousins (Abbas and Bashir) came to play and weren\'t on the evite.  Christian showed up with 3 players but didn\'t respond' },
  { year: 2018, date: '10-Mar', isoDate: '2018-03-10', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 16, responseRate: 37.21, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '17-Mar', isoDate: '2018-03-17', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 12, attendanceRate: 27.91, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Mostafa wants to pay half: Last year we played 48/52 weekends, that\'s 93% (rounding up).  Do you play any other competitive leagues?  Let me break down the math for the cheapest scenario. For league play you pay about 50/6-8 games (though its typically 60-80).  That means you\'d be paying 300-400 for one season on a less than perfect field vs 75 / year on a perfect pitch.  Abdul\'s cousin\'s paid' },
  { year: 2018, date: '24-Mar', isoDate: '2018-03-24', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 16, attendanceRate: 37.21, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '31-Mar', isoDate: '2018-03-31', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 15, attendanceRate: 34.88, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '7-Apr', isoDate: '2018-04-07', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 12, responseRate: 27.91, showUp: 15, attendanceRate: 34.88, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '14-Apr', isoDate: '2018-04-14', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 12, attendanceRate: 27.91, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Initially low number followed by rain more than likely discouraged ppl from coming' },
  { year: 2018, date: '21-Apr', isoDate: '2018-04-21', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 16, attendanceRate: 37.21, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Darragh and Edward said they\'d come but didn\'t show up in the end.  Christian\'s dad stayed to play keeper and got Christian out of bed to come play soccer, Christian invited Roberto.' },
  { year: 2018, date: '28-Apr', isoDate: '2018-04-28', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Ppl brought guests (4 extra total) however 4 were maybes' },
  { year: 2018, date: '5-May', isoDate: '2018-05-05', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 16, responseRate: 37.21, showUp: 20, attendanceRate: 46.51, trackedPlayers: null, turnoutVsRsvp: null, notes: '2 guests showed up and the 2 maybe\'s showed up' },
  { year: 2018, date: '12-May', isoDate: '2018-05-12', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 16, attendanceRate: 37.21, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Brandon was a maybe but attended with his brother' },
  { year: 2018, date: '19-May', isoDate: '2018-05-19', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 15, attendanceRate: 34.88, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '26-May', isoDate: '2018-05-26', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 12, responseRate: 27.91, showUp: 16, attendanceRate: 37.21, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '2-Jun', isoDate: '2018-06-02', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 16, responseRate: 37.21, showUp: 20, attendanceRate: 46.51, trackedPlayers: null, turnoutVsRsvp: null, notes: 'People brought guests' },
  { year: 2018, date: '9-Jun', isoDate: '2018-06-09', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 20, attendanceRate: 46.51, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '16-Jun', isoDate: '2018-06-16', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 4, responseRate: 9.3, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Cancelled due to low turnout' },
  { year: 2018, date: '23-Jun', isoDate: '2018-06-23', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 13, responseRate: 30.23, showUp: 18, attendanceRate: 41.86, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '30-Jun', isoDate: '2018-06-30', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 6, responseRate: 13.95, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Cancelled due to low turnout' },
  { year: 2018, date: '7-Jul', isoDate: '2018-07-07', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 14, attendanceRate: 32.56, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '14-Jul', isoDate: '2018-07-14', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'School is cleaning and painting the field.' },
  { year: 2018, date: '21-Jul', isoDate: '2018-07-21', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 15, attendanceRate: 34.88, trackedPlayers: null, turnoutVsRsvp: null, notes: 'School is cleaning and painting the field. Played at an alternate field near Awty. Matt brought someone into the group (Jim Jenkins)  Adrian brought his Goddaughter (Pao)' },
  { year: 2018, date: '28-Jul', isoDate: '2018-07-28', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 23, responseRate: 53.49, showUp: 25, attendanceRate: 58.14, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Bosch made a surprise appearance Khaled and Fuad showed up Johnny brought 2 of his colleagues / friends again Aaron brought 1 friend - Andy' },
  { year: 2018, date: '4-Aug', isoDate: '2018-08-04', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 11, responseRate: 25.58, showUp: 14, attendanceRate: 32.56, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '11-Aug', isoDate: '2018-08-11', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 12, responseRate: 27.91, showUp: 15, attendanceRate: 34.88, trackedPlayers: null, turnoutVsRsvp: null, notes: 'No guests, 3 ppl didn\'t respond' },
  { year: 2018, date: '18-Aug', isoDate: '2018-08-18', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 17, responseRate: 39.53, showUp: 21, attendanceRate: 48.84, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '25-Aug', isoDate: '2018-08-25', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 17, responseRate: 39.53, showUp: 13, attendanceRate: 30.23, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Rain but no lightning Saturday morning which may have caused less ppl to show up' },
  { year: 2018, date: '1-Sep', isoDate: '2018-09-01', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 18, responseRate: 41.86, showUp: 13, attendanceRate: 30.23, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '8-Sep', isoDate: '2018-09-08', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 18, responseRate: 41.86, showUp: 13, attendanceRate: 30.23, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Johnny didn\'t respond, Aaron didn\'t respond but Andy showed up on his account.  Ayman rejoined ASC' },
  { year: 2018, date: '15-Sep', isoDate: '2018-09-15', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 12, responseRate: 27.91, showUp: 16, attendanceRate: 37.21, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Tommy had +2 then cancelled day of.  Others may have not shown up because of the chances of rain.  Due to the amount of rain we\'ve been having' },
  { year: 2018, date: '22-Sep', isoDate: '2018-09-22', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 9, responseRate: 20.93, showUp: 7, attendanceRate: 16.28, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Rain was the cause for lower numbers' },
  { year: 2018, date: '29-Sep', isoDate: '2018-09-29', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 7, responseRate: 16.28, showUp: 14, attendanceRate: 32.56, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Going in had a poor response (9), rain reduced expectations.   I cancelled 15 min before due to lightning and ppl started emailing over my head.  More people showed up that hadn\'t responded earlier.' },
  { year: 2018, date: '6-Oct', isoDate: '2018-10-06', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 18, responseRate: 41.86, showUp: 23, attendanceRate: 53.49, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Michael Dunlow brought 4 friends, Aaron brought 3 friends, Edward Barber rsvp\'ed didn\'t show up, Taboh didn\'t rsvp but did show up.' },
  { year: 2018, date: '13-Oct', isoDate: '2018-10-13', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 13, responseRate: 30.23, showUp: 15, attendanceRate: 34.88, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '20-Oct', isoDate: '2018-10-20', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 13, responseRate: 30.23, showUp: 20, attendanceRate: 46.51, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Weather scared a few away.  A lot of ppl didn\'t respond to evite' },
  { year: 2018, date: '27-Oct', isoDate: '2018-10-27', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 17, attendanceRate: 39.53, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '3-Nov', isoDate: '2018-11-03', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 18, attendanceRate: 41.86, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2018, date: '10-Nov', isoDate: '2018-11-10', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 16, responseRate: 37.21, showUp: 25, attendanceRate: 58.14, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Aaron had a lot of guests' },
  { year: 2018, date: '17-Nov', isoDate: '2018-11-17', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 12, responseRate: 27.91, showUp: 15, attendanceRate: 34.88, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Juan, Mostafa, and Alex didn\'t respond to evite' },
  { year: 2018, date: '24-Nov', isoDate: '2018-11-24', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 9, responseRate: 20.93, showUp: 9, attendanceRate: 20.93, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Signed up Adam.  Ayman  responded but didn\'t show up' },
  { year: 2018, date: '1-Dec', isoDate: '2018-12-01', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty was using the field' },
  { year: 2018, date: '8-Dec', isoDate: '2018-12-08', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 14, attendanceRate: 32.56, trackedPlayers: null, turnoutVsRsvp: null, notes: 'People showed up that hadn\'t responded which made up for those that responded and didn\'t show up' },
  { year: 2018, date: '15-Dec', isoDate: '2018-12-15', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 13, responseRate: 30.23, showUp: 16, attendanceRate: 37.21, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Had a few new people' },
  { year: 2018, date: '22-Dec', isoDate: '2018-12-22', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 16, attendanceRate: 37.21, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Two guests, Felipe Iba +1, James Anaissie +1' },
  { year: 2018, date: '29-Dec', isoDate: '2018-12-29', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 10, responseRate: 23.26, showUp: 9, attendanceRate: 20.93, trackedPlayers: null, turnoutVsRsvp: null, notes: 'One person didn\'t show up.' },
  { year: 2019, date: '5-Jan', isoDate: '2019-01-05', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 15, responseRate: 33.33, showUp: 16, attendanceRate: 35.56, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '12-Jan', isoDate: '2019-01-12', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 18, responseRate: 40.0, showUp: 17, attendanceRate: 37.78, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '19-Jan', isoDate: '2019-01-19', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 13, responseRate: 28.89, showUp: 13, attendanceRate: 28.89, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '26-Jan', isoDate: '2019-01-26', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 11, responseRate: 24.44, showUp: 13, attendanceRate: 28.89, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '2-Feb', isoDate: '2019-02-02', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 11, responseRate: 24.44, showUp: 13, attendanceRate: 28.89, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '9-Feb', isoDate: '2019-02-09', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 11, responseRate: 24.44, showUp: 13, attendanceRate: 28.89, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '16-Feb', isoDate: '2019-02-16', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 11, responseRate: 24.44, showUp: 13, attendanceRate: 28.89, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '23-Feb', isoDate: '2019-02-23', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 11, responseRate: 24.44, showUp: 13, attendanceRate: 28.89, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '2-Mar', isoDate: '2019-03-02', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '9-Mar', isoDate: '2019-03-09', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 16, responseRate: 35.56, showUp: 23, attendanceRate: 51.11, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '16-Mar', isoDate: '2019-03-16', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 10, responseRate: 22.22, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '23-Mar', isoDate: '2019-03-23', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 19, responseRate: 42.22, showUp: 22, attendanceRate: 48.89, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '30-Mar', isoDate: '2019-03-30', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 11, responseRate: 24.44, showUp: 15, attendanceRate: 33.33, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '6-Apr', isoDate: '2019-04-06', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 16, responseRate: 35.56, showUp: 16, attendanceRate: 35.56, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '13-Apr', isoDate: '2019-04-13', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 13, responseRate: 28.89, showUp: 19, attendanceRate: 42.22, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '20-Apr', isoDate: '2019-04-20', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 14, responseRate: 31.11, showUp: 22, attendanceRate: 48.89, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '27-Apr', isoDate: '2019-04-27', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 12, responseRate: 26.67, showUp: 16, attendanceRate: 35.56, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '4-May', isoDate: '2019-05-04', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 12, responseRate: 26.67, showUp: 16, attendanceRate: 35.56, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '11-May', isoDate: '2019-05-11', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Weather' },
  { year: 2019, date: '18-May', isoDate: '2019-05-18', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 12, responseRate: 26.67, showUp: 18, attendanceRate: 40.0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '25-May', isoDate: '2019-05-25', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 12, responseRate: 26.67, showUp: 22, attendanceRate: 48.89, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Tommy, Jon, and Adam added +4 then Tommy cancelled (srly fuck him)' },
  { year: 2019, date: '1-Jun', isoDate: '2019-06-01', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 15, responseRate: 33.33, showUp: 20, attendanceRate: 44.44, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Jon brought a guest and Johnny brought 2' },
  { year: 2019, date: '8-Jun', isoDate: '2019-06-08', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 21, responseRate: 46.67, showUp: 22, attendanceRate: 48.89, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '15-Jun', isoDate: '2019-06-15', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 17, responseRate: 37.78, showUp: 22, attendanceRate: 48.89, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Adam brought a couple friends' },
  { year: 2019, date: '22-Jun', isoDate: '2019-06-22', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 20, responseRate: 44.44, showUp: 18, attendanceRate: 40.0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '29-Jun', isoDate: '2019-06-29', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 16, responseRate: 35.56, showUp: 20, attendanceRate: 44.44, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Guests shower up' },
  { year: 2019, date: '6-Jul', isoDate: '2019-07-06', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '13-Jul', isoDate: '2019-07-13', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 15, responseRate: 33.33, showUp: 24, attendanceRate: 53.33, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Guests shower up' },
  { year: 2019, date: '20-Jul', isoDate: '2019-07-20', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 19, responseRate: 42.22, showUp: 24, attendanceRate: 53.33, trackedPlayers: null, turnoutVsRsvp: null, notes: '3 of the maybes showed up and 2 extras' },
  { year: 2019, date: '27-Jul', isoDate: '2019-07-27', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 16, responseRate: 35.56, showUp: 21, attendanceRate: 46.67, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '3-Aug', isoDate: '2019-08-03', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 16, responseRate: 35.56, showUp: 18, attendanceRate: 40.0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '10-Aug', isoDate: '2019-08-10', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 15, responseRate: 33.33, showUp: 19, attendanceRate: 42.22, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Some of the maybes showed up' },
  { year: 2019, date: '17-Aug', isoDate: '2019-08-17', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 18, responseRate: 40.0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '24-Aug', isoDate: '2019-08-24', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 7, responseRate: 15.56, showUp: 0, attendanceRate: 0.0, trackedPlayers: null, turnoutVsRsvp: null, notes: '7 People replied and none of them showed up on Saturday' },
  { year: 2019, date: '31-Aug', isoDate: '2019-08-31', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 18, responseRate: 40.0, showUp: 18, attendanceRate: 40.0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '7-Sep', isoDate: '2019-09-07', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 17, responseRate: 37.78, showUp: 21, attendanceRate: 46.67, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Lammers (Maybe) showed then JB and a few others (that didn\'t respond) showed up' },
  { year: 2019, date: '14-Sep', isoDate: '2019-09-14', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 16, responseRate: 35.56, showUp: 33, attendanceRate: 73.33, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A lot of guests showed up' },
  { year: 2019, date: '21-Sep', isoDate: '2019-09-21', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 25, responseRate: 55.56, showUp: 24, attendanceRate: 53.33, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '28-Sep', isoDate: '2019-09-28', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 18, responseRate: 40.0, showUp: 25, attendanceRate: 55.56, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A couple guests showed up' },
  { year: 2019, date: '5-Oct', isoDate: '2019-10-05', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 22, responseRate: 48.89, showUp: 20, attendanceRate: 44.44, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '12-Oct', isoDate: '2019-10-12', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 18, responseRate: 40.0, showUp: 22, attendanceRate: 48.89, trackedPlayers: null, turnoutVsRsvp: null, notes: 'a few guests from Marcos, Rebeka showed up' },
  { year: 2019, date: '19-Oct', isoDate: '2019-10-19', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 21, responseRate: 46.67, showUp: 24, attendanceRate: 53.33, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Some guests and people that didn\'t respond to the evite' },
  { year: 2019, date: '26-Oct', isoDate: '2019-10-26', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 19, responseRate: 42.22, showUp: 24, attendanceRate: 53.33, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Some guests and people that didn\'t respond to the evite (Jon)' },
  { year: 2019, date: '2-Nov', isoDate: '2019-11-02', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 20, responseRate: 44.44, showUp: 27, attendanceRate: 60.0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Two alums that played with the dads and again with us. Jon didn\'t respond to evite, the 4 Maybes showed up' },
  { year: 2019, date: '9-Nov', isoDate: '2019-11-09', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 18, responseRate: 40.0, showUp: 28, attendanceRate: 62.22, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A few new people showed up' },
  { year: 2019, date: '16-Nov', isoDate: '2019-11-16', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 16, responseRate: 35.56, showUp: 20, attendanceRate: 44.44, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A few guests showed up' },
  { year: 2019, date: '23-Nov', isoDate: '2019-11-23', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 21, responseRate: 46.67, showUp: 24, attendanceRate: 53.33, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '30-Nov', isoDate: '2019-11-30', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 13, responseRate: 28.89, showUp: 10, attendanceRate: 22.22, trackedPlayers: null, turnoutVsRsvp: null, notes: 'low turnout for thanksgiving' },
  { year: 2019, date: '7-Dec', isoDate: '2019-12-07', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 8, responseRate: 17.78, showUp: 0, attendanceRate: 0.0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'School was doing a soccer Showcase, Alternate field' },
  { year: 2019, date: '14-Dec', isoDate: '2019-12-14', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 18, responseRate: 40.0, showUp: 0, attendanceRate: 0.0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'School was hosting a soccer tournament, Alternate field' },
  { year: 2019, date: '21-Dec', isoDate: '2019-12-21', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 18, responseRate: 40.0, showUp: 18, attendanceRate: 40.0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2019, date: '28-Dec', isoDate: '2019-12-28', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 45, eviteResponse: 18, responseRate: 40.0, showUp: 16, attendanceRate: 35.56, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2020, date: '4-Jan', isoDate: '2020-01-04', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 21, responseRate: 44.68, showUp: 23, attendanceRate: 48.94, trackedPlayers: null, turnoutVsRsvp: null, notes: '3 responded day of, Mostafa didn\'t respond because he\'s a bitch' },
  { year: 2020, date: '11-Jan', isoDate: '2020-01-11', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 18, responseRate: 38.3, showUp: 23, attendanceRate: 48.94, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A few guests showed up' },
  { year: 2020, date: '18-Jan', isoDate: '2020-01-18', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 21, responseRate: 44.68, showUp: 23, attendanceRate: 48.94, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A few guests showed up as did maybes though a few confirmed that didn\'t show up' },
  { year: 2020, date: '25-Jan', isoDate: '2020-01-25', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 21, responseRate: 44.68, showUp: 25, attendanceRate: 53.19, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Adam Zebdawi came with a crew of 5' },
  { year: 2020, date: '1-Feb', isoDate: '2020-02-01', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 22, responseRate: 46.81, showUp: 25, attendanceRate: 53.19, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2020, date: '8-Feb', isoDate: '2020-02-08', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 13, responseRate: 27.66, showUp: 16, attendanceRate: 34.04, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2020, date: '15-Feb', isoDate: '2020-02-15', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 19, responseRate: 40.43, showUp: 20, attendanceRate: 42.55, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2020, date: '22-Feb', isoDate: '2020-02-22', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 15, responseRate: 31.91, showUp: 18, attendanceRate: 38.3, trackedPlayers: null, turnoutVsRsvp: null, notes: 'People brought some guests' },
  { year: 2020, date: '29-Feb', isoDate: '2020-02-29', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 19, responseRate: 40.43, showUp: 26, attendanceRate: 55.32, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Mostafa left early frustrated even though his team was winning' },
  { year: 2020, date: '7-Mar', isoDate: '2020-03-07', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 23, responseRate: 48.94, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2020, date: '14-Mar', isoDate: '2020-03-14', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 8, responseRate: 17.02, showUp: 10, attendanceRate: 21.28, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Coronavirus - Awty closed till 24-Mar' },
  { year: 2020, date: '21-Mar', isoDate: '2020-03-21', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '28-Mar', isoDate: '2020-03-28', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '4-Apr', isoDate: '2020-04-04', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '11-Apr', isoDate: '2020-04-11', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '18-Apr', isoDate: '2020-04-18', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '25-Apr', isoDate: '2020-04-25', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '2-May', isoDate: '2020-05-02', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '9-May', isoDate: '2020-05-09', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 8, responseRate: 17.02, showUp: 8, attendanceRate: 17.02, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2020, date: '16-May', isoDate: '2020-05-16', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 10, responseRate: 21.28, showUp: 10, attendanceRate: 21.28, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2020, date: '23-May', isoDate: '2020-05-23', played: 'weather', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Canceled because of weather' },
  { year: 2020, date: '30-May', isoDate: '2020-05-30', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: 9, responseRate: 19.15, showUp: 11, attendanceRate: 23.4, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2020, date: '6-Jun', isoDate: '2020-06-06', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '13-Jun', isoDate: '2020-06-13', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '20-Jun', isoDate: '2020-06-20', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '27-Jun', isoDate: '2020-06-27', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '4-Jul', isoDate: '2020-07-04', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '11-Jul', isoDate: '2020-07-11', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '18-Jul', isoDate: '2020-07-18', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '25-Jul', isoDate: '2020-07-25', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '1-Aug', isoDate: '2020-08-01', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '8-Aug', isoDate: '2020-08-08', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '15-Aug', isoDate: '2020-08-15', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '22-Aug', isoDate: '2020-08-22', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '29-Aug', isoDate: '2020-08-29', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '5-Sep', isoDate: '2020-09-05', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '12-Sep', isoDate: '2020-09-12', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '19-Sep', isoDate: '2020-09-19', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '26-Sep', isoDate: '2020-09-26', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed' },
  { year: 2020, date: '3-Oct', isoDate: '2020-10-03', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2020, date: '10-Oct', isoDate: '2020-10-10', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2020, date: '17-Oct', isoDate: '2020-10-17', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2020, date: '24-Oct', isoDate: '2020-10-24', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2020, date: '31-Oct', isoDate: '2020-10-31', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2020, date: '7-Nov', isoDate: '2020-11-07', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2020, date: '14-Nov', isoDate: '2020-11-14', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2020, date: '21-Nov', isoDate: '2020-11-21', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2020, date: '28-Nov', isoDate: '2020-11-28', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2020, date: '5-Dec', isoDate: '2020-12-05', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2020, date: '12-Dec', isoDate: '2020-12-12', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2020, date: '19-Dec', isoDate: '2020-12-19', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2020, date: '26-Dec', isoDate: '2020-12-26', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 47, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '4-Jan', isoDate: '2021-01-04', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '11-Jan', isoDate: '2021-01-11', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '18-Jan', isoDate: '2021-01-18', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '25-Jan', isoDate: '2021-01-25', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '1-Feb', isoDate: '2021-02-01', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '8-Feb', isoDate: '2021-02-08', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '15-Feb', isoDate: '2021-02-15', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '22-Feb', isoDate: '2021-02-22', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '29-Feb', isoDate: '2021-02-29', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '7-Mar', isoDate: '2021-03-07', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '14-Mar', isoDate: '2021-03-14', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '21-Mar', isoDate: '2021-03-21', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '28-Mar', isoDate: '2021-03-28', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '4-Apr', isoDate: '2021-04-04', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '11-Apr', isoDate: '2021-04-11', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '18-Apr', isoDate: '2021-04-18', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '25-Apr', isoDate: '2021-04-25', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '2-May', isoDate: '2021-05-02', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '9-May', isoDate: '2021-05-09', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '16-May', isoDate: '2021-05-16', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '23-May', isoDate: '2021-05-23', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Corona - Awty closed - Springwoods Alternate' },
  { year: 2021, date: '30-May', isoDate: '2021-05-30', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '6-Jun', isoDate: '2021-06-06', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '13-Jun', isoDate: '2021-06-13', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '20-Jun', isoDate: '2021-06-20', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '27-Jun', isoDate: '2021-06-27', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '4-Jul', isoDate: '2021-07-04', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '11-Jul', isoDate: '2021-07-11', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '18-Jul', isoDate: '2021-07-18', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '25-Jul', isoDate: '2021-07-25', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '1-Aug', isoDate: '2021-08-01', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '8-Aug', isoDate: '2021-08-08', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '15-Aug', isoDate: '2021-08-15', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '22-Aug', isoDate: '2021-08-22', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '29-Aug', isoDate: '2021-08-29', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2021, date: '5-Sep', isoDate: '2021-09-05', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '12-Sep', isoDate: '2021-09-12', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '19-Sep', isoDate: '2021-09-19', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '26-Sep', isoDate: '2021-09-26', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '3-Oct', isoDate: '2021-10-03', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '10-Oct', isoDate: '2021-10-10', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '17-Oct', isoDate: '2021-10-17', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '24-Oct', isoDate: '2021-10-24', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '31-Oct', isoDate: '2021-10-31', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 10, responseRate: 23.26, showUp: 18, attendanceRate: 41.86, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate.  We had 6-8 ppl from the other group' },
  { year: 2021, date: '7-Nov', isoDate: '2021-11-07', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '14-Nov', isoDate: '2021-11-14', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '21-Nov', isoDate: '2021-11-21', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '28-Nov', isoDate: '2021-11-28', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '5-Dec', isoDate: '2021-12-05', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '12-Dec', isoDate: '2021-12-12', played: 'alt', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty started fucking with us again and not allowing us on the pitch.  - Springwoods Alternate' },
  { year: 2021, date: '19-Dec', isoDate: '2021-12-19', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Spoke with the soccer coach directly about playing on half the field.  He seems amenable to the idea.' },
  { year: 2021, date: '26-Dec', isoDate: '2021-12-26', played: 'no', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '8-Jan', isoDate: '2022-01-08', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 10, responseRate: 20.83, showUp: 6, attendanceRate: 12.5, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Spoke with the soccer coach directly about playing on half the field.  He seems amenable to the idea.' },
  { year: 2022, date: '15-Jan', isoDate: '2022-01-15', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 12, responseRate: 25.0, showUp: 8, attendanceRate: 16.67, trackedPlayers: null, turnoutVsRsvp: null, notes: 'It was supposed to rain and a lot of ppl didn\'t show up.  We\'re building back the group.  Tommy is being a bitch' },
  { year: 2022, date: '22-Jan', isoDate: '2022-01-22', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 11, responseRate: 22.92, showUp: 12, attendanceRate: 25.0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '29-Jan', isoDate: '2022-01-29', played: 'low numbers', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 5, responseRate: 10.42, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Not enough players' },
  { year: 2022, date: '5-Feb', isoDate: '2022-02-05', played: 'weather', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Canceled due to weather' },
  { year: 2022, date: '12-Feb', isoDate: '2022-02-12', played: 'low numbers', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 8, responseRate: 16.67, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Ended up canceling' },
  { year: 2022, date: '19-Feb', isoDate: '2022-02-19', played: 'low numbers', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 2, responseRate: 4.17, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Ended up canceling' },
  { year: 2022, date: '26-Feb', isoDate: '2022-02-26', played: 'low numbers', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 5, responseRate: 10.42, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Ended up canceling' },
  { year: 2022, date: '5-Mar', isoDate: '2022-03-05', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 24, responseRate: 50.0, showUp: 26, attendanceRate: 54.17, trackedPlayers: null, turnoutVsRsvp: null, notes: 'more than 50% alumni' },
  { year: 2022, date: '12-Mar', isoDate: '2022-03-12', played: '', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '19-Mar', isoDate: '2022-03-19', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 16, responseRate: 33.33, showUp: 24, attendanceRate: 50.0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Incorporated the Springwoods guys because of Buhr\'s 5K donation' },
  { year: 2022, date: '26-Mar', isoDate: '2022-03-26', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 14, responseRate: 29.17, showUp: 16, attendanceRate: 33.33, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Used Springwoods - Awty had a track meet' },
  { year: 2022, date: '2-Apr', isoDate: '2022-04-02', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 12, responseRate: 25.0, showUp: 12, attendanceRate: 25.0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Some ppl showed up that didn\'t respond and some confirmed didn\'t show up' },
  { year: 2022, date: '9-Apr', isoDate: '2022-04-09', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 12, responseRate: 25.0, showUp: 16, attendanceRate: 33.33, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A couple invites: Tommy +2, Salo +2' },
  { year: 2022, date: '16-Apr', isoDate: '2022-04-16', played: '', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '23-Apr', isoDate: '2022-04-23', played: '', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '30-Apr', isoDate: '2022-04-30', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Awty is using the field' },
  { year: 2022, date: '7-May', isoDate: '2022-05-07', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 12, responseRate: 25.0, showUp: 23, attendanceRate: 47.92, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A couple Awty kids came out that weren\'t on the list, 1 friend of Buhr\'s, 2 ppl from Mohammed\'s group' },
  { year: 2022, date: '14-May', isoDate: '2022-05-14', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 15, responseRate: 31.25, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '21-May', isoDate: '2022-05-21', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 15, responseRate: 31.25, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A few ppl not on the evite and some didn\'t answer' },
  { year: 2022, date: '28-May', isoDate: '2022-05-28', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 13, responseRate: 27.08, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Still ppl not answering Evite' },
  { year: 2022, date: '4-Jun', isoDate: '2022-06-04', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 20, responseRate: 41.67, showUp: 30, attendanceRate: 62.5, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Great, need to police the group now' },
  { year: 2022, date: '11-Jun', isoDate: '2022-06-11', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 15, responseRate: 31.25, showUp: 26, attendanceRate: 54.17, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Some ppl not answered evite' },
  { year: 2022, date: '18-Jun', isoDate: '2022-06-18', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 22, responseRate: 45.83, showUp: 30, attendanceRate: 62.5, trackedPlayers: null, turnoutVsRsvp: null, notes: 'a couple guests showed up' },
  { year: 2022, date: '25-Jun', isoDate: '2022-06-25', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 26, responseRate: 54.17, showUp: 30, attendanceRate: 62.5, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A couple of ppl not on the list that are guests of others' },
  { year: 2022, date: '2-Jul', isoDate: '2022-07-02', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 19, responseRate: 39.58, showUp: 26, attendanceRate: 54.17, trackedPlayers: null, turnoutVsRsvp: null, notes: 'a couple guests showed up' },
  { year: 2022, date: '9-Jul', isoDate: '2022-07-09', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '16-Jul', isoDate: '2022-07-16', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 15, responseRate: 31.25, showUp: 21, attendanceRate: 43.75, trackedPlayers: null, turnoutVsRsvp: null, notes: 'a few friends showed up' },
  { year: 2022, date: '23-Jul', isoDate: '2022-07-23', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 11, responseRate: 22.92, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '30-Jul', isoDate: '2022-07-30', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 13, responseRate: 27.08, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: 'a couple guests and friends showed up' },
  { year: 2022, date: '6-Aug', isoDate: '2022-08-06', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 11, responseRate: 22.92, showUp: 28, attendanceRate: 58.33, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Not sure wasn\'t in town' },
  { year: 2022, date: '13-Aug', isoDate: '2022-08-13', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 12, responseRate: 25.0, showUp: 34, attendanceRate: 70.83, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Mofe showed up with 5 alums' },
  { year: 2022, date: '20-Aug', isoDate: '2022-08-20', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 20, responseRate: 41.67, showUp: 36, attendanceRate: 75.0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Plenty of friends showed up.  This is going to have be managed better when I get back' },
  { year: 2022, date: '27-Aug', isoDate: '2022-08-27', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 20, responseRate: 41.67, showUp: 36, attendanceRate: 75.0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Plenty of friends showed up.  This is going to have be managed better when I get back' },
  { year: 2022, date: '3-Sep', isoDate: '2022-09-03', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 19, responseRate: 39.58, showUp: 24, attendanceRate: 50.0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '10-Sep', isoDate: '2022-09-10', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 13, responseRate: 27.08, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '17-Sep', isoDate: '2022-09-17', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 12, responseRate: 25.0, showUp: 20, attendanceRate: 41.67, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '24-Sep', isoDate: '2022-09-24', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 18, responseRate: 37.5, showUp: 23, attendanceRate: 47.92, trackedPlayers: null, turnoutVsRsvp: null, notes: 'a few guests and friends showed up a couple not on the evite' },
  { year: 2022, date: '1-Oct', isoDate: '2022-10-01', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 14, responseRate: 29.17, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '8-Oct', isoDate: '2022-10-08', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 17, responseRate: 35.42, showUp: 20, attendanceRate: 41.67, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '15-Oct', isoDate: '2022-10-15', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 17, responseRate: 35.42, showUp: 24, attendanceRate: 50.0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '22-Oct', isoDate: '2022-10-22', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 10, responseRate: 20.83, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A lot of ppl didn\'t respond' },
  { year: 2022, date: '29-Oct', isoDate: '2022-10-29', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 6, responseRate: 12.5, showUp: 12, attendanceRate: 25.0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'I think they also had to enlist the new guys' },
  { year: 2022, date: '5-Nov', isoDate: '2022-11-05', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 15, responseRate: 31.25, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A couple guests, and a couple ppl that didn\'t pay dues.  Dues got collected, added 4 ppl' },
  { year: 2022, date: '12-Nov', isoDate: '2022-11-12', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 14, responseRate: 29.17, showUp: 20, attendanceRate: 41.67, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Maybes showed up, almost 100% response rate this time' },
  { year: 2022, date: '19-Nov', isoDate: '2022-11-19', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 12, responseRate: 25.0, showUp: 16, attendanceRate: 33.33, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '26-Nov', isoDate: '2022-11-26', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 12, responseRate: 25.0, showUp: 14, attendanceRate: 29.17, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '3-Dec', isoDate: '2022-12-03', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 11, responseRate: 22.92, showUp: 12, attendanceRate: 25.0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '10-Dec', isoDate: '2022-12-10', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 15, responseRate: 31.25, showUp: 20, attendanceRate: 41.67, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '17-Dec', isoDate: '2022-12-17', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 10, responseRate: 20.83, showUp: 18, attendanceRate: 37.5, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '24-Dec', isoDate: '2022-12-24', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 10, responseRate: 20.83, showUp: 20, attendanceRate: 41.67, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2022, date: '31-Dec', isoDate: '2022-12-31', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 11, responseRate: 22.92, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '7-Jan', isoDate: '2023-01-07', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 28, responseRate: 65.12, showUp: 40, attendanceRate: 93.02, trackedPlayers: null, turnoutVsRsvp: null, notes: '5 guests, 5 -6 dads stayed' },
  { year: 2023, date: '14-Jan', isoDate: '2023-01-14', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 26, responseRate: 60.47, showUp: 34, attendanceRate: 79.07, trackedPlayers: null, turnoutVsRsvp: null, notes: 'a few guests showed up as well as Mofe and his crew of 4-5' },
  { year: 2023, date: '21-Jan', isoDate: '2023-01-21', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 17, responseRate: 39.53, showUp: 30, attendanceRate: 69.77, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Still more guests' },
  { year: 2023, date: '28-Jan', isoDate: '2023-01-28', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 10, responseRate: 23.26, showUp: 25, attendanceRate: 58.14, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '4-Feb', isoDate: '2023-02-04', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 28, attendanceRate: 65.12, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Had 6 Awty alums show up that skewed the results.  Brian had a guest show up in his place' },
  { year: 2023, date: '11-Feb', isoDate: '2023-02-11', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Ppl not responding' },
  { year: 2023, date: '18-Feb', isoDate: '2023-02-18', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 7, responseRate: 16.28, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: 'It was cold so low turnout on responses but a lot of guests showed up' },
  { year: 2023, date: '25-Feb', isoDate: '2023-02-25', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Guests and ppl that didn\'t respond to the evite' },
  { year: 2023, date: '4-Mar', isoDate: '2023-03-04', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Had to make a change of field at the last minute.  I\'m expecting low attendance' },
  { year: 2023, date: '11-Mar', isoDate: '2023-03-11', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 18, responseRate: 41.86, showUp: 26, attendanceRate: 60.47, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Mofe and a couple ppl showed up that didn\'t respond to the evite' },
  { year: 2023, date: '18-Mar', isoDate: '2023-03-18', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 13, responseRate: 30.23, showUp: 23, attendanceRate: 53.49, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Mofe and Omar weren\'t on the evite.  A couple ppl responded that no showed' },
  { year: 2023, date: '25-Mar', isoDate: '2023-03-25', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 16, attendanceRate: 37.21, trackedPlayers: null, turnoutVsRsvp: null, notes: 'a couple maybes showed  up' },
  { year: 2023, date: '1-Apr', isoDate: '2023-04-01', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 21, attendanceRate: 48.84, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A couple yes\' didn\'t show and a couple maybes showed' },
  { year: 2023, date: '8-Apr', isoDate: '2023-04-08', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 18, attendanceRate: 41.86, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A couple no responses showed' },
  { year: 2023, date: '15-Apr', isoDate: '2023-04-15', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 9, responseRate: 20.93, showUp: 12, attendanceRate: 27.91, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Barely could manage one half, everyone was exhausted' },
  { year: 2023, date: '22-Apr', isoDate: '2023-04-22', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 19, responseRate: 44.19, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '29-Apr', isoDate: '2023-04-29', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 14, attendanceRate: 32.56, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Some didn\'t respond' },
  { year: 2023, date: '6-May', isoDate: '2023-05-06', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 6, responseRate: 13.95, showUp: 24, attendanceRate: 55.81, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Not sure why they didn\'t respond' },
  { year: 2023, date: '13-May', isoDate: '2023-05-13', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 18, responseRate: 41.86, showUp: 16, attendanceRate: 37.21, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Some didn\'t show, not sure why' },
  { year: 2023, date: '20-May', isoDate: '2023-05-20', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 18, attendanceRate: 41.86, trackedPlayers: null, turnoutVsRsvp: null, notes: 'They played at Alt' },
  { year: 2023, date: '27-May', isoDate: '2023-05-27', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 14, attendanceRate: 32.56, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Not sure on turnout, I was sick' },
  { year: 2023, date: '3-Jun', isoDate: '2023-06-03', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 18, attendanceRate: 41.86, trackedPlayers: null, turnoutVsRsvp: null, notes: 'a few ppl didn\'t respond' },
  { year: 2023, date: '10-Jun', isoDate: '2023-06-10', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '17-Jun', isoDate: '2023-06-17', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 14, attendanceRate: 32.56, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '24-Jun', isoDate: '2023-06-24', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 18, responseRate: 41.86, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A couple not responding and a couple not on the evite' },
  { year: 2023, date: '1-Jul', isoDate: '2023-07-01', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 13, responseRate: 30.23, showUp: 24, attendanceRate: 55.81, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '8-Jul', isoDate: '2023-07-08', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 5, responseRate: 11.63, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '15-Jul', isoDate: '2023-07-15', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 9, responseRate: 20.93, showUp: 20, attendanceRate: 46.51, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Guests and ppl that didn\'t respond showed up' },
  { year: 2023, date: '22-Jul', isoDate: '2023-07-22', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '29-Jul', isoDate: '2023-07-29', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 13, responseRate: 30.23, showUp: 24, attendanceRate: 55.81, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '5-Aug', isoDate: '2023-08-05', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 30, attendanceRate: 69.77, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Alumni showed up before heading back to college' },
  { year: 2023, date: '12-Aug', isoDate: '2023-08-12', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 38, attendanceRate: 88.37, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Alumni showed up before heading back to college' },
  { year: 2023, date: '19-Aug', isoDate: '2023-08-19', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 11, responseRate: 25.58, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '26-Aug', isoDate: '2023-08-26', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 24, attendanceRate: 55.81, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '2-Sep', isoDate: '2023-09-02', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 20, attendanceRate: 46.51, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '9-Sep', isoDate: '2023-09-09', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '16-Sep', isoDate: '2023-09-16', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 7, responseRate: 16.28, showUp: 21, attendanceRate: 48.84, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '23-Sep', isoDate: '2023-09-23', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 24, attendanceRate: 55.81, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '30-Sep', isoDate: '2023-09-30', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 10, responseRate: 23.26, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: 'a lot of no responses' },
  { year: 2023, date: '7-Oct', isoDate: '2023-10-07', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 24, attendanceRate: 55.81, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Some alums and a few guests' },
  { year: 2023, date: '14-Oct', isoDate: '2023-10-14', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 7, responseRate: 16.28, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '21-Oct', isoDate: '2023-10-21', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 20, attendanceRate: 46.51, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '28-Oct', isoDate: '2023-10-28', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 5, responseRate: 11.63, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2023, date: '4-Nov', isoDate: '2023-11-04', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 12, responseRate: 27.91, showUp: 30, attendanceRate: 69.77, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Dad\'s showed up and had us split the field at half time.  Cause a lot of friction' },
  { year: 2023, date: '11-Nov', isoDate: '2023-11-11', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 16, responseRate: 37.21, showUp: 26, attendanceRate: 60.47, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Alums are showing up' },
  { year: 2023, date: '18-Nov', isoDate: '2023-11-18', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 12, responseRate: 27.91, showUp: 26, attendanceRate: 60.47, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Alums are showing up, some ppl didn\'t respond to evite' },
  { year: 2023, date: '25-Nov', isoDate: '2023-11-25', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 13, responseRate: 30.23, showUp: 26, attendanceRate: 60.47, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Alums are showing up, some ppl didn\'t respond to evite' },
  { year: 2023, date: '2-Dec', isoDate: '2023-12-02', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 10, responseRate: 23.26, showUp: 26, attendanceRate: 60.47, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Alums are showing up and some new ppl' },
  { year: 2023, date: '9-Dec', isoDate: '2023-12-09', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Alums didn\'t respond and a couple guests / new faces' },
  { year: 2023, date: '16-Dec', isoDate: '2023-12-16', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 15, responseRate: 34.88, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: '2 guests, 2 alums that weren\'t on the list showed up' },
  { year: 2023, date: '23-Dec', isoDate: '2023-12-23', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 27, attendanceRate: 62.79, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Alumni back on vacation' },
  { year: 2023, date: '30-Dec', isoDate: '2023-12-30', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 10, responseRate: 23.26, showUp: 30, attendanceRate: 69.77, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Alumni back on vacation' },
  { year: 2024, date: '6-Jan', isoDate: '2024-01-06', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 19, responseRate: 39.58, showUp: 27, attendanceRate: 56.25, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A couple alumni, a couple ppl that hadn\'t paid dues' },
  { year: 2024, date: '13-Jan', isoDate: '2024-01-13', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 14, responseRate: 29.17, showUp: 24, attendanceRate: 50.0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Shorter game' },
  { year: 2024, date: '20-Jan', isoDate: '2024-01-20', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 10, responseRate: 20.83, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '27-Jan', isoDate: '2024-01-27', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 21, responseRate: 43.75, showUp: 26, attendanceRate: 54.17, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '3-Feb', isoDate: '2024-02-03', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 20, responseRate: 41.67, showUp: 16, attendanceRate: 33.33, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Weather people scared  about rain' },
  { year: 2024, date: '10-Feb', isoDate: '2024-02-10', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Very few ppl showed up at SpringWoods (3)' },
  { year: 2024, date: '17-Feb', isoDate: '2024-02-17', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 11, responseRate: 22.92, showUp: 27, attendanceRate: 56.25, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '24-Feb', isoDate: '2024-02-24', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 10, responseRate: 20.83, showUp: 17, attendanceRate: 35.42, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '2-Mar', isoDate: '2024-03-02', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 10, responseRate: 20.83, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '9-Mar', isoDate: '2024-03-09', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 11, responseRate: 22.92, showUp: 18, attendanceRate: 37.5, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '16-Mar', isoDate: '2024-03-16', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 8, responseRate: 16.67, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '23-Mar', isoDate: '2024-03-23', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 11, responseRate: 22.92, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '30-Mar', isoDate: '2024-03-30', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 14, responseRate: 29.17, showUp: 27, attendanceRate: 56.25, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A number of guests showed up from Tommy and myself' },
  { year: 2024, date: '6-Apr', isoDate: '2024-04-06', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 8, responseRate: 16.67, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '13-Apr', isoDate: '2024-04-13', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 11, responseRate: 22.92, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Varsity kids are showing up' },
  { year: 2024, date: '20-Apr', isoDate: '2024-04-20', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 8, responseRate: 16.67, showUp: 20, attendanceRate: 41.67, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Varsity kids are showing up' },
  { year: 2024, date: '27-Apr', isoDate: '2024-04-27', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 10, responseRate: 20.83, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Varsity kids are showing up' },
  { year: 2024, date: '4-May', isoDate: '2024-05-04', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 11, responseRate: 22.92, showUp: 24, attendanceRate: 50.0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Varsity kids are showing up' },
  { year: 2024, date: '11-May', isoDate: '2024-05-11', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 12, responseRate: 25.0, showUp: 27, attendanceRate: 56.25, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Varsity kids are showing up' },
  { year: 2024, date: '18-May', isoDate: '2024-05-18', played: 'weather', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Tornadoes' },
  { year: 2024, date: '25-May', isoDate: '2024-05-25', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 6, responseRate: 12.5, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Graduation' },
  { year: 2024, date: '1-Jun', isoDate: '2024-06-01', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 15, responseRate: 31.25, showUp: 26, attendanceRate: 54.17, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '8-Jun', isoDate: '2024-06-08', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 10, responseRate: 20.83, showUp: 26, attendanceRate: 54.17, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '15-Jun', isoDate: '2024-06-15', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 12, responseRate: 25.0, showUp: 26, attendanceRate: 54.17, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '22-Jun', isoDate: '2024-06-22', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 8, responseRate: 16.67, showUp: 31, attendanceRate: 64.58, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Sent the evite for the wrong day.  A lot of dads joined our game' },
  { year: 2024, date: '29-Jun', isoDate: '2024-06-29', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 12, responseRate: 25.0, showUp: 27, attendanceRate: 56.25, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '6-Jul', isoDate: '2024-07-06', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 15, responseRate: 31.25, showUp: 21, attendanceRate: 43.75, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '13-Jul', isoDate: '2024-07-13', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 8, responseRate: 16.67, showUp: 15, attendanceRate: 31.25, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '20-Jul', isoDate: '2024-07-20', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 13, responseRate: 27.08, showUp: 27, attendanceRate: 56.25, trackedPlayers: null, turnoutVsRsvp: null, notes: 'a couple guests' },
  { year: 2024, date: '27-Jul', isoDate: '2024-07-27', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 10, responseRate: 20.83, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '3-Aug', isoDate: '2024-08-03', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 8, responseRate: 16.67, showUp: 23, attendanceRate: 47.92, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '10-Aug', isoDate: '2024-08-10', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 10, responseRate: 20.83, showUp: 20, attendanceRate: 41.67, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '17-Aug', isoDate: '2024-08-17', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 8, responseRate: 16.67, showUp: 20, attendanceRate: 41.67, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '24-Aug', isoDate: '2024-08-24', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 12, responseRate: 25.0, showUp: 20, attendanceRate: 41.67, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '31-Aug', isoDate: '2024-08-31', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 10, responseRate: 20.83, showUp: 22, attendanceRate: 45.83, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '7-Sep', isoDate: '2024-09-07', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 7, responseRate: 14.58, showUp: 15, attendanceRate: 31.25, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '14-Sep', isoDate: '2024-09-14', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 8, responseRate: 16.67, showUp: 16, attendanceRate: 33.33, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '21-Sep', isoDate: '2024-09-21', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 5, responseRate: 10.42, showUp: 17, attendanceRate: 35.42, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '28-Sep', isoDate: '2024-09-28', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 10, responseRate: 20.83, showUp: 17, attendanceRate: 35.42, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '5-Oct', isoDate: '2024-10-05', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 14, responseRate: 29.17, showUp: 20, attendanceRate: 41.67, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '12-Oct', isoDate: '2024-10-12', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 7, responseRate: 14.58, showUp: 18, attendanceRate: 37.5, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '19-Oct', isoDate: '2024-10-19', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 11, responseRate: 22.92, showUp: 17, attendanceRate: 35.42, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '26-Oct', isoDate: '2024-10-26', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 7, responseRate: 14.58, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Fall Festival' },
  { year: 2024, date: '2-Nov', isoDate: '2024-11-02', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 11, responseRate: 22.92, showUp: 12, attendanceRate: 25.0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '9-Nov', isoDate: '2024-11-09', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 4, responseRate: 8.33, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Lower School Camp Out' },
  { year: 2024, date: '16-Nov', isoDate: '2024-11-16', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 8, responseRate: 16.67, showUp: 12, attendanceRate: 25.0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Collecting Dues so the evite is smaller' },
  { year: 2024, date: '23-Nov', isoDate: '2024-11-23', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 6, responseRate: 12.5, showUp: 8, attendanceRate: 16.67, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '30-Nov', isoDate: '2024-11-30', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 5, responseRate: 10.42, showUp: 7, attendanceRate: 14.58, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '7-Dec', isoDate: '2024-12-07', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 9, responseRate: 18.75, showUp: 12, attendanceRate: 25.0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '14-Dec', isoDate: '2024-12-14', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 9, responseRate: 18.75, showUp: 14, attendanceRate: 29.17, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2024, date: '21-Dec', isoDate: '2024-12-21', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 12, responseRate: 25.0, showUp: 16, attendanceRate: 33.33, trackedPlayers: null, turnoutVsRsvp: null, notes: 'New ppl joining the group, a couple alumni joined' },
  { year: 2024, date: '28-Dec', isoDate: '2024-12-28', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 48, eviteResponse: 7, responseRate: 14.58, showUp: 16, attendanceRate: 33.33, trackedPlayers: null, turnoutVsRsvp: null, notes: 'New ppl joining the group, a couple alumni joined' },
  { year: 2025, date: '4-Jan', isoDate: '2025-01-04', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 9, responseRate: 20.93, showUp: 17, attendanceRate: 39.53, trackedPlayers: null, turnoutVsRsvp: null, notes: 'New ppl joining the group, a couple alumni joined' },
  { year: 2025, date: '11-Jan', isoDate: '2025-01-11', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 6, responseRate: 13.95, showUp: 16, attendanceRate: 37.21, trackedPlayers: null, turnoutVsRsvp: null, notes: 'New ppl joining the group' },
  { year: 2025, date: '18-Jan', isoDate: '2025-01-18', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 7, responseRate: 16.28, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: 'New ppl joining the group' },
  { year: 2025, date: '25-Jan', isoDate: '2025-01-25', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 24, attendanceRate: 55.81, trackedPlayers: null, turnoutVsRsvp: null, notes: 'New ppl joining the group' },
  { year: 2025, date: '1-Feb', isoDate: '2025-02-01', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 18, attendanceRate: 41.86, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '8-Feb', isoDate: '2025-02-08', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 6, responseRate: 13.95, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '15-Feb', isoDate: '2025-02-15', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 6, responseRate: 13.95, showUp: 24, attendanceRate: 55.81, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '22-Feb', isoDate: '2025-02-22', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 6, responseRate: 13.95, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '1-Mar', isoDate: '2025-03-01', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 6, responseRate: 13.95, showUp: 16, attendanceRate: 37.21, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '8-Mar', isoDate: '2025-03-08', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 20, attendanceRate: 46.51, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '15-Mar', isoDate: '2025-03-15', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 6, responseRate: 13.95, showUp: 12, attendanceRate: 27.91, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '22-Mar', isoDate: '2025-03-22', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 7, responseRate: 16.28, showUp: 18, attendanceRate: 41.86, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '29-Mar', isoDate: '2025-03-29', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 12, responseRate: 27.91, showUp: 16, attendanceRate: 37.21, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '5-Apr', isoDate: '2025-04-05', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 6, responseRate: 13.95, showUp: 0, attendanceRate: 0.0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'The School was repairing the pitch' },
  { year: 2025, date: '12-Apr', isoDate: '2025-04-12', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 11, responseRate: 25.58, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '19-Apr', isoDate: '2025-04-19', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 23, attendanceRate: 53.49, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '26-Apr', isoDate: '2025-04-26', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 12, responseRate: 27.91, showUp: 23, attendanceRate: 53.49, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Some didn\'t respond to evite' },
  { year: 2025, date: '3-May', isoDate: '2025-05-03', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 4, responseRate: 9.3, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '10-May', isoDate: '2025-05-10', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 18, responseRate: 41.86, showUp: 24, attendanceRate: 55.81, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Couple guests showed up' },
  { year: 2025, date: '17-May', isoDate: '2025-05-17', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '24-May', isoDate: '2025-05-24', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 16, responseRate: 37.21, showUp: 23, attendanceRate: 53.49, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '31-May', isoDate: '2025-05-31', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 7, responseRate: 16.28, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '7-Jun', isoDate: '2025-06-07', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 23, attendanceRate: 53.49, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Alums showed up' },
  { year: 2025, date: '14-Jun', isoDate: '2025-06-14', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 11, responseRate: 25.58, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A couple ppl showed up that didn\'t pay and a few alumns' },
  { year: 2025, date: '21-Jun', isoDate: '2025-06-21', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 10, responseRate: 23.26, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: 'A couple ppl showed up that didn\'t pay and a few alumns' },
  { year: 2025, date: '28-Jun', isoDate: '2025-06-28', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Couple guests showed up' },
  { year: 2025, date: '5-Jul', isoDate: '2025-07-05', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 11, responseRate: 25.58, showUp: 23, attendanceRate: 53.49, trackedPlayers: null, turnoutVsRsvp: null, notes: '5 new alumns showed up and 2 guests.  It was a great game' },
  { year: 2025, date: '12-Jul', isoDate: '2025-07-12', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 14, responseRate: 32.56, showUp: 20, attendanceRate: 46.51, trackedPlayers: null, turnoutVsRsvp: null, notes: 'New Alums showed up and some guests' },
  { year: 2025, date: '19-Jul', isoDate: '2025-07-19', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Didn\'t even get notified the field wouldn\'t be available, had to be informed by a dad\'s son.  When confronted Lindsay she said she didn\'t know and after 5 emails remembered they might be painting the field this weekend.' },
  { year: 2025, date: '26-Jul', isoDate: '2025-07-26', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 4, responseRate: 9.3, showUp: 15, attendanceRate: 34.88, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Still painting the field' },
  { year: 2025, date: '2-Aug', isoDate: '2025-08-02', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 10, responseRate: 23.26, showUp: 23, attendanceRate: 53.49, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '9-Aug', isoDate: '2025-08-09', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 5, responseRate: 11.63, showUp: 23, attendanceRate: 53.49, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '16-Aug', isoDate: '2025-08-16', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 10, responseRate: 23.26, showUp: 22, attendanceRate: 51.16, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '23-Aug', isoDate: '2025-08-23', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 9, responseRate: 20.93, showUp: 14, attendanceRate: 32.56, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Not sure why so low this weekend, the weather was decent' },
  { year: 2025, date: '30-Aug', isoDate: '2025-08-30', played: 'low numbers', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 3, responseRate: 6.98, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: 'Not sure, because of low numbers and I was out of town' },
  { year: 2025, date: '6-Sep', isoDate: '2025-09-06', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 10, responseRate: 23.26, showUp: 8, attendanceRate: 18.6, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '13-Sep', isoDate: '2025-09-13', played: 'school use', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: null, responseRate: 0, showUp: null, attendanceRate: 0, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '20-Sep', isoDate: '2025-09-20', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 7, attendanceRate: 16.28, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
  { year: 2025, date: '27-Sep', isoDate: '2025-09-27', played: 'yes', location: null, waIn: null, waPlus1: null, waPlus2: null, waMaybe: null, waOut: null, groupSize: 43, eviteResponse: 8, responseRate: 18.6, showUp: 7, attendanceRate: 16.28, trackedPlayers: null, turnoutVsRsvp: null, notes: null },
];

const GROUP_SIZE = 44;

// Real field data for Oct 2025 - Jan 2026, recorded from WhatsApp RSVPs and hardcoded
// here before the live backend existed. Part of the frozen pre-live record.
// Response rate uses the current formula: ceil(In + +1 + +2 + 0.5*Maybe) over the roster.
// showUp is the actual game turnout where a game record exists, else the poll body estimate.
function wa(waIn: number, waPlus1: number, waPlus2: number, waMaybe: number, waOut: number, year: number, month: number, day: number, location: 'stadium' | 'grass' | 'turf', actualPlayers?: number): FieldGameRecord {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const showUp = actualPlayers ?? (waIn + waPlus1 * 2 + waPlus2 * 3);
  const respCount = Math.ceil(waIn + waPlus1 + waPlus2 + 0.5 * waMaybe);
  const isoDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return {
    year, date: `${day}-${MONTHS[month-1]}`, isoDate, played: 'yes', location,
    waIn, waPlus1, waPlus2, waMaybe, waOut, groupSize: GROUP_SIZE,
    eviteResponse: respCount,
    responseRate: parseFloat((respCount / GROUP_SIZE * 100).toFixed(2)),
    showUp,
    attendanceRate: parseFloat((showUp / GROUP_SIZE * 100).toFixed(2)),
    trackedPlayers: null, turnoutVsRsvp: null, notes: null,
  };
}

const RECENT_FIELD_STATS: FieldGameRecord[] = [
  wa(10, 3, 0,  3,  7,  2025, 10,  4, 'stadium'),
  wa(15, 2, 0,  4,  8,  2025, 10, 11, 'stadium'),
  wa(11, 2, 0,  1, 10,  2025, 10, 18, 'grass'),
  wa(10, 1, 0,  2, 15,  2025, 10, 25, 'stadium'),
  wa(11, 0, 0,  5, 10,  2025, 11,  1, 'stadium'),
  wa( 7, 1, 0,  2, 14,  2025, 11,  8, 'stadium'),
  wa( 9, 1, 0,  5, 12,  2025, 11, 15, 'grass'),
  wa( 5, 0, 0,  2, 19,  2025, 11, 22, 'stadium'),
  wa(11, 2, 1,  1, 10,  2025, 11, 29, 'stadium'),
  wa(12, 2, 0,  4,  9,  2025, 12,  6, 'stadium'),
  wa(17, 3, 1,  5,  5,  2025, 12, 13, 'stadium', 24),
  wa(14, 1, 0,  3,  8,  2025, 12, 20, 'stadium', 18),
  wa(11, 0, 1,  1, 11,  2025, 12, 27, 'stadium', 15),
  wa(12, 0, 2,  5,  9,  2026,  1,  3, 'stadium'),
  wa(15, 1, 0,  2,  6,  2026,  1, 10, 'stadium'),
  wa(23, 1, 0,  1,  2,  2026,  1, 17, 'stadium'),
];

// Field history has two sources: the frozen hardcoded record (HISTORICAL_FIELD_STATS
// 2018-Sept 2025 + RECENT_FIELD_STATS Oct 2025-Jan 2026) and the live backend (2026 on).
// Merge by date: keep every hardcoded row, and let live backend rows (2026+) win on any
// overlapping week. Falls back to the hardcoded record if the backend is unreachable.
export async function fetchFieldStats(): Promise<FieldGameRecord[]> {
  const hardcoded = [...HISTORICAL_FIELD_STATS, ...RECENT_FIELD_STATS];
  try {
    const response = await fetch(`${API_BASE_URL}/stats/field-stats`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('not ok');
    const backend: FieldGameRecord[] = await response.json();
    const byDate = new Map<string, FieldGameRecord>();
    for (const r of hardcoded) byDate.set(r.isoDate, r);
    for (const r of backend) if (r.year >= 2026) byDate.set(r.isoDate, r);
    return Array.from(byDate.values()).sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  } catch {
    return hardcoded;
  }
}

export async function fetchLegacyStats(season?: string): Promise<LegacyStatsResponse> {
  const params = season && season !== 'all' ? `?season=${season}` : '';
  const response = await fetch(`${API_BASE_URL}/stats/legacy${params}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch legacy stats');
  }
  return response.json();
}

export interface ReliabilityPlayer {
  id: string;
  name: string;
  pictureUrl: string | null;
  responded: number;
  committed: number;
  showed: number;
  showedWhenCommitted: number;
  noShow: number;
  // Four mutually exclusive response buckets. Only silence → showed is a GHOST.
  // A Maybe who shows has CONVERTED; an Out who shows is a REVERSAL.
  maybed: number;
  converted: number;
  declined: number;
  reversed: number;
  silent: number;
  ghost: number;
  guestsBrought: number;
  gamesWithGuests: number;
  responseRate: number | null;         // fractions 0-1, or null when denominator is 0
  showWhenCommittedRate: number | null;
  convertRate: number | null;
  reversalRate: number | null;
  ghostRate: number | null;
  attendanceRate: number | null;
  guestAttachRate: number | null;
}

export interface ReliabilitySummary {
  avgResponses: number;   // avg poll responses per game
  avgTurnout: number;     // avg real players who showed per game
  guestsIndicated: number; // guests flagged in polls (season)
  guestsShown: number;     // guest slots on rosters = guests who showed (season)
  baseRates: {
    yes: number; maybe: number; no: number; silent: number;
    n: { yes: number; maybe: number; no: number; silent: number };
  };
}

export interface ReliabilityResponse {
  totalTrackedGames: number;
  summary: ReliabilitySummary;
  players: ReliabilityPlayer[];
}

// Admin-only. 403s for non-admins.
export async function fetchReliability(): Promise<ReliabilityResponse> {
  const response = await fetch(`${API_BASE_URL}/stats/reliability`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch reliability stats');
  }
  return response.json();
}

export type RsvpBucket = 'yes' | 'maybe' | 'no' | 'silent';

export interface TurnoutPlayer {
  id: string;
  name: string;
  pictureUrl: string | null;
  bucket: RsvpBucket;
  probability: number;   // 0-1
  n: number;             // games behind their own rate; 0 = pure league prior
}

export interface TurnoutBreakdown {
  bucket: RsvpBucket;
  count: number;
  expected: number;
  baseRate: number;
  n: number;
}

export interface TurnoutResponse {
  gameId: string;
  totalTrackedGames: number;
  sufficientData: boolean;
  expected: number;        // players + guests
  expectedPlayers: number;
  expectedGuests: number;
  guestsIndicated: number;
  unflaggedGuestsPerGame: number;
  low: number;
  high: number;
  sd: number;
  seasonMedian: number | null;
  thinThreshold: number | null;  // season bottom decile
  probThin: number | null;       // P(turnout < thinThreshold)
  breakdown: TurnoutBreakdown[];
  players: TurnoutPlayer[];
}

// Admin-only by design — there is no public turnout payload. A projection shown
// to the group is self-fulfilling, and per-player show rates would be corrosive.
export async function fetchTurnout(gameId: string): Promise<TurnoutResponse> {
  const response = await fetch(`${API_BASE_URL}/stats/turnout/${gameId}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch turnout projection');
  }
  return response.json();
}
