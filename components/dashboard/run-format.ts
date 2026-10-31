import type { DashboardData } from '@/app/dashboard-data';

export function formatDuration(durationMs: number) {
  const totalMinutes = Math.floor(durationMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} T ${hours} Std ${minutes} Min`;
  if (hours > 0) return `${hours} Std ${minutes} Min`;
  return `${minutes} Min`;
}

export function statusTone(status: NonNullable<DashboardData['run']>['status']) {
  if (status === 'paused') return 'paused';
  if (status === 'won') return 'complete';
  if (status === 'lost') return 'danger';
  return 'active';
}
