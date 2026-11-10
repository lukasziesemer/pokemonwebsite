import type { DashboardData } from '@/app/dashboard-data';
import DashboardLiveRefresh from '@/components/live/DashboardLiveRefresh';
import { PokemonDetailsProvider } from '@/components/pokemon-details';
import DashboardBoard from './DashboardBoard';

export default function Dashboard({ data }: { data: DashboardData }) {
  return (
    <PokemonDetailsProvider
      gameVersionKey={data.run?.gameVersionKey ?? null}
      gameVersionName={data.run?.gameName ?? null}
    >
      <DashboardLiveRefresh />
      <DashboardBoard data={data} />
    </PokemonDetailsProvider>
  );
}
