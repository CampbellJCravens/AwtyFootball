// API configuration
import Papa, { ParseResult } from 'papaparse';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export interface Goal {
  scorerId: string;
  assisterId: string | null;
  timestamp: string; // ISO date string
  // The team CREDITED with the goal — for an own goal, the scorer's opponent.
  team: 'color' | 'white' | null;
  ownGoal?: boolean;
  // Ended the game under sudden death. Categorisation only.
  goldenGoal?: boolean;
  // Scoreline weight; absent or 1 = normal. Player credit is ALWAYS 1.
  value?: number;
}

// Own goals credit the opposition, so `team` handles the scoreline. Never
// credit the scorer's own tally with one.
export const isScoringGoal = (g: { ownGoal?: boolean }) => !g.ownGoal;
export const isOwnGoal = (g: { ownGoal?: boolean }) => g.ownGoal === true;

export interface TeamChange {
  playerId: string;
  timestamp: string; // ISO date string
  team: 'color' | 'white';
  type: 'leave' | 'swap';
  previousTeam?: 'color' | 'white';
  newTeam?: 'color' | 'white';
}

export interface GameEvent {
  // secondHalfStart marks play resuming; the clock is stopped between it and
  // halfTime. Must stay in step with the zod enum in backend/src/schemas/game.ts
  // — the API rejects the whole game save on an unknown type.
  type: 'halfTime' | 'secondHalfStart' | 'gameOver' | 'goldenGoalArmed';
  n?: number; // goal difference frozen at arming; only on goldenGoalArmed
  trailing?: 'color' | 'white' | null; // team behind at arming; null = level
  timestamp: string; // ISO date string
}

export type GameField = 'stadium' | 'grass' | 'cancelled';

// One guest appearance. `slotPlayerId` is the GuestN pool Player that carries
// the guest through teamAssignments/goals — `guestName` is a display label
// only and is NEVER written to Player.name (guest exclusion across the app
// string-matches that name).
export interface GuestVisit {
  slotPlayerId: string;
  guestId: string | null;
  guestName: string | null;
  hostPlayerId: string | null;
}

// What the client sends: the name is unresolved text, the server maps it to a
// durable Guest identity.
export interface GuestVisitInput {
  slotPlayerId: string;
  guestName: string | null;
  hostPlayerId: string | null;
}

export interface Game {
  id: string;
  gameNumber: number | null; // Can be null for existing games before migration
  createdAt: string;
  updatedAt: string;
  teamAssignments?: Record<string, 'color' | 'white'>;
  goals?: Goal[];
  teamChanges?: TeamChange[];
  gameEvents?: GameEvent[];
  sportsmanship?: Record<string, number>;
  fouls?: Record<string, number>;
  field?: GameField | null;
  // Kick-off, set by the start button. null/absent = not started. Never use this
  // as the game date — createdAt is the date everywhere.
  startedAt?: string | null;
  guestVisits?: GuestVisit[]; // only returned by fetchGame/updateGame, not the list
  // How competitive the game was, computed server-side. Describes the GAME —
  // it is never attributed to a player. See MATCH_ANALYTICS_PRD.md.
  balance?: {
    margin: number;
    leadChanges: number;
    comeback: boolean | null;
    tie: boolean;
    quality: 'classic' | 'close' | 'competitive' | 'oneSided';
    qualityLabel: string;
  };
}

export interface UpdateGameData {
  guestVisits?: GuestVisitInput[];
  teamAssignments?: Record<string, 'color' | 'white'>;
  goals?: Goal[];
  teamChanges?: TeamChange[];
  gameEvents?: GameEvent[];
  sportsmanship?: Record<string, number>;
  fouls?: Record<string, number>;
  createdAt?: string; // ISO date string
  gameNumber?: number; // Add game number
  field?: GameField | null;
  startedAt?: string | null; // ISO date string; null clears a mis-tapped start
}

// Fetch all games
export async function fetchGames(): Promise<Game[]> {
  const response = await fetch(`${API_BASE_URL}/games`, {
    credentials: 'include', // Include cookies for authentication
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication required');
    }
    throw new Error('Failed to fetch games');
  }
  return response.json();
}

// Fetch a single game by ID
export async function fetchGame(id: string): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${id}`, {
    credentials: 'include', // Include cookies for authentication
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Game not found');
    }
    throw new Error('Failed to fetch game');
  }
  return response.json();
}

// Create a new game. Pass an ISO string to override the server's default
// (frontend uses this to set "next Saturday 8:45 AM" in browser-local time).
export async function createGame(createdAt?: string): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(createdAt ? { createdAt } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create game' }));
    throw new Error(error.error || 'Failed to create game');
  }
  return response.json();
}

// Update a game
export async function updateGame(id: string, data: UpdateGameData): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for authentication
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication required');
    }
    if (response.status === 404) {
      throw new Error('Game not found');
    }
    const error = await response.json().catch(() => ({ error: 'Failed to update game' }));
    throw new Error(error.error || 'Failed to update game');
  }
  return response.json();
}

// Delete a game
export async function deleteGame(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/games/${id}`, {
    method: 'DELETE',
    credentials: 'include', // Include cookies for authentication
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Game not found');
    }
    throw new Error('Failed to delete game');
  }
}

// Export game data to Google Sheets
export async function exportGameToSheets(
  id: string,
  teamSwaps: Array<{ playerId: string; timestamp: string; team: 'color' | 'white' }>
): Promise<{ message: string; playersCount: number; gameSummaryCount: number }> {
  const response = await fetch(`${API_BASE_URL}/games/${id}/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ teamSwaps }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to export game' }));
    throw new Error(error.error || 'Failed to export game');
  }
  return response.json();
}

// Parse CSV and extract available games
export function parseAvailableGames(playersCsv: string, gameSummaryCsv: string): string[] {
  const playersParseResult: ParseResult<any> = Papa.parse(playersCsv, {
    header: true,
    skipEmptyLines: true,
  });

  const gameSummaryParseResult: ParseResult<any> = Papa.parse(gameSummaryCsv, {
    header: true,
    skipEmptyLines: true,
  });

  const gamesSet = new Set<string>();

  // Extract games from players CSV
  playersParseResult.data.forEach((row: any) => {
    if (row.Game) {
      gamesSet.add(row.Game);
    }
  });

  // Extract games from game summary CSV
  gameSummaryParseResult.data.forEach((row: any) => {
    if (row.Game) {
      gamesSet.add(row.Game);
    }
  });

  return Array.from(gamesSet).sort();
}

// Import game data from CSV
export async function importGameFromCsv(
  id: string,
  playersCsv: string,
  gameSummaryCsv: string,
  selectedGameName: string
): Promise<{ message: string; playersCount: number; goalsCount: number; teamSwapsCount: number }> {
  const response = await fetch(`${API_BASE_URL}/games/${id}/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ playersCsv, gameSummaryCsv, selectedGameName }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to import game' }));
    throw new Error(error.error || 'Failed to import game');
  }
  return response.json();
}

// Import game data from CSV into a new game
export async function importGameFromCsvNew(
  playersCsv: string,
  gameSummaryCsv: string,
  selectedGameName: string
): Promise<{ game: Game; message: string; playersCount: number; goalsCount: number }> {
  const response = await fetch(`${API_BASE_URL}/games/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ playersCsv, gameSummaryCsv, selectedGameName }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to import game' }));
    throw new Error(error.error || 'Failed to import game');
  }
  return response.json();
}

