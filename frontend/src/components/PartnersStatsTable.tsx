import { useMemo } from 'react';
import { Player } from '../api/players';
import { Game } from '../api/games';

interface PartnerPair {
  player1: Player;
  player2: Player;
  contributions: number;
}

interface PartnersStatsTableProps {
  players: Player[];
  games: Game[];
}

// Function to normalize pair (always put alphabetically first player first)
const normalizePair = (player1Id: string, player2Id: string): string => {
  return player1Id < player2Id ? `${player1Id}-${player2Id}` : `${player2Id}-${player1Id}`;
};

export default function PartnersStatsTable({ players, games }: PartnersStatsTableProps) {
  // Calculate partner stats
  const partnerStats = useMemo(() => {
    const pairMap = new Map<string, { player1Id: string; player2Id: string; count: number }>();
    const allPlayersMap = new Map<string, Player>();
    
    // Build a map of all players (guests are now regular players in the database)
    players.forEach(p => allPlayersMap.set(p.id, p));

    // Process all games and goals
    games.forEach(game => {
      if (!game.goals) return;
      
      game.goals.forEach(goal => {
        if (goal.assisterId && goal.scorerId) {
          const pairKey = normalizePair(goal.scorerId, goal.assisterId);
          
          if (pairMap.has(pairKey)) {
            pairMap.get(pairKey)!.count++;
          } else {
            // Determine which player comes first alphabetically
            const player1Id = goal.scorerId < goal.assisterId ? goal.scorerId : goal.assisterId;
            const player2Id = goal.scorerId < goal.assisterId ? goal.assisterId : goal.scorerId;
            
            pairMap.set(pairKey, {
              player1Id,
              player2Id,
              count: 1,
            });
          }
        }
      });
    });

    // Convert to array of PartnerPair objects
    const pairs: PartnerPair[] = Array.from(pairMap.values())
      .map(pair => ({
        player1: allPlayersMap.get(pair.player1Id)!,
        player2: allPlayersMap.get(pair.player2Id)!,
        contributions: pair.count,
      }))
      .filter(pair => pair.player1 && pair.player2) // Filter out any missing players
      .sort((a, b) => b.contributions - a.contributions); // Sort by contributions descending

    return pairs;
  }, [players, games]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-600">
            <th className="text-left py-3 px-4 font-semibold text-gray-300">Rank</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-300">Partners</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-300">Goal Contributions</th>
          </tr>
        </thead>
        <tbody>
          {partnerStats.length === 0 ? (
            <tr>
              <td colSpan={3} className="text-center py-8 text-gray-400">
                No goal partnerships yet. Players need to assist each other's goals!
              </td>
            </tr>
          ) : (
            partnerStats.map((pair, index) => (
              <tr key={`${pair.player1.id}-${pair.player2.id}`} className="border-b border-gray-700 hover:bg-gray-800">
                <td className="py-3 px-4 text-gray-300 font-medium">{index + 1}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {pair.player1.pictureUrl ? (
                      <img
                        src={pair.player1.pictureUrl}
                        alt={pair.player1.name}
                        className="w-8 h-8 rounded-full object-cover border-2 border-gray-600 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                        {pair.player1.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium text-gray-100">{pair.player1.name}</span>
                    <span className="text-gray-400">and</span>
                    {pair.player2.pictureUrl ? (
                      <img
                        src={pair.player2.pictureUrl}
                        alt={pair.player2.name}
                        className="w-8 h-8 rounded-full object-cover border-2 border-gray-600 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                        {pair.player2.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium text-gray-100">{pair.player2.name}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-300">{pair.contributions}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

