// API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Get current guest count
export async function getGuestCount(): Promise<number> {
  const response = await fetch(`${API_BASE_URL}/settings/guest-count`);
  if (!response.ok) {
    throw new Error('Failed to fetch guest count');
  }
  const data = await response.json();
  return data.guestCount;
}

// Increment guest count and return new count
export async function incrementGuestCount(): Promise<number> {
  const response = await fetch(`${API_BASE_URL}/settings/increment-guest-count`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error('Failed to increment guest count');
  }
  const data = await response.json();
  return data.guestCount;
}

