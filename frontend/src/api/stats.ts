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
  goals?: number;
  assists?: number;
}

export interface MonthlyStatsResponse {
  month: number;
  year: number;
  gamesPlayed: number;
  availableMonths: { month: number; year: number }[];
  awards: {
    playerOfTheMonth: MonthlyAward[] | null;
    topGoalContributor: MonthlyAward[] | null;
    topScorer: MonthlyAward[] | null;
    topAssister: MonthlyAward[] | null;
  };
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

export interface PlayerAward {
  month: number;
  year: number;
  award: string;
  value: number;
  unit: string;
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
