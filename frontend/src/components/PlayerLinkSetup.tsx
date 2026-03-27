import { useState, useMemo, ChangeEvent } from 'react';
import { Player } from '../api/players';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

interface PlayerLinkSetupProps {
  userEmail: string;
  userName?: string;
  players: Player[];
  onLinked: () => void;
}

function extractNameFromEmail(email: string): string[] {
  const local = email.split('@')[0];
  // Split on dots, underscores, numbers, and common patterns
  const parts = local
    .replace(/[0-9]+/g, ' ')
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(p => p.length > 1)
    .map(p => p.toLowerCase());
  return parts;
}

function scorePlayerMatch(player: Player, emailParts: string[], userName?: string): number {
  const nameLower = player.name.toLowerCase();
  const nameParts = nameLower.split(/\s+/);
  let score = 0;

  // Check email parts against player name
  for (const part of emailParts) {
    for (const np of nameParts) {
      if (np.startsWith(part) || part.startsWith(np)) {
        score += 10;
      } else if (np.includes(part) || part.includes(np)) {
        score += 5;
      }
    }
  }

  // Check Google display name against player name
  if (userName) {
    const userParts = userName.toLowerCase().split(/\s+/);
    for (const up of userParts) {
      for (const np of nameParts) {
        if (up === np) score += 20;
        else if (np.startsWith(up) || up.startsWith(np)) score += 10;
      }
    }
  }

  return score;
}

export default function PlayerLinkSetup({ userEmail, userName, players, onLinked }: PlayerLinkSetupProps) {
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [searchQuery, setSearchQuery] = useState('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New player form state
  const [newName, setNewName] = useState(userName || '');
  const [newPictureFile, setNewPictureFile] = useState<File | null>(null);
  const [newPicturePreview, setNewPicturePreview] = useState<string | null>(null);

  const emailParts = useMemo(() => extractNameFromEmail(userEmail), [userEmail]);

  const sortedPlayers = useMemo(() => {
    const scored = players
      .filter(p => !p.name.includes('Guest'))
      .map(p => ({ player: p, score: scorePlayerMatch(p, emailParts, userName) }));

    // Filter by search
    const filtered = searchQuery
      ? scored.filter(s => s.player.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : scored;

    return filtered.sort((a, b) => b.score - a.score || a.player.name.localeCompare(b.player.name));
  }, [players, emailParts, userName, searchQuery]);

  const handleLinkPlayer = async (playerId: string) => {
    try {
      setLinking(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/auth/link-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerId }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to link player');
      }
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link player');
    } finally {
      setLinking(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewPictureFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setNewPicturePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleCreatePlayer = async () => {
    if (!newName.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setLinking(true);
      setError(null);

      let pictureUrl: string | null = null;
      if (newPictureFile) {
        pictureUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(newPictureFile);
        });
      }

      const response = await fetch(`${API_BASE_URL}/auth/setup-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newName.trim(), pictureUrl }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create profile');
      }
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile');
    } finally {
      setLinking(false);
    }
  };

  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gold mb-2">Link Your Player Profile</h2>
        <p className="text-text-secondary text-sm">Connect your account to a player to see your stats and match history.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{error}</div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('select')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
            mode === 'select' ? 'bg-accent text-text-on-accent' : 'bg-surface-raised text-text-secondary hover:bg-surface-active'
          }`}
        >
          I'm Already a Player
        </button>
        <button
          onClick={() => setMode('create')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
            mode === 'create' ? 'bg-accent text-text-on-accent' : 'bg-surface-raised text-text-secondary hover:bg-surface-active'
          }`}
        >
          I'm New
        </button>
      </div>

      {mode === 'select' ? (
        <>
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary placeholder-text-muted"
            />
          </div>

          {sortedPlayers.length > 0 && sortedPlayers[0].score > 0 && !searchQuery && (
            <p className="text-xs text-gold font-medium mb-2 uppercase tracking-wider">Suggested for you</p>
          )}

          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {sortedPlayers.map(({ player, score }, i) => (
              <button
                key={player.id}
                onClick={() => handleLinkPlayer(player.id)}
                disabled={linking}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left disabled:opacity-50 ${
                  score > 0 && i < 3 && !searchQuery
                    ? 'bg-gold/10 border-gold/30 hover:bg-gold/20'
                    : 'bg-surface border-border hover:bg-surface-hover'
                }`}
              >
                {player.pictureUrl ? (
                  <img src={player.pictureUrl} alt={player.name} className="w-10 h-10 rounded-full object-cover border-2 border-border-emphasis flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-surface-active flex items-center justify-center text-text-primary font-semibold flex-shrink-0">
                    {getInitial(player.name)}
                  </div>
                )}
                <span className="text-sm font-medium text-text-primary flex-1">{player.name}</span>
                {score > 0 && i < 3 && !searchQuery && (
                  <span className="text-[10px] text-gold font-semibold">SUGGESTED</span>
                )}
              </button>
            ))}
            {sortedPlayers.length === 0 && (
              <p className="text-center py-6 text-text-tertiary text-sm">No players found.</p>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Full Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-2.5 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary placeholder-text-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Profile Picture (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-full px-4 py-2 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-accent-muted file:text-accent hover:file:bg-accent-subtle"
            />
            {newPicturePreview && (
              <div className="mt-3 flex justify-center">
                <img src={newPicturePreview} alt="Preview" className="w-20 h-20 rounded-full object-cover border-2 border-border-emphasis" />
              </div>
            )}
          </div>
          <button
            onClick={handleCreatePlayer}
            disabled={linking || !newName.trim()}
            className="w-full bg-gold text-text-on-accent py-3 rounded-xl font-medium hover:bg-gold-hover active:bg-gold-active disabled:bg-surface-active disabled:text-text-muted disabled:cursor-not-allowed transition-colors"
          >
            {linking ? 'Creating...' : 'Create Profile & Join'}
          </button>
        </div>
      )}
    </div>
  );
}
