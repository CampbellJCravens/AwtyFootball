// API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export interface Goal {
  scorerId: string;
  assisterId: string | null;
  timestamp: string; // ISO date string
  team: 'color' | 'white' | null;
}

export interface Game {
  id: string;
  createdAt: string;
  updatedAt: string;
  teamAssignments?: Record<string, 'color' | 'white'>;
  goals?: Goal[];
}

export interface UpdateGameData {
  teamAssignments?: Record<string, 'color' | 'white'>;
  goals?: Goal[];
  createdAt?: string; // ISO date string
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
  const response = await fetch(`${API_BASE_URL}/games/${id}`);
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

