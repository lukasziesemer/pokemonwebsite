import type { DashboardData } from '@/app/dashboard-data';
import DashboardLiveRefresh from '@/components/live/DashboardLiveRefresh';
import { PokemonDetailsProvider } from '@/components/pokemon-details';
import DashboardArena from './arena/DashboardArena';
import BadgeProgressBand from './BadgeProgressBand';
import DashboardHeader from './DashboardHeader';
import OverallBalance from './OverallBalance';
import TeamSheets, { TeamCoverageSection } from './TeamSheets';

export default function Dashboard({ data }: { data: DashboardData }) {
  const balance = (
    <OverallBalance
      totals={data.totals}
      playerTotals={data.playerTotals}
      gameName={data.run?.gameName ?? null}
    />
  );

  return (
    <PokemonDetailsProvider
      gameVersionKey={data.run?.gameVersionKey ?? null}
      gameVersionName={data.run?.gameName ?? null}
    >
      <DashboardLiveRefresh />
      <DashboardArena
        data={data}
        fallback={(
          <div className="app-page dashboard-page">
            <DashboardHeader data={data} />
            <BadgeProgressBand data={data} />
            <TeamSheets players={data.players} />
            {balance}
          </div>
        )}
      >
        <div className="app-page dashboard-page">
          <TeamCoverageSection players={data.players} />
          {balance}
        </div>
      </DashboardArena>
    </PokemonDetailsProvider>
  );
}
