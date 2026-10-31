'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import AppPageTitle from '@/components/layout/AppPageTitle';
import { AnalyticsCards } from '@/components/statistics/AnalyticsCards';
import { GameFilter } from '@/components/statistics/GameFilter';
import { GameSummaryCard } from '@/components/statistics/GameSummaryCard';
import { RunComparison } from '@/components/statistics/RunComparison';
import { RunComparisonTray } from '@/components/statistics/RunComparisonSelection';
import { RunHistory } from '@/components/statistics/RunHistory';
import { RunTrends } from '@/components/statistics/RunTrends';
import type {
  AnalyticsResponse,
  HistoryGroup,
  HistoryResponse,
  OverviewResponse,
  RunComparisonResponse,
  RunSummary,
} from '@/components/statistics/types';
import { gameFilterKey } from '@/components/statistics/types';
import {
  parseRunComparisonParam,
  serializeRunComparisonParam,
} from '@/lib/run-comparison';
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh';

const STATISTICS_LIVE_TOPICS = ['encounters', 'runs', 'players'] as const;

interface PageData {
  overview: OverviewResponse;
  history: HistoryResponse;
  previews: HistoryResponse;
  analytics: AnalyticsResponse;
}

interface ComparisonRequestState {
  requestKey: string;
  data: RunComparisonResponse | null;
  error: string | null;
}

interface SettledRequestState {
  requestKey: string;
  error: string | null;
}

interface LoadMoreFailure {
  requestKey: string;
  message: string;
}

function hrefWithParams(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 Min.';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} T ${hours} Std.`;
  if (hours > 0) return `${hours} Std. ${minutes} Min.`;
  return `${minutes} Min.`;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || 'Statistiken konnten nicht geladen werden.');
  }
  return response.json() as Promise<T>;
}

function LoadingView() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Statistiken werden geladen">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse border border-[var(--border-default)] bg-[var(--card-bg)]" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-64 animate-pulse border border-[var(--border-default)] bg-[var(--card-bg)]" />
        ))}
      </div>
      <p className="sr-only" role="status">Statistiken werden geladen.</p>
    </div>
  );
}

function KpiCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <article className="border-b border-white/20 p-4 last:border-b-0 sm:border-b-0 sm:border-r md:p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/60">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-white md:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-white/65">{detail}</p>
    </article>
  );
}

