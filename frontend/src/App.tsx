import { useState, useEffect, useRef, useCallback } from 'react';
import { Player, fetchPlayers, deletePlayer } from './api/players';
import { Game, GameField, fetchGames, createGame, updateGame, deleteGame, importGameFromCsvNew, parseAvailableGames } from './api/games';
import { Achievement, fetchNewAchievements } from './api/stats';
import { useAuth } from './contexts/AuthContext';
import { usePlayerIdentity } from './hooks/usePlayerIdentity';
import { nextSaturdayKickoff, sameSlot } from './utils/gameSchedule';
import PlayerForm from './components/PlayerForm';
import PlayerPickerModal from './components/PlayerPickerModal';
import NewGameConflictModal from './components/NewGameConflictModal';
import PasswordGate, { PASSWORD_STORAGE_KEY } from './components/PasswordGate';
import PlayerList from './components/PlayerList';
import EditPlayerModal from './components/EditPlayerModal';
import TopHeader from './components/TopHeader';
import BottomNav from './components/BottomNav';
import DuesPage from './components/DuesPage';
import GameModuleCondensed from './components/GameModuleCondensed';
import GameModuleExpanded from './components/GameModuleExpanded';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';
import WhatsappSyncModal from './components/WhatsappSyncModal';
import WhatsappStatusBanner from './components/WhatsappStatusBanner';
import FieldPickerModal from './components/FieldPickerModal';
import Stats from './components/Stats';
import PlayerProfile from './components/PlayerProfile';
import PlayerLinkSetup from './components/PlayerLinkSetup';
import HomeTab from './components/HomeTab';
import AchievementUnlockedModal from './components/AchievementUnlockedModal';
import IntroSplash from './components/IntroSplash';

