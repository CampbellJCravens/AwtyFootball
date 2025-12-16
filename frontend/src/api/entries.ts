// API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export interface Entry {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEntryData {
  title: string;
  content: string;
}

// Fetch all entries
export async function fetchEntries(): Promise<Entry[]> {
  const response = await fetch(`${API_BASE_URL}/entries`);
  if (!response.ok) {
    throw new Error('Failed to fetch entries');
  }
  return response.json();
}

// Fetch a single entry by ID
export async function fetchEntry(id: string): Promise<Entry> {
  const response = await fetch(`${API_BASE_URL}/entries/${id}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Entry not found');
    }
    throw new Error('Failed to fetch entry');
  }
  return response.json();
}

// Create a new entry
export async function createEntry(data: CreateEntryData): Promise<Entry> {
  const response = await fetch(`${API_BASE_URL}/entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create entry' }));
    throw new Error(error.error || 'Failed to create entry');
  }
  return response.json();
}

// Delete an entry
export async function deleteEntry(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/entries/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Entry not found');
    }
    throw new Error('Failed to delete entry');
  }
}

