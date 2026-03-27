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
    ppg: number;
    goals: number;
    wins: number;
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
  winRate?: number;
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
