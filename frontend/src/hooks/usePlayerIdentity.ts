import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Player } from '../api/players';

const STORAGE_KEY = 'awtyPlayerId';
const CHANGE_EVENT = 'awtyPlayerIdChanged';

function broadcast(id: string | null) {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
}

// Resolves "which player am I" with this precedence:
//   1. Google-authed user with a linked player → that player (auto-syncs across devices)
//   2. localStorage `awtyPlayerId` pointing to a known player
//   3. null (caller should prompt the picker)
//
// Pass the current `players` list so the hook can detect a stale localStorage
// id (e.g., the player was deleted) and self-clear.
export function usePlayerIdentity(players: Player[]) {
  const { user } = useAuth();
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // If localStorage points at a player that no longer exists, clear it.
  useEffect(() => {
    if (!localPlayerId || players.length === 0) return;
    if (!players.some(p => p.id === localPlayerId)) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch { /* ignore */ }
      setLocalPlayerId(null);
      broadcast(null);
    }
  }, [localPlayerId, players]);

  // Sync across hook instances within the same tab.
  useEffect(() => {
    const onChange = (e: Event) => {
      const next = (e as CustomEvent).detail as string | null;
      setLocalPlayerId(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLocalPlayerId(e.newValue);
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const authedPlayerId = user?.playerId || null;
  const playerId = authedPlayerId ?? localPlayerId;
  const player = playerId ? players.find(p => p.id === playerId) ?? null : null;

  const setIdentity = useCallback((id: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch { /* ignore */ }
    setLocalPlayerId(id);
    broadcast(id);
  }, []);

  const clearIdentity = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    setLocalPlayerId(null);
    broadcast(null);
  }, []);

  return {
    playerId,
    player,
    isFromAuth: !!authedPlayerId,
    setIdentity,
    clearIdentity,
  };
}
