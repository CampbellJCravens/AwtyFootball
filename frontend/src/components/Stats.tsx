import { useState } from 'react';
import { Player } from '../api/players';
import { Game } from '../api/games';
import OverallStatsTable from './OverallStatsTable';
import PartnersStatsTable from './PartnersStatsTable';
import Tabs from './Tabs';

interface StatsProps {
  players: Player[];
  games: Game[];
}

export default function Stats({ players, games }: StatsProps) {
  const [activeSubTab, setActiveSubTab] = useState('overall');

  // Overall Tab Content
  const overallTabContent = (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <OverallStatsTable players={players} games={games} />
    </div>
  );

  // Partnerships Tab Content
  const partnershipsTabContent = (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <PartnersStatsTable players={players} games={games} />
    </div>
  );

  const subTabs = [
    {
      id: 'overall',
      label: 'Overall',
      content: overallTabContent,
    },
    {
      id: 'partnerships',
      label: 'Partnerships',
      content: partnershipsTabContent,
    },
  ];

  return (
    <div className="h-full flex flex-col">
      <Tabs
        tabs={subTabs}
        activeTab={activeSubTab}
        onTabChange={setActiveSubTab}
      />
    </div>
  );
}