export default function StatistikClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedGame = searchParams.get('game') || 'all';
  const comparisonParam = searchParams.get('compare') || '';
  const selectedRunIds = useMemo(
    () => parseRunComparisonParam({ get: (name) => name === 'compare' ? comparisonParam : null }),
    [comparisonParam],
  );
  const [data, setData] = useState<PageData | null>(null);
  const [settledRequest, setSettledRequest] = useState<SettledRequestState | null>(null);
  const [loadMoreFailure, setLoadMoreFailure] = useState<LoadMoreFailure | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadingMore, setLoadingMore] = useState<Set<string>>(new Set());
  const [comparisonRetryToken, setComparisonRetryToken] = useState(0);
  const [comparisonRequest, setComparisonRequest] = useState<ComparisonRequestState | null>(null);

  const reloadStatistics = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useLiveRefresh(STATISTICS_LIVE_TOPICS, reloadStatistics);

  // Jede neue Anfrage verwirft Fehler und zeigt wieder den Ladezustand.
  const statisticsRequestKey = `${selectedGame}:${reloadToken}`;
  const loading = settledRequest?.requestKey !== statisticsRequestKey;
  const error = settledRequest?.requestKey === statisticsRequestKey
    ? settledRequest.error
    : null;
  const loadMoreError = loadMoreFailure?.requestKey === statisticsRequestKey
    ? loadMoreFailure.message
    : null;

  const comparisonPairKey = selectedRunIds.length === 2 ? selectedRunIds.join(',') : null;
  const comparisonRequestKey = comparisonPairKey
    ? `${comparisonPairKey}:${comparisonRetryToken}`
    : null;

  const updateComparisonSelection = useCallback((ids: readonly number[]) => {
    const next = serializeRunComparisonParam(ids, new URLSearchParams(searchParams.toString()));
    router.push(hrefWithParams(pathname, next), { scroll: false });
  }, [pathname, router, searchParams]);

  const toggleRunComparison = useCallback((run: RunSummary) => {
    const isSelected = selectedRunIds.includes(run.id);
    updateComparisonSelection(
      isSelected
        ? selectedRunIds.filter((id) => id !== run.id)
        : [...selectedRunIds, run.id],
    );
  }, [selectedRunIds, updateComparisonSelection]);

  const selectGame = useCallback((gameKey: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('game', gameKey);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const canonical = selectedRunIds.join(',');
    if (comparisonParam === canonical) return;

    const next = serializeRunComparisonParam(
      selectedRunIds,
      new URLSearchParams(searchParams.toString()),
    );
    router.replace(hrefWithParams(pathname, next), { scroll: false });
  }, [comparisonParam, pathname, router, searchParams, selectedRunIds]);

  useEffect(() => {
    if (!comparisonPairKey || !comparisonRequestKey) return;

    const controller = new AbortController();
    const [leftId, rightId] = selectedRunIds;
    fetchJson<RunComparisonResponse>(
      `/api/runs/compare?left=${leftId}&right=${rightId}`,
      controller.signal,
    )
      .then((comparison) => {
        setComparisonRequest({ requestKey: comparisonRequestKey, data: comparison, error: null });
      })
      .catch((comparisonError: unknown) => {
        if (comparisonError instanceof DOMException && comparisonError.name === 'AbortError') return;
        setComparisonRequest({
          requestKey: comparisonRequestKey,
          data: null,
          error: comparisonError instanceof Error
            ? comparisonError.message
            : 'Der Run-Vergleich konnte nicht geladen werden.',
        });
      });

    return () => controller.abort();
  }, [comparisonPairKey, comparisonRequestKey, selectedRunIds]);

  useEffect(() => {
    const controller = new AbortController();
    const scope = encodeURIComponent(selectedGame);

    const historyPromise = fetchJson<HistoryResponse>(`/api/runs/history?game=${scope}&limit=10`, controller.signal);
    const previewsPromise = selectedGame === 'all'
      ? historyPromise
      : fetchJson<HistoryResponse>('/api/runs/history?game=all&limit=12', controller.signal);

    Promise.all([
      fetchJson<OverviewResponse>(`/api/runs/overview?game=${scope}`, controller.signal),
      historyPromise,
      previewsPromise,
      fetchJson<AnalyticsResponse>(`/api/runs/analytics?game=${scope}`, controller.signal),
    ])
      .then(([overview, history, previews, analytics]) => {
        setData({
          overview,
          history: { ...history, groups: history.groups || [] },
          previews: { ...previews, groups: previews.groups || [] },
          analytics: {
            ...analytics,
            playerStats: analytics.playerStats || [],
            mostCaught: analytics.mostCaught || [],
            longestTeamMembers: analytics.longestTeamMembers || [],
            runTrends: analytics.runTrends || [],
          },
        });
        setSettledRequest({ requestKey: statisticsRequestKey, error: null });
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        setSettledRequest({
          requestKey: statisticsRequestKey,
          error: fetchError instanceof Error ? fetchError.message : 'Statistiken konnten nicht geladen werden.',
        });
      });

    return () => controller.abort();
  }, [selectedGame, statisticsRequestKey]);

  const historyGroups = data?.history.groups;
  const previewGroups = data?.previews.groups;

  const previewRunsByGame = useMemo(() => {
    const entries = (previewGroups || []).map((group) => [gameFilterKey(group.gameVersion), group.runs] as const);
    return new Map(entries);
  }, [previewGroups]);

  const comparisonData = comparisonRequest?.requestKey === comparisonRequestKey
    ? comparisonRequest.data
    : null;
  const comparisonError = comparisonRequest?.requestKey === comparisonRequestKey
    ? comparisonRequest.error
    : null;
  const comparisonLoading = comparisonRequestKey !== null
    && comparisonRequest?.requestKey !== comparisonRequestKey;

  const selectedRunSummaries = useMemo(() => {
    const byId = new Map<number, RunSummary>();
    for (const group of historyGroups || []) {
      for (const run of group.runs) byId.set(run.id, run);
    }
    for (const group of previewGroups || []) {
      for (const run of group.runs) byId.set(run.id, run);
    }
    if (comparisonData) {
      byId.set(comparisonData.left.run.id, comparisonData.left.run);
      byId.set(comparisonData.right.run.id, comparisonData.right.run);
    }
    return selectedRunIds.map((id) => byId.get(id) || null);
  }, [comparisonData, historyGroups, previewGroups, selectedRunIds]);

  const openComparison = useCallback(() => {
    document.getElementById('run-comparison')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  async function loadMore(group: HistoryGroup) {
    if (group.nextCursor === null) return;
    const gameKey = gameFilterKey(group.gameVersion);
    setLoadMoreFailure(null);
    setLoadingMore((current) => new Set(current).add(gameKey));

    try {
      const controller = new AbortController();
      const response = await fetchJson<HistoryResponse>(
        `/api/runs/history?game=${encodeURIComponent(gameKey)}&limit=10&cursor=${group.nextCursor}`,
        controller.signal,
      );
      const nextGroup = response.groups[0];
      if (!nextGroup) return;
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          history: {
            ...current.history,
            groups: current.history.groups.map((existing) => {
              if (gameFilterKey(existing.gameVersion) !== gameKey) return existing;
              const knownIds = new Set(existing.runs.map((run) => run.id));
              return {
                ...existing,
                runs: [...existing.runs, ...nextGroup.runs.filter((run) => !knownIds.has(run.id))],
                nextCursor: nextGroup.nextCursor,
              };
            }),
          },
        };
      });
    } catch (loadError) {
      setLoadMoreFailure({
        requestKey: statisticsRequestKey,
        message: loadError instanceof Error ? loadError.message : 'Weitere Runs konnten nicht geladen werden.',
      });
    } finally {
      setLoadingMore((current) => {
        const next = new Set(current);
        next.delete(gameKey);
        return next;
      });
    }
  }

  const totals = data?.overview.totals;
  const scopeLabel = data?.overview.scope.label || (selectedGame === 'all' ? 'Alle Spiele' : 'Gewähltes Spiel');

  return (
    <div className="app-page">
      <header className="app-page-header mb-7 md:mb-9">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <AppPageTitle
            index="05"
            title="Statistik"
            description="Jeder dokumentierte Run, unabhängig davon, welches Spiel gerade aktiv ist."
          />
          {data && (
            <div className="app-band app-band--navy px-4 py-3 text-sm text-white/70">
              <span className="font-bold text-white">{scopeLabel}</span>
              <span className="mx-2 text-white/35">·</span>
              {data.overview.totals.gameCount} Spiel{data.overview.totals.gameCount === 1 ? '' : 'e'}
              <span className="mx-2 text-white/35">·</span>
              {data.overview.totals.completedRuns}{' '}
              {data.overview.totals.completedRuns === 1 ? 'Sieg' : 'Siege'}
              <span className="mx-2 text-white/35">·</span>
              {data.overview.totals.failedRuns}{' '}
              {data.overview.totals.failedRuns === 1
                ? 'Niederlage'
                : 'Niederlagen'}
            </div>
          )}
        </div>
        <div className="mt-6">
          <GameFilter
            games={data?.overview.games || []}
            selectedGame={selectedGame}
            onSelect={selectGame}
          />
        </div>
      </header>

      {loading && <LoadingView />}

      {!loading && error && (
        <section className="app-section border-rose-400/30 bg-rose-500/[0.07] p-6 text-center" role="alert">
          <h2 className="text-lg font-bold text-rose-200">Statistiken konnten nicht geladen werden</h2>
          <p className="mt-2 text-sm text-rose-100/80">{error}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setReloadToken((token) => token + 1)}
              className="app-action app-action-primary min-h-11"
            >
              Erneut versuchen
            </button>
            {selectedGame !== 'all' && (
              <button
                type="button"
                onClick={() => selectGame('all')}
                className="app-action min-h-11"
              >
                Alle Spiele anzeigen
              </button>
            )}
          </div>
        </section>
      )}

      {!loading && !error && data && totals && (
        <div className="space-y-10">
          <section aria-labelledby="overview-title" className="app-section p-0">
            <div className="app-section-title px-4 py-3">
              <h2 id="overview-title" className="text-xl font-black uppercase tracking-[-0.02em] text-[var(--foreground)]">{scopeLabel} auf einen Blick</h2>
            </div>
            <div className="app-band app-band--navy grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Runs" value={totals.runCount} detail={`${totals.activeRuns} gerade aktiv`} />
              <KpiCard label="Begegnungen" value={totals.totalEncounters} detail="vollständig erfasst" />
              <KpiCard label="Gefangen" value={totals.caughtCount} detail="erfolgreiche Fänge" />
              <KpiCard label="K.O." value={totals.knockedOutCount} detail="verlorene Pokémon" />
              <KpiCard label="Nicht gefangen" value={totals.notCaughtCount} detail="verpasste Begegnungen" />
              <KpiCard label="Spielzeit" value={formatDuration(totals.totalDurationMs)} detail={`${totals.maxBadges} Abzeichen als Bestwert`} />
            </div>
          </section>

          <RunTrends runs={data.analytics.runTrends} />

          <section aria-labelledby="games-title" className="app-section p-4 md:p-5">
            <div className="app-section-title flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <h2 id="games-title" className="text-xl font-black uppercase tracking-[-0.02em] text-[var(--foreground)]">Alle Spielstände im Vergleich</h2>
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">Spiel auswählen, um Analyse und Historie zu filtern.</p>
            </div>
            {data.overview.games.length > 0 ? (
              <div className="grid gap-0 border-l border-t border-[var(--border-default)] md:grid-cols-2 xl:grid-cols-3">
                {data.overview.games.map((game) => {
                  const key = gameFilterKey(game.gameVersion);
                  return (
                    <GameSummaryCard
                      key={key}
                      game={game}
                      runs={previewRunsByGame.get(key) || []}
                      selected={selectedGame === key}
                      onSelect={(nextKey) => selectGame(selectedGame === nextKey ? 'all' : nextKey)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="border border-dashed border-[var(--border-default)] bg-[var(--card-bg)] p-8 text-center">
                <h3 className="font-bold text-[var(--foreground)]">Noch keine Runs erfasst</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Die erste Spielübersicht erscheint, sobald ein Run gestartet wurde.</p>
              </div>
            )}
          </section>

          <section aria-labelledby="analytics-title" className="app-section p-0">
            <div className="app-section-title px-4 md:px-5">
              <h2 id="analytics-title" className="text-xl font-black uppercase tracking-[-0.02em] text-[var(--foreground)]">Was über die Runs hinweg passiert ist</h2>
            </div>
            <AnalyticsCards analytics={data.analytics} />
          </section>

          <section aria-labelledby="history-title" className="app-section p-4 md:p-5">
            <div className="app-section-title flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <h2 id="history-title" className="text-2xl font-black uppercase tracking-[-0.02em] text-[var(--foreground)]">Vollständige Run-Historie</h2>
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">Details werden erst beim Aufklappen geladen.</p>
            </div>
            {loadMoreError && (
              <p className="mb-4 border border-rose-400/30 bg-rose-500/[0.07] px-4 py-3 text-sm text-rose-700 dark:text-rose-200" role="alert">
                {loadMoreError}
              </p>
            )}
            {selectedRunIds.length > 0 && (
              <div className="mb-5">
                <RunComparisonTray
                  selectedRunIds={selectedRunIds}
                  selectedRuns={selectedRunSummaries.filter((run): run is RunSummary => run !== null)}
                  loading={comparisonLoading}
                  onRemove={(runId) => updateComparisonSelection(selectedRunIds.filter((id) => id !== runId))}
                  onClear={() => updateComparisonSelection([])}
                  onOpen={openComparison}
                />
              </div>
            )}
            {selectedRunIds.length === 2 && (
              <div className="mb-5">
                <RunComparison
                  data={comparisonData}
                  loading={comparisonLoading}
                  error={comparisonError}
                  onSwap={() => updateComparisonSelection([...selectedRunIds].reverse())}
                  onClear={() => updateComparisonSelection([])}
                  onRetry={() => setComparisonRetryToken((token) => token + 1)}
                />
              </div>
            )}
            <RunHistory
              key={selectedGame}
              groups={data.history.groups}
              loadingMore={loadingMore}
              selectedForComparison={selectedRunIds}
              onToggleComparison={toggleRunComparison}
              onLoadMore={(group) => void loadMore(group)}
            />
          </section>
        </div>
      )}
    </div>
  );
}
