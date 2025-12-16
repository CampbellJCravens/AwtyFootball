// API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export interface Player {
  id: string;
  name: string;
  pictureUrl: string | null;
  team: 'dark' | 'white' | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlayerData {
  name: string;
  pictureUrl?: string;
  team?: 'dark' | 'white';
}

export interface UpdatePlayerData {
  name?: string;
  pictureUrl?: string;
  team?: 'dark' | 'white';
}

// Fetch all players
export async function fetchPlayers(): Promise<Player[]> {
  const response = await fetch(`${API_BASE_URL}/players`, {
    credentials: 'include', // Include cookies for authentication
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication required');
    }
    throw new Error('Failed to fetch players');
  }
  return response.json();
}

// Fetch a single player by ID
export async function fetchPlayer(id: string): Promise<Player> {
  const response = await fetch(`${API_BASE_URL}/players/${id}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Player not found');
    }
    throw new Error('Failed to fetch player');
  }
  return response.json();
}

// Create a new player
export async function createPlayer(data: CreatePlayerData): Promise<Player> {
  const response = await fetch(`${API_BASE_URL}/players`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for authentication
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create player' }));
    // Include validation details if available
    const errorMessage = error.details 
      ? `${error.error || 'Validation error'}: ${JSON.stringify(error.details)}`
      : error.error || error.message || 'Failed to create player';
    throw new Error(errorMessage);
  }
  return response.json();
}

// Update a player
export async function updatePlayer(id: string, data: UpdatePlayerData): Promise<Player> {
  const response = await fetch(`${API_BASE_URL}/players/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for authentication
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Player not found');
    }
    const error = await response.json().catch(() => ({ error: 'Failed to update player' }));
    throw new Error(error.error || 'Failed to update player');
  }
  return response.json();
}

// Delete a player
export async function deletePlayer(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/players/${id}`, {
    method: 'DELETE',
    credentials: 'include', // Include cookies for authentication
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Player not found');
    }
    throw new Error('Failed to delete player');
  }
}

// Helper function to convert file to base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