function App() {
  const { user, loading: authLoading, login, logout, refreshUser, isAdmin } = useAuth();
  // Intro splash plays once per site open, after access is granted. Reduced-motion
  // users skip it.
  const [introDone, setIntroDone] = useState<boolean>(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [passwordGranted, setPasswordGranted] = useState<boolean>(() => {
    try { return localStorage.getItem(PASSWORD_STORAGE_KEY) === 'granted'; } catch { return false; }
  });
  const [players, setPlayers] = useState<Player[]>([]);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  // When creating a new game collides with an existing game's time slot, the
  // existing game lands here and the conflict modal opens.
  const [conflictGame, setConflictGame] = useState<Game | null>(null);
  const [pendingKickoff, setPendingKickoff] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [activeTab, setActiveTab] = useState<string>('home');
  const [games, setGames] = useState<Game[]>([]);
  // Initial `true` because `loadGames` is fired in a mount effect — without
  // this, the boot-time invite-link effect would race against that load,
  // see games=[] and clear the pending ?game=<id>.
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  // Initial tab for the expanded game view. Invite links flip this to 'rsvp'
  // so recipients land on the RSVP poll, not the score breakdown.
  const [expandedGameInitialTab, setExpandedGameInitialTab] = useState<'game' | 'rsvp'>('game');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerProfileReturnTab, setPlayerProfileReturnTab] = useState<string>('players');
  const [homeMonth, setHomeMonth] = useState<{ month: number; year: number } | null>(null);
  const [gameToDelete, setGameToDelete] = useState<string | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<Player | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  // After creating a game, prompt for its field. Bumping gameModuleRefresh
  // remounts the open game module so the newly-set field shows immediately.
  const [fieldPromptGameId, setFieldPromptGameId] = useState<string | null>(null);
  const [gameModuleRefresh, setGameModuleRefresh] = useState(0);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [availableGames, setAvailableGames] = useState<string[]>([]);
  const [selectedGameForImport, setSelectedGameForImport] = useState<string>('');
  const [csvFilesLoaded, setCsvFilesLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [newAchievements, setNewAchievements] = useState<Achievement[]>([]);
  const [openProfileToAchievements, setOpenProfileToAchievements] = useState(false);
  const playersFileInputRef = useRef<HTMLInputElement>(null);
  const gameSummaryFileInputRef = useRef<HTMLInputElement>(null);

  // Capture the WhatsApp-invite ?game=<id> param at boot, then resolve it once
  // the games list is loaded. Cleared after navigation so refresh doesn't loop.
  const [pendingInviteGameId, setPendingInviteGameId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('game');
  });

  // Resolves "which player am I" for the Profile tab. Auth-linked player wins
  // over localStorage; falls back to a "pick your player" prompt if neither.
  const { player: identityPlayer, isFromAuth, clearIdentity, setIdentity } = usePlayerIdentity(players);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPlayers();
      setPlayers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load players');
    } finally {
      setLoading(false);
    }
  };

  const loadGames = async () => {
    try {
      setGamesLoading(true);
      setGamesError(null);
      const data = await fetchGames();
      const sortedGames = [...data].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setGames(sortedGames);
    } catch (err) {
      setGamesError(err instanceof Error ? err.message : 'Failed to load games');
    } finally {
      setGamesLoading(false);
    }
  };

  useEffect(() => {
    loadPlayers();
    loadGames();
    document.documentElement.classList.add('dark');
  }, []);

  // Resolve the ?game=<id> invite link once games are loaded. Land directly on
  // the RSVP tab so the recipient sees the poll, not the score.
  useEffect(() => {
    if (!pendingInviteGameId) return;
    if (gamesLoading) return;
    const exists = games.some(g => g.id === pendingInviteGameId);
    if (exists) {
      setActiveTab('games');
      setExpandedGameInitialTab('rsvp');
      setExpandedGameId(pendingInviteGameId);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('game');
    window.history.replaceState({}, document.title, url.pathname + url.search);
    setPendingInviteGameId(null);
  }, [pendingInviteGameId, gamesLoading, games]);

  // Check for new achievements once per load, when the user is known to have
  // a linked player. The server atomically marks them as seen, so it's safe
  // to call once — refreshing won't re-trigger the popup.
  useEffect(() => {
    if (!user?.playerId) return;
    let cancelled = false;
    fetchNewAchievements()
      .then(list => {
        if (!cancelled && list.length > 0) setNewAchievements(list);
      })
      .catch(err => {
        console.error('Failed to fetch new achievements:', err);
      });
    return () => { cancelled = true; };
  }, [user?.playerId]);

  // Clear sub-views when switching tabs
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setExpandedGameId(null);
    setSelectedPlayerId(null);
    // The "View Achievements" deep-link is one-shot — consumed on arrival,
    // so switching tabs again returns to the normal profile view.
    setOpenProfileToAchievements(false);
  };

  const handleFormSuccess = () => {
    loadPlayers();
    setShowAddPlayerModal(false);
  };

  const handlePlayerUpdate = () => {
    loadPlayers();
  };

  const handleEditPlayer = (player: Player) => {
    setEditingPlayer(player);
  };

  const handleCloseEdit = () => {
    setEditingPlayer(null);
  };

  const handleDeletePlayer = (player: Player) => {
    setPlayerToDelete(player);
  };

  const handleConfirmDeletePlayer = async () => {
    if (!playerToDelete) return;
    try {
      await deletePlayer(playerToDelete.id);
      setPlayers(players.filter(p => p.id !== playerToDelete.id));
      setPlayerToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete player');
      setPlayerToDelete(null);
    }
  };

  const handleCancelDeletePlayer = () => {
    setPlayerToDelete(null);
  };

  // Try to create a game at `when`. If another game already occupies that
  // time slot, open the conflict modal instead of creating.
  const tryCreateGameAt = async (when: Date) => {
    const conflict = games.find(g => sameSlot(g.createdAt, when));
    if (conflict) {
      setConflictGame(conflict);
      setPendingKickoff(when);
      return;
    }
    try {
      const newGame = await createGame(when.toISOString());
      setGames([newGame, ...games]);
      setExpandedGameInitialTab('game');
      setExpandedGameId(newGame.id);
      setFieldPromptGameId(newGame.id);
      setConflictGame(null);
      setPendingKickoff(null);
    } catch (err) {
      setGamesError(err instanceof Error ? err.message : 'Failed to create game');
    }
  };

  const handleAddNewGame = () => tryCreateGameAt(nextSaturdayKickoff());

  const handleConflictDeleteAndCreate = async () => {
    if (!conflictGame || !pendingKickoff) return;
    try {
      await deleteGame(conflictGame.id);
      const remaining = games.filter(g => g.id !== conflictGame.id);
      setGames(remaining);
      const newGame = await createGame(pendingKickoff.toISOString());
      setGames([newGame, ...remaining]);
      setExpandedGameInitialTab('game');
      setExpandedGameId(newGame.id);
      setFieldPromptGameId(newGame.id);
      setConflictGame(null);
      setPendingKickoff(null);
    } catch (err) {
      setGamesError(err instanceof Error ? err.message : 'Failed to replace game');
    }
  };

  const handleEditGame = (gameId: string) => {
    setExpandedGameInitialTab('game');
    setExpandedGameId(gameId);
  };

  const handleCloseExpandedGame = () => {
    setExpandedGameId(null);
  };

  const handleDeleteGame = (gameId: string) => {
    setGameToDelete(gameId);
  };

  const handleConfirmDelete = async () => {
    if (!gameToDelete) return;
    try {
      await deleteGame(gameToDelete);
      setGames(games.filter(game => game.id !== gameToDelete));
      setGameToDelete(null);
      if (expandedGameId === gameToDelete) {
        setExpandedGameId(null);
      }
    } catch (err) {
      setGamesError(err instanceof Error ? err.message : 'Failed to delete game');
      setGameToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setGameToDelete(null);
  };

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayerId(player.id);
    setPlayerProfileReturnTab('players');
  };

  // CSV import handlers (unchanged)
  const handleFileInputChange = useCallback(async () => {
    const playersFile = playersFileInputRef.current?.files?.[0];
    const gameSummaryFile = gameSummaryFileInputRef.current?.files?.[0];
    if (playersFile && gameSummaryFile) {
      try {
        const playersText = await playersFile.text();
        const gameSummaryText = await gameSummaryFile.text();
        const games = parseAvailableGames(playersText, gameSummaryText);
        if (games.length === 0) {
          setImportError('No games found in the CSV files');
          return;
        }
        setAvailableGames(games);
        setSelectedGameForImport(games[0]);
        setCsvFilesLoaded(true);
        setImportError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to parse CSV files';
        setImportError(errorMessage);
      }
    }
  }, []);

  const handleImportCsvNew = useCallback(async () => {
    if (!selectedGameForImport) {
      setImportError('Please select a game to import');
      return;
    }
    const playersFile = playersFileInputRef.current?.files?.[0];
    const gameSummaryFile = gameSummaryFileInputRef.current?.files?.[0];
    if (!playersFile || !gameSummaryFile) {
      setImportError('Please select both CSV files');
      return;
    }
    try {
      setImporting(true);
      setImportError(null);
      const playersText = await playersFile.text();
      const gameSummaryText = await gameSummaryFile.text();
      const result = await importGameFromCsvNew(playersText, gameSummaryText, selectedGameForImport);
      await loadGames();
      alert(`Game imported successfully! ${result.playersCount} players, ${result.goalsCount} goals.`);
      setShowImportModal(false);
      setCsvFilesLoaded(false);
      setAvailableGames([]);
      setSelectedGameForImport('');
      if (playersFileInputRef.current) playersFileInputRef.current.value = '';
      if (gameSummaryFileInputRef.current) gameSummaryFileInputRef.current.value = '';
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import game data';
      setImportError(errorMessage);
      alert(`Error importing: ${errorMessage}`);
    } finally {
      setImporting(false);
    }
  }, [selectedGameForImport]);

  const handleCloseImportModal = useCallback(() => {
    setShowImportModal(false);
    setImportError(null);
    setCsvFilesLoaded(false);
    setAvailableGames([]);
    setSelectedGameForImport('');
    if (playersFileInputRef.current) playersFileInputRef.current.value = '';
    if (gameSummaryFileInputRef.current) gameSummaryFileInputRef.current.value = '';
  }, []);

  // ── Tab Content ──

  const renderGamesTab = () => {
    if (expandedGameId) {
      const expandedGame = games.find(g => g.id === expandedGameId);
      if (!expandedGame) return null;

      // Non-admins get the same layout, just with editing affordances and
      // admin-only sections (choose teams, half-time/game-over, report stats,
      // edit pencil) hidden by the isAdmin gates inside the component.
      return (
        <GameModuleExpanded
          key={`${expandedGameId}-${expandedGameInitialTab}-${gameModuleRefresh}`}
          gameId={expandedGameId}
          gameNumber={expandedGame.gameNumber}
          gameDate={expandedGame.createdAt}
          onClose={handleCloseExpandedGame}
          onPlayerAdded={loadPlayers}
          isAdmin={isAdmin}
          initialTab={expandedGameInitialTab}
        />
      );
    }

    return (
      <div className="h-full flex flex-col max-w-lg mx-auto px-4 py-4">
        <div className="mb-4">
          <p className="text-text-tertiary text-xs font-semibold tracking-widest uppercase">Match History</p>
          <h2 className="text-2xl font-bold text-text-primary">Games Feed</h2>
        </div>

        {gamesError && (
          <div className="mb-4 p-4 bg-error-bg border border-error-border rounded-xl text-error">
            <p className="font-medium">Error</p>
            <p className="text-sm">{gamesError}</p>
            <button onClick={loadGames} className="mt-2 text-sm underline hover:no-underline text-error">Try again</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto pb-4">
          {gamesLoading ? (
            <div className="text-center py-12">
              <p className="text-text-tertiary">Loading games...</p>
            </div>
          ) : games.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-tertiary text-lg">No games yet.</p>
            </div>
          ) : (
            [...games]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((game) => (
                <GameModuleCondensed
                  key={game.id}
                  gameId={game.id}
                  date={game.createdAt}
                  gameNumber={game.gameNumber}
                  field={game.field}
                  goals={game.goals}
                  teamAssignments={game.teamAssignments}
                  onClick={() => handleEditGame(game.id)}
                  onDelete={() => handleDeleteGame(game.id)}
                  onDateUpdated={loadGames}
                  showDelete={isAdmin}
                  showEditDate={isAdmin}
                />
              ))
          )}
        </div>
      </div>
    );
  };

  const renderPlayersTab = () => {
    if (selectedPlayerId) {
      return (
        <PlayerProfile
          playerId={selectedPlayerId}
          onBack={() => { setSelectedPlayerId(null); setActiveTab(playerProfileReturnTab); }}
          onPlayerClick={(pid) => { setSelectedPlayerId(pid); setPlayerProfileReturnTab('players'); }}
          onNavigateToMonth={handleNavigateToMonth}
        />
      );
    }

    return (
      <div className="h-full flex flex-col max-w-lg mx-auto px-4 py-4">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-text-primary">Players</h2>
        </div>

        {loading && (
          <div className="text-center py-12">
            <p className="text-text-tertiary">Loading players...</p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-error-bg border border-error-border rounded-xl text-error">
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
            <button onClick={loadPlayers} className="mt-2 text-sm underline hover:no-underline">Try again</button>
          </div>
        )}

        {!loading && !error && (
          <PlayerList
            players={players}
            games={games}
            onEdit={handleEditPlayer}
            onDelete={handleDeletePlayer}
            onPlayerClick={handlePlayerClick}
            showActions={isAdmin}
          />
        )}
      </div>
    );
  };

  const handleStatsPlayerClick = (playerId: string) => {
    setSelectedPlayerId(playerId);
    setPlayerProfileReturnTab('stats');
    setActiveTab('players');
  };

  const renderStatsTab = () => (
    <Stats players={players} games={games} onPlayerClick={handleStatsPlayerClick} currentPlayerId={user?.playerId} />
  );

  const renderDuesTab = () => <DuesPage players={players} />;

  const renderProfileTab = () => {
    // Google-authed user without a linked player → existing link-setup flow.
    if (user && !user.playerId) {
      return (
        <div className="h-full overflow-y-auto">
          <PlayerLinkSetup
            userEmail={user.email}
            userName={user.name}
            players={players}
            onLinked={() => { refreshUser(); loadPlayers(); }}
          />
          <div className="max-w-lg mx-auto px-4 pb-8">
            <button
              onClick={logout}
              className="w-full px-4 py-3 border-2 border-gold text-gold rounded-xl font-medium hover:bg-gold/10 transition-colors mt-4"
            >
              Logout
            </button>
          </div>
        </div>
      );
    }

    // Have an identity (either Google-authed + linked, or anonymous + localStorage).
    if (identityPlayer) {
      return (
        <div className="h-full overflow-y-auto">
          <PlayerProfile
            key={openProfileToAchievements ? 'profile-achievements' : 'profile-main'}
            playerId={identityPlayer.id}
            isOwnProfile
            initialShowAchievements={openProfileToAchievements}
            onPlayerClick={(pid) => { setSelectedPlayerId(pid); setPlayerProfileReturnTab('profile'); setActiveTab('players'); }}
            onNavigateToMonth={handleNavigateToMonth}
          />
          <div className="max-w-lg mx-auto px-4 pb-8 mt-6 space-y-3">
            {isFromAuth ? (
              <>
                <button
                  onClick={async () => {
                    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
                    await fetch(`${API_BASE_URL}/auth/unlink-player`, {
                      method: 'POST',
                      credentials: 'include',
                    });
                    refreshUser();
                  }}
                  className="w-full px-4 py-3 border-2 border-white/30 text-white/70 rounded-xl font-medium hover:bg-white/10 transition-colors"
                >
                  Link to Different Player
                </button>
                <button
                  onClick={logout}
                  className="w-full px-4 py-3 border-2 border-gold text-gold rounded-xl font-medium hover:bg-gold/10 transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={login}
                  className="w-full px-4 py-3 bg-gold text-text-on-accent rounded-xl font-semibold hover:bg-gold-hover transition-colors"
                >
                  Sign in with Google
                </button>
                <p className="text-xs text-text-tertiary text-center">
                  Sign in to sync your player across devices and unlock admin tools (admins only).
                </p>
                <button
                  onClick={() => { clearIdentity(); setShowProfilePicker(true); }}
                  className="w-full px-4 py-3 border-2 border-white/30 text-white/70 rounded-xl font-medium hover:bg-white/10 transition-colors"
                >
                  Switch player
                </button>
              </>
            )}
          </div>
        </div>
      );
    }

    // Anonymous, no identity yet → invite them to pick.
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          <div className="bg-surface rounded-2xl border border-border p-6 text-center">
            <h2 className="text-xl font-bold text-text-primary mb-2">Welcome</h2>
            <p className="text-sm text-text-tertiary mb-5">
              Pick your player to RSVP for games and see your stats.
            </p>
            <button
              onClick={() => setShowProfilePicker(true)}
              className="w-full px-4 py-3 bg-accent text-text-on-accent rounded-xl font-semibold hover:bg-accent-hover transition-colors"
            >
              Pick your player
            </button>
          </div>
          <div className="bg-surface rounded-2xl border border-border p-6 text-center">
            <p className="text-sm text-text-secondary mb-3">
              Have a Google account?
            </p>
            <button
              onClick={login}
              className="w-full px-4 py-3 border-2 border-gold text-gold rounded-xl font-semibold hover:bg-gold/10 transition-colors"
            >
              Sign in with Google
            </button>
            <p className="text-xs text-text-tertiary mt-3">
              Sign in if you want to sync your player across devices, or if you're an admin.
            </p>
          </div>
        </div>
      </div>
    );
  };

  const handleHomePlayerClick = (playerId: string) => {
    setSelectedPlayerId(playerId);
    setPlayerProfileReturnTab('home');
    setActiveTab('players');
  };

  const handleNavigateToMonth = (month: number, year: number) => {
    setHomeMonth({ month, year });
    setSelectedPlayerId(null);
    setActiveTab('home');
  };

  const renderHomeTab = () => (
    <HomeTab onPlayerClick={handleHomePlayerClick} initialMonth={homeMonth ?? undefined} onMonthViewed={() => setHomeMonth(null)} />
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'home': return renderHomeTab();
      case 'games': return renderGamesTab();
      case 'players': return renderPlayersTab();
      case 'stats': return renderStatsTab();
      // Admin-only, and gated here as well as in the nav so the tab can't be
      // reached by a stale activeTab after signing out.
      case 'dues': return isAdmin ? renderDuesTab() : renderHomeTab();
      case 'profile': return renderProfileTab();
      default: return renderHomeTab();
    }
  };

  // Wait for auth to resolve before deciding whether to gate. Otherwise an
  // already-signed-in admin would briefly flash the password screen on each
  // page load while the session check is in flight.
  if (authLoading) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
      </div>
    );
  }

  // Casual gate. Bypassed by Google-authed users and by anyone who's typed
  // the password on this device before.
  if (!user && !passwordGranted) {
    return <PasswordGate onUnlock={() => setPasswordGranted(true)} />;
  }

  return (
    <>
      {/* Intro plays once per open, over the app, then fades to reveal it. */}
      {!introDone && <IntroSplash onDone={() => setIntroDone(true)} />}
      <div className="h-[100dvh] bg-base flex flex-col">
        <TopHeader
          userPicture={user?.picture || identityPlayer?.pictureUrl}
          userName={user?.name || user?.email || identityPlayer?.name}
          onMenuClick={() => setShowMenu(!showMenu)}
          onAvatarClick={() => handleTabChange('profile')}
        />

        {/* Admin alert when the WhatsApp listener drops */}
        {isAdmin && <WhatsappStatusBanner onOpenSync={() => setShowWhatsappModal(true)} />}

        {/* Menu Dropdown */}
        {showMenu && (
          <div className="absolute top-14 left-4 z-50 bg-surface border border-border rounded-xl shadow-modal p-2 min-w-[180px]">
            {isAdmin && (
              <>
                <button
                  onClick={() => { setShowImportModal(true); setShowMenu(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                >
                  Import from CSV
                </button>
                <button
                  onClick={() => { setShowWhatsappModal(true); setShowMenu(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                >
                  WhatsApp Sync
                </button>
              </>
            )}
            {user ? (
              <button
                onClick={() => { logout(); setShowMenu(false); }}
                className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
              >
                Logout
              </button>
            ) : (
              <button
                onClick={() => { login(); setShowMenu(false); }}
                className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
              >
                Sign in with Google
              </button>
            )}
          </div>
        )}

        {/* Close menu on backdrop click */}
        {showMenu && (
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
        )}

        {/* Main Content. Bottom padding must clear the fixed BottomNav, whose
            true height is h-16 (4rem) PLUS its safe-area-inset-bottom padding on
            devices with a home indicator. Reserving a flat pb-16 left the safe
            area uncovered, so pinned content (e.g. the Report Stats footer) was
            clipped under the nav and couldn't be scrolled into view. */}
        <main className="flex-1 overflow-hidden" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="h-full overflow-y-auto">
            {renderActiveTab()}
          </div>
        </main>

        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} isAdmin={isAdmin} />

        {/* FAB for Games tab (admin) */}
        {activeTab === 'games' && isAdmin && !expandedGameId && (
          <button
            onClick={handleAddNewGame}
            className="fixed bottom-20 right-4 z-30 w-14 h-14 bg-gold rounded-full shadow-glow-gold flex items-center justify-center hover:bg-gold-hover active:bg-gold-active transition-colors"
            aria-label="Add new game"
          >
            <svg className="w-7 h-7 text-text-on-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}

        {/* FAB for Players tab (admin) */}
        {activeTab === 'players' && isAdmin && !selectedPlayerId && (
          <button
            onClick={() => setShowAddPlayerModal(true)}
            className="fixed bottom-20 right-4 z-30 w-14 h-14 bg-gold rounded-full shadow-glow-gold flex items-center justify-center hover:bg-gold-hover active:bg-gold-active transition-colors"
            aria-label="Add new player"
          >
            <svg className="w-7 h-7 text-text-on-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}

        {/* Add Player Modal */}
        {showAddPlayerModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-surface rounded-xl shadow-modal max-w-md w-full border border-border max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="text-lg font-semibold text-text-primary">Add Player</h3>
                <button
                  onClick={() => setShowAddPlayerModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover transition-colors"
                >
                  <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4">
                <PlayerForm onSubmitSuccess={handleFormSuccess} />
              </div>
            </div>
          </div>
        )}

        {editingPlayer && (
          <EditPlayerModal
            player={editingPlayer}
            onClose={handleCloseEdit}
            onSuccess={handlePlayerUpdate}
            isAdmin={isAdmin}
          />
        )}

        {gameToDelete && (
          <DeleteConfirmationModal
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
            itemType="game"
          />
        )}

        {playerToDelete && (
          <DeleteConfirmationModal
            onConfirm={handleConfirmDeletePlayer}
            onCancel={handleCancelDeletePlayer}
            itemType="player"
          />
        )}

        {/* Conflict modal when creating a new game at an already-booked slot */}
        {conflictGame && pendingKickoff && (
          <NewGameConflictModal
            conflictingGame={conflictGame}
            defaultKickoff={pendingKickoff}
            onCancel={() => { setConflictGame(null); setPendingKickoff(null); }}
            onCreateAt={(when) => tryCreateGameAt(when)}
            onDeleteAndCreate={handleConflictDeleteAndCreate}
          />
        )}

        {/* Profile-tab player picker (anonymous identity selection) */}
        {showProfilePicker && (
          <PlayerPickerModal
            players={players}
            onPick={(pid) => { setIdentity(pid); setShowProfilePicker(false); }}
            onClose={() => setShowProfilePicker(false)}
            onPlayerCreated={loadPlayers}
            title="Pick your player"
            subtitle="We'll remember this on this device. Sign in with Google to sync across devices."
          />
        )}

        {/* Newly-unlocked achievements popup (shown once per achievement) */}
        {newAchievements.length > 0 && (
          <AchievementUnlockedModal
            achievements={newAchievements}
            onViewProfile={() => {
              setOpenProfileToAchievements(false);
              setActiveTab('profile');
              setNewAchievements([]);
            }}
            onViewAchievements={() => {
              setOpenProfileToAchievements(true);
              setActiveTab('profile');
              setNewAchievements([]);
            }}
            onDismiss={() => setNewAchievements([])}
          />
        )}

        {/* Field prompt right after creating a game */}
        {fieldPromptGameId && (
          <FieldPickerModal
            onSkip={() => setFieldPromptGameId(null)}
            onSelect={async (field: GameField | null) => {
              const id = fieldPromptGameId;
              setFieldPromptGameId(null);
              try {
                const updated = await updateGame(id, { field });
                setGames((prev) => prev.map((g) => (g.id === id ? updated : g)));
                setGameModuleRefresh((n) => n + 1); // remount so the open game shows the field
              } catch (err) {
                setGamesError(err instanceof Error ? err.message : 'Failed to set field');
              }
            }}
          />
        )}

        {/* WhatsApp Sync Modal (admin) */}
        {showWhatsappModal && isAdmin && (
          <WhatsappSyncModal
            games={games}
            players={players}
            onClose={() => setShowWhatsappModal(false)}
          />
        )}

        {/* Import CSV Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
            <div className="bg-surface rounded-xl p-6 max-w-md w-full mx-4 border border-border shadow-modal">
              <h3 className="text-xl font-semibold text-text-primary mb-4">Import New Game from CSV</h3>
              <p className="text-sm text-text-tertiary mb-4">
                Please select two CSV files: one for Players and one for GameSummary. Then choose which game to import as a new game.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">Players CSV</label>
                  <input
                    ref={playersFileInputRef}
                    type="file"
                    accept=".csv"
                    className="block w-full text-sm text-text-tertiary file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-text-on-accent hover:file:bg-accent-hover"
                    onChange={handleFileInputChange}
                    disabled={csvFilesLoaded}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">GameSummary CSV</label>
                  <input
                    ref={gameSummaryFileInputRef}
                    type="file"
                    accept=".csv"
                    className="block w-full text-sm text-text-tertiary file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-text-on-accent hover:file:bg-accent-hover"
                    onChange={handleFileInputChange}
                    disabled={csvFilesLoaded}
                  />
                </div>
                {csvFilesLoaded && availableGames.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Select Game to Import</label>
                    <select
                      value={selectedGameForImport}
                      onChange={(e) => setSelectedGameForImport(e.target.value)}
                      className="w-full px-4 py-2 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary"
                    >
                      {availableGames.map((gameName) => (
                        <option key={gameName} value={gameName}>{gameName}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {importError && (
                <div className="mt-4 p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{importError}</div>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={handleCloseImportModal}
                  disabled={importing}
                  className="px-4 py-2 bg-surface-raised text-text-primary text-sm font-medium rounded-xl hover:bg-surface-active disabled:bg-surface-active disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                {csvFilesLoaded && availableGames.length > 0 && (
                  <button
                    onClick={handleImportCsvNew}
                    disabled={importing || !selectedGameForImport}
                    className="px-4 py-2 bg-accent text-text-on-accent text-sm font-medium rounded-xl hover:bg-accent-hover disabled:bg-surface-active disabled:cursor-not-allowed transition-colors"
                  >
                    {importing ? 'Importing...' : 'Import'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
