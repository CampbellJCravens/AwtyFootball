import { useState, useEffect, useRef, useCallback } from 'react';
import { Player, fetchPlayers, deletePlayer } from './api/players';
import { Game, fetchGames, createGame, deleteGame, importGameFromCsvNew, parseAvailableGames } from './api/games';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import PlayerForm from './components/PlayerForm';
import PlayerList from './components/PlayerList';
import EditPlayerModal from './components/EditPlayerModal';
import TopHeader from './components/TopHeader';
import BottomNav from './components/BottomNav';
import GameModuleCondensed from './components/GameModuleCondensed';
import GameModuleExpanded from './components/GameModuleExpanded';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';
import Stats from './components/Stats';
import PlayerProfile from './components/PlayerProfile';
import GameDetailReadOnly from './components/GameDetailReadOnly';
import PlayerLinkSetup from './components/PlayerLinkSetup';
import HomeTab from './components/HomeTab';

function App() {
  const { user, logout, refreshUser, isAdmin } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [activeTab, setActiveTab] = useState<string>('home');
  const [games, setGames] = useState<Game[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerProfileReturnTab, setPlayerProfileReturnTab] = useState<string>('players');
  const [gameToDelete, setGameToDelete] = useState<string | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<Player | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [availableGames, setAvailableGames] = useState<string[]>([]);
  const [selectedGameForImport, setSelectedGameForImport] = useState<string>('');
  const [csvFilesLoaded, setCsvFilesLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const playersFileInputRef = useRef<HTMLInputElement>(null);
  const gameSummaryFileInputRef = useRef<HTMLInputElement>(null);

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

  // Clear sub-views when switching tabs
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setExpandedGameId(null);
    setSelectedPlayerId(null);
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

  const handleAddNewGame = async () => {
    try {
      const newGame = await createGame();
      setGames([newGame, ...games]);
      setExpandedGameId(newGame.id);
    } catch (err) {
      setGamesError(err instanceof Error ? err.message : 'Failed to create game');
    }
  };

  const handleEditGame = (gameId: string) => {
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

      if (isAdmin) {
        return (
          <GameModuleExpanded
            gameId={expandedGameId}
            gameNumber={expandedGame.gameNumber}
            gameDate={expandedGame.createdAt}
            onClose={handleCloseExpandedGame}
            onPlayerAdded={loadPlayers}
            isAdmin={isAdmin}
          />
        );
      }

      return (
        <GameDetailReadOnly
          gameId={expandedGameId}
          gameNumber={expandedGame.gameNumber}
          gameDate={expandedGame.createdAt}
          onBack={handleCloseExpandedGame}
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
    <Stats players={players} games={games} onPlayerClick={handleStatsPlayerClick} />
  );

  const renderProfileTab = () => {
    // If user has a linked player, show their profile with stats
    if (user?.playerId) {
      return (
        <div className="h-full overflow-y-auto">
          <PlayerProfile
            playerId={user.playerId}
            isOwnProfile
            onPlayerClick={(pid) => { setSelectedPlayerId(pid); setPlayerProfileReturnTab('profile'); setActiveTab('players'); }}
          />
          <div className="max-w-lg mx-auto px-4 pb-8 mt-6 space-y-3">
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
          </div>
        </div>
      );
    }

    // No linked player, show setup
    return (
      <div className="h-full overflow-y-auto">
        <PlayerLinkSetup
          userEmail={user?.email || ''}
          userName={user?.name}
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
  };

  const handleHomePlayerClick = (playerId: string) => {
    setSelectedPlayerId(playerId);
    setPlayerProfileReturnTab('home');
    setActiveTab('players');
  };

  const renderHomeTab = () => (
    <HomeTab onPlayerClick={handleHomePlayerClick} />
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'home': return renderHomeTab();
      case 'games': return renderGamesTab();
      case 'players': return renderPlayersTab();
      case 'stats': return renderStatsTab();
      case 'profile': return renderProfileTab();
      default: return renderHomeTab();
    }
  };

  return (
    <ProtectedRoute>
      <div className="h-screen bg-base flex flex-col">
        <TopHeader
          userPicture={user?.picture}
          userName={user?.name || user?.email}
          onMenuClick={() => setShowMenu(!showMenu)}
          onAvatarClick={() => handleTabChange('profile')}
        />

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
              </>
            )}
            <button
              onClick={() => { logout(); setShowMenu(false); }}
              className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        )}

        {/* Close menu on backdrop click */}
        {showMenu && (
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-hidden pb-16">
          <div className="h-full overflow-y-auto">
            {renderActiveTab()}
          </div>
        </main>

        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />

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
    </ProtectedRoute>
  );
}

export default App;
