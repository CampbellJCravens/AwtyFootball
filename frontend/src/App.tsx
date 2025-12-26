import { useState, useEffect, useRef, useCallback } from 'react';
import { Player, fetchPlayers, deletePlayer } from './api/players';
import { Game, fetchGames, createGame, deleteGame, importGameFromCsvNew, parseAvailableGames } from './api/games';
import Papa from 'papaparse';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import PlayerForm from './components/PlayerForm';
import PlayerList from './components/PlayerList';
import EditPlayerModal from './components/EditPlayerModal';
import Tabs from './components/Tabs';
import GameModuleCondensed from './components/GameModuleCondensed';
import GameModuleExpanded from './components/GameModuleExpanded';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';
import Stats from './components/Stats';

function App() {
  const { user, logout, isAdmin } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [activeTab, setActiveTab] = useState('draft');
  const [games, setGames] = useState<Game[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [gameToDelete, setGameToDelete] = useState<string | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<Player | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [availableGames, setAvailableGames] = useState<string[]>([]);
  const [selectedGameForImport, setSelectedGameForImport] = useState<string>('');
  const [csvFilesLoaded, setCsvFilesLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
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
      // Ensure games are sorted by createdAt DESC (newest first)
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
    // Always apply dark mode
    document.documentElement.classList.add('dark');
  }, []);

  const handleFormSuccess = () => {
    loadPlayers();
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
      // Automatically open expanded view for newly created game
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
      // Close expanded view if the deleted game was expanded
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

  // Handle CSV file selection for import
  const handleFileInputChange = useCallback(async () => {
    const playersFile = playersFileInputRef.current?.files?.[0];
    const gameSummaryFile = gameSummaryFileInputRef.current?.files?.[0];

    if (playersFile && gameSummaryFile) {
      try {
        // Read files as text
        const playersText = await playersFile.text();
        const gameSummaryText = await gameSummaryFile.text();

        // Parse and extract available games
        const games = parseAvailableGames(playersText, gameSummaryText);
        
        if (games.length === 0) {
          setImportError('No games found in the CSV files');
          return;
        }

        setAvailableGames(games);
        setSelectedGameForImport(games[0]); // Default to first game
        setCsvFilesLoaded(true);
        setImportError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to parse CSV files';
        setImportError(errorMessage);
      }
    }
  }, []);

  // Handle CSV file import into new game
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

      // Read files as text
      const playersText = await playersFile.text();
      const gameSummaryText = await gameSummaryFile.text();

      // Import data for selected game into a new game
      const result = await importGameFromCsvNew(playersText, gameSummaryText, selectedGameForImport);

      // Reload games list
      await loadGames();

      alert(`Game imported successfully! ${result.playersCount} players, ${result.goalsCount} goals.`);
      
      // Reset import state
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

  // Handle closing import modal
  const handleCloseImportModal = useCallback(() => {
    setShowImportModal(false);
    setImportError(null);
    setCsvFilesLoaded(false);
    setAvailableGames([]);
    setSelectedGameForImport('');
    if (playersFileInputRef.current) playersFileInputRef.current.value = '';
    if (gameSummaryFileInputRef.current) gameSummaryFileInputRef.current.value = '';
  }, []);

  // Draft Tab Content
  const draftTabContent = (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <PlayerForm onSubmitSuccess={handleFormSuccess} />

      {loading && (
        <div className="text-center py-12">
          <p className="text-gray-400">Loading players...</p>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={loadPlayers}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && (
        <PlayerList
          players={players}
          onEdit={handleEditPlayer}
          onDelete={handleDeletePlayer}
        />
      )}
    </div>
  );

  // Game Tab Content
  const gameTabContent = expandedGameId ? (
    (() => {
      const expandedGame = games.find(g => g.id === expandedGameId);
      if (!expandedGame) return null;
      
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
    })()
  ) : (
    <div className="h-full flex flex-col max-w-4xl mx-auto px-4 py-6">
      {isAdmin && (
        <div className="flex items-center gap-2 mb-6 flex-shrink-0">
          <button
            onClick={handleAddNewGame}
            className="flex-1 bg-blue-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-600 active:bg-blue-700 transition-colors text-base"
          >
            Add New Game
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-gray-700 text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-600 active:bg-gray-500 transition-colors"
          >
            Import
          </button>
        </div>
      )}
      {gamesError && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
          <p className="font-medium">Error</p>
          <p className="text-sm">{gamesError}</p>
          <button
            onClick={loadGames}
            className="mt-2 text-sm underline hover:no-underline text-red-400"
          >
            Try again
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {gamesLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Loading games...</p>
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No games yet. Add your first game!</p>
          </div>
        ) : (
          (() => {
            // Ensure games are displayed newest first (already sorted, but ensure it)
            const displayGames = [...games].sort((a, b) => 
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            return displayGames.map((game) => (
              <GameModuleCondensed
                key={game.id}
                gameId={game.id}
                date={game.createdAt}
                gameNumber={game.gameNumber}
                onClick={() => handleEditGame(game.id)}
                onDelete={() => handleDeleteGame(game.id)}
                onDateUpdated={loadGames}
                showDelete={isAdmin}
                showEditDate={isAdmin}
              />
            ));
          })()
        )}
      </div>
    </div>
  );

  // Stats Tab Content
  const statsTabContent = (
    <Stats players={players} games={games} />
  );

  const tabs = [
    {
      id: 'draft',
      label: 'All Players',
      content: draftTabContent,
    },
    {
      id: 'game',
      label: 'Games',
      content: gameTabContent,
    },
    {
      id: 'stats',
      label: 'Stats',
      content: statsTabContent,
    },
  ];

  return (
    <ProtectedRoute>
      <div className="h-screen bg-gray-900 flex flex-col">
        <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 sticky top-0 z-20 shadow-sm">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Awty Football</h1>
            <div className="flex items-center gap-3">
              {user && (
                <div className="flex items-center gap-2">
                  {user.picture && (
                    <img
                      src={user.picture}
                      alt={user.name || user.email}
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <div className="text-right">
                    <p className="text-sm text-white font-medium">{user.name || user.email}</p>
                    <p className="text-xs text-gray-400">{user.role === 'admin' ? 'Admin' : 'User'}</p>
                  </div>
                  <button
                    onClick={logout}
                    className="ml-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

      <div className="flex-1 overflow-hidden">
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700">
            <h3 className="text-xl font-semibold text-gray-100 mb-4">Import New Game from CSV</h3>
            <p className="text-sm text-gray-400 mb-4">
              Please select two CSV files: one for Players and one for GameSummary. Then choose which game to import as a new game.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Players CSV
                </label>
                <input
                  ref={playersFileInputRef}
                  type="file"
                  accept=".csv"
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                  onChange={handleFileInputChange}
                  disabled={csvFilesLoaded}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  GameSummary CSV
                </label>
                <input
                  ref={gameSummaryFileInputRef}
                  type="file"
                  accept=".csv"
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                  onChange={handleFileInputChange}
                  disabled={csvFilesLoaded}
                />
              </div>

              {csvFilesLoaded && availableGames.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select Game to Import
                  </label>
                  <select
                    value={selectedGameForImport}
                    onChange={(e) => setSelectedGameForImport(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-base bg-gray-700 text-gray-100"
                  >
                    {availableGames.map((gameName) => (
                      <option key={gameName} value={gameName}>
                        {gameName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {importError && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                {importError}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={handleCloseImportModal}
                disabled={importing}
                className="px-4 py-2 bg-gray-700 text-gray-100 text-sm font-medium rounded-lg hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              {csvFilesLoaded && availableGames.length > 0 && (
                <button
                  onClick={handleImportCsvNew}
                  disabled={importing || !selectedGameForImport}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
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

