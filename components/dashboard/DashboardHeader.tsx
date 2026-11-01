import Link from 'next/link';
import type { DashboardData } from '@/app/dashboard-data';
import AppPageTitle from '@/components/layout/AppPageTitle';
import { formatDuration, statusTone } from './run-format';

export default function DashboardHeader({ data }: { data: DashboardData }) {
  return (
    <header className="dashboard-header app-page-header">
      <AppPageTitle index="01" title="Dashboard" className="dashboard-title-block" />

      {data.run ? (
        <div className="dashboard-run-line" aria-label="Aktueller Run">
          <strong>{data.run.gameName}</strong>
          <span aria-hidden="true">•</span>
          <strong>Run #{data.run.number}</strong>
          <span className="app-status" data-tone={statusTone(data.run.status)}>
            {data.run.statusLabel}
          </span>
          <span aria-hidden="true">•</span>
          <span>{formatDuration(data.run.durationMs)}</span>
        </div>
      ) : (
        <p className="dashboard-run-line">Kein Run vorhanden</p>
      )}

      <div className="dashboard-header-actions">
        <Link href="/pokeroute" className="dashboard-route-link">
          Routen
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14m-5-5 5 5-5 5" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
