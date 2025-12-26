// API configuration
import Papa, { ParseResult } from 'papaparse';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export interface Goal {
  scorerId: string;
  assisterId: string | null;
  timestamp: string; // ISO date string
  team: 'color' | 'white' | null;
}

export interface Game {
  id: string;
  gameNumber: number | null; // Can be null for existing games before migration
  createdAt: string;
  updatedAt: string;
  teamAssignments?: Record<string, 'color' | 'white'>;
  goals?: Goal[];
}

export interface UpdateGameData {
  teamAssignments?: Record<string, 'color' | 'white'>;
  goals?: Goal[];
  createdAt?: string; // ISO date string
  gameNumber?: number; // Add game number
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

// Create a new game
export async function createGame(): Promise<Game> {
  const response = await fetch(`${API_BASE_URL}/games`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for authentication
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

