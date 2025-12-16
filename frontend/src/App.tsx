import { useState, useEffect } from 'react';
import { Player, fetchPlayers, deletePlayer } from './api/players';
import { Game, fetchGames, createGame, deleteGame } from './api/games';
import PlayerForm from './components/PlayerForm';
import PlayerList from './components/PlayerList';
import EditPlayerModal from './components/EditPlayerModal';
import Tabs from './components/Tabs';
import GameModuleCondensed from './components/GameModuleCondensed';
import GameModuleExpanded from './components/GameModuleExpanded';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';
import Stats from './components/Stats';

function App() {
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
      
      // Sort games by creation date (oldest first) to determine game numbers
      const sortedGames = [...games].sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const gameNumber = sortedGames.findIndex(g => g.id === expandedGameId) + 1;
      
      return (
        <GameModuleExpanded
          gameId={expandedGameId}
          gameNumber={gameNumber}
          gameDate={expandedGame.createdAt}
          onClose={handleCloseExpandedGame}
          onPlayerAdded={loadPlayers}
        />
      );
    })()
  ) : (
    <div className="h-full flex flex-col max-w-4xl mx-auto px-4 py-6">
      <button
        onClick={handleAddNewGame}
        className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-500 active:bg-blue-700 transition-colors text-base mb-6 flex-shrink-0"
      >
        Add New Game
      </button>
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
            
            // Sort games by creation date (oldest first) to determine game numbers
            const sortedGamesForNumbering = [...games].sort((a, b) => 
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            // Create a map of game ID to game number
            const gameNumberMap = new Map<string, number>();
            sortedGamesForNumbering.forEach((game, index) => {
              gameNumberMap.set(game.id, index + 1);
            });

              return displayGames.map((game) => (
                <GameModuleCondensed
                  key={game.id}
                  gameId={game.id}
                  date={game.createdAt}
                  gameNumber={gameNumberMap.get(game.id) || 1}
                  onClick={() => handleEditGame(game.id)}
                  onDelete={() => handleDeleteGame(game.id)}
                  onDateUpdated={loadGames}
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
    <div className="h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 sticky top-0 z-20 shadow-sm">
        <h1 className="text-2xl font-bold text-white">Awty Football</h1>
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
    </div>
  );
}

export default App;

