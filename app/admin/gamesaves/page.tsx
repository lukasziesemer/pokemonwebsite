'use client';

import { useState, useEffect, useCallback } from 'react';
import RunCompletionDialog from '@/components/admin/RunCompletionDialog';
import { getRunStatusLabel, type RunOutcome, type RunStatus } from '@/lib/run-lifecycle';

interface GameSave {
  id: number;
  name: string;
  description: string | null;
  gameVersionKey: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GameVersion {
  key: string;
  name: string;
  generation: number;
}

interface Run {
  id: number;
  runNumber: number;
  status: RunStatus;
  loserPlayerName: string | null;
  startedAt: string;
  endedAt: string | null;
  badgesEarned: number;
  gameVersion: GameVersion | null;
  playerStats: {
    playerName: string;
    knockedOutCount: number;
    notCaughtCount: number;
    isLoser: boolean;
  }[];
}

interface Player {
  id: number;
  name: string;
}

export default function AdminGameSavesPage() {
  const [gameSaves, setGameSaves] = useState<GameSave[]>([]);
  const [gameVersions, setGameVersions] = useState<GameVersion[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [historicalRuns, setHistoricalRuns] = useState<Run[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [routeTemplates, setRouteTemplates] = useState<Record<string, number>>({});
  
  // Dialog States
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showEndRunDialog, setShowEndRunDialog] = useState(false);
  const [showStartRunDialog, setShowStartRunDialog] = useState(false);
  
  // Form States
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveGameVersion, setSaveGameVersion] = useState('');
  const [newRunGameVersion, setNewRunGameVersion] = useState('');
  
  // Upload States
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Unbekannter Fehler';

  const fetchData = useCallback(
    () =>
      Promise.all([
        fetch('/api/admin/gamesaves'),
        fetch('/api/admin/game-versions'),
        fetch('/api/admin/runs'),
        fetch('/api/players'),
        fetch('/api/admin/route-templates'),
      ])
        .then(async ([savesRes, versionsRes, runsRes, playersRes, templatesRes]) => {
          if (!savesRes.ok || !versionsRes.ok || !runsRes.ok) {
            throw new Error('Fehler beim Laden der Daten');
          }

          const savesJson = await savesRes.json();
          const versionsJson = await versionsRes.json();
          const runsJson = await runsRes.json();
          const playersJson = await playersRes.json();

          setGameSaves(savesJson.data || []);
          setGameVersions(versionsJson.data || []);
          setActiveRun(runsJson.data?.activeRun || null);
          setHistoricalRuns(runsJson.data?.historicalRuns || []);
          setPlayers(playersJson || []);
          setRouteTemplates(templatesRes.ok ? (await templatesRes.json()).data ?? {} : {});
        })
        .catch((error) => {
          setError(getErrorMessage(error));
        })
        .finally(() => {
          setLoading(false);
        }),
    [],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openStartDialog = (gameVersionKey: string) => {
    setNewRunGameVersion(gameVersionKey);
    setShowStartRunDialog(true);
  };

  // Run Management
  const handleStartRun = async () => {
    setProcessing(true);
    try {
      const startsAfterFinishedRun = historicalRuns.length > 0;
      const res = await fetch(
        startsAfterFinishedRun ? '/api/admin/runs/next' : '/api/admin/runs',
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameVersionKey: newRunGameVersion || null }),
        },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Starten');
      }

      const data = await res.json();
      setNotice({ kind: 'success', text: data.data?.message || 'Neuer Run gestartet!' });
      setShowStartRunDialog(false);
      setNewRunGameVersion('');
      fetchData();
    } catch (error) {
      setNotice({ kind: 'error', text: `Fehler: ${getErrorMessage(error)}` });
    } finally {
      setProcessing(false);
    }
  };

  const handleFinishRun = async (
    outcome: RunOutcome,
    loserPlayerName?: string,
  ) => {
    if (!activeRun) {
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/runs/${activeRun.id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: outcome,
          loserPlayerName:
            outcome === 'failed' ? loserPlayerName : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Beenden');
      }

      setNotice({
        kind: 'success',
        text: outcome === 'completed'
          ? `Run #${activeRun.runNumber} wurde als Sieg gespeichert.`
          : `Run #${activeRun.runNumber} wurde als Niederlage gespeichert.`,
      });
      setShowEndRunDialog(false);
      await fetchData();
      // Der Abschluss führt direkt weiter, damit kein zweiter Weg gesucht werden muss.
      openStartDialog(activeRun.gameVersion?.key ?? '');
    } catch (error) {
      setNotice({ kind: 'error', text: `Fehler: ${getErrorMessage(error)}` });
    } finally {
      setProcessing(false);
    }
  };

  const handleReopenRun = async (run: Run) => {
    if (
      !confirm(
        `Run #${run.runNumber} wieder öffnen? Der gespeicherte Abschluss-Snapshot wird entfernt, der aktuelle Live-Stand bleibt erhalten.`,
      )
    ) {
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/runs/${run.id}/reopen`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Fehler beim Rückgängigmachen');
      }

      setNotice({ kind: 'success', text: data.data?.message || 'Run ist wieder aktiv.' });
      await fetchData();
    } catch (error) {
      setNotice({ kind: 'error', text: `Fehler: ${getErrorMessage(error)}` });
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveRouteTemplate = async () => {
    if (!templateVersion) return;

    setProcessing(true);
    try {
      const res = await fetch('/api/admin/route-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameVersionKey: templateVersion.key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler beim Speichern der Vorlage');

      setNotice({
        kind: 'success',
        text: `${data.data.count} Routen als Vorlage für ${templateVersion.name} gespeichert.`,
      });
      await fetchData();
    } catch (error) {
      setNotice({ kind: 'error', text: `Fehler: ${getErrorMessage(error)}` });
    } finally {
      setProcessing(false);
    }
  };

  // GameSave Management
  const handleSaveGame = async () => {
    if (!saveName.trim()) {
      setNotice({ kind: 'error', text: 'Bitte gib einen Namen ein' });
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch('/api/admin/gamesaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveName,
          description: saveDescription,
          gameVersionKey: saveGameVersion || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Speichern');
      }

      setNotice({ kind: 'success', text: 'Spielstand erfolgreich gespeichert!' });
      setShowSaveDialog(false);
      setSaveName('');
      setSaveDescription('');
      setSaveGameVersion('');
      fetchData();
    } catch (error) {
      setNotice({ kind: 'error', text: `Fehler: ${getErrorMessage(error)}` });
    } finally {
      setProcessing(false);
    }
  };

  const handleLoadGame = async (gameSaveId: number, name: string) => {
    if (!confirm(`Möchtest du wirklich den Spielstand "${name}" laden?\n\nALLE AKTUELLEN DATEN WERDEN ÜBERSCHRIEBEN!`)) {
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch('/api/admin/gamesaves/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSaveId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Laden');
      }

      const data = await res.json();
      setNotice({ kind: 'success', text: data.message });
      await fetchData();
    } catch (error) {
      setNotice({ kind: 'error', text: `Fehler: ${getErrorMessage(error)}` });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteSave = async (gameSaveId: number, name: string) => {
    if (!confirm(`Spielstand "${name}" wirklich löschen?`)) return;

    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/gamesaves/${gameSaveId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Löschen');
      }
      setNotice({ kind: 'success', text: 'Spielstand gelöscht' });
      fetchData();
    } catch (error) {
      setNotice({ kind: 'error', text: `Fehler: ${getErrorMessage(error)}` });
    } finally {
      setProcessing(false);
    }
  };

  const handleDownloadSave = (gameSaveId: number) => {
    // Die Route liefert einen Datei-Download und keine Next.js-Seite.
    const link = document.createElement('a');
    link.href = `/api/admin/gamesaves/${gameSaveId}/download`;
    link.click();
  };

  const handleUploadSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Bitte wähle eine JSON-Datei aus.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      if (uploadName.trim()) formData.append('name', uploadName.trim());
      if (uploadDescription.trim()) formData.append('description', uploadDescription.trim());

      const res = await fetch('/api/admin/gamesaves/import', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Fehler beim Importieren');

      setNotice({ kind: 'success', text: 'Spielstand erfolgreich importiert!' });
      setUploadName('');
      setUploadDescription('');
      setUploadFile(null);
      fetchData();
    } catch (error) {
      setUploadError(getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  // Group versions by generation
  const versionsByGen = gameVersions.reduce((acc, v) => {
    if (!acc[v.generation]) acc[v.generation] = [];
    acc[v.generation].push(v);
    return acc;
  }, {} as Record<number, GameVersion[]>);
  const latestFinishedRun = historicalRuns[0] ?? null;
  const templateVersion = activeRun?.gameVersion ?? latestFinishedRun?.gameVersion ?? null;
  const previousVersion = latestFinishedRun?.gameVersion ?? null;
  const chosenVersion = gameVersions.find((version) => version.key === newRunGameVersion) ?? null;
  const isVersionChange = Boolean(previousVersion && chosenVersion && previousVersion.key !== chosenVersion.key);
  const chosenTemplateSize = chosenVersion ? routeTemplates[chosenVersion.key] ?? 0 : 0;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-[var(--text-tertiary)]">Lade Daten...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-red-400">Fehler: {error}</p>
      </div>
    );
  }

  return (
    <main className="admin-page">
      <header>
        <h1 className="text-4xl font-bold text-[var(--foreground)]">Spielstände & Runs</h1>
        <p className="mt-2 text-[var(--text-secondary)]">Verwalte Spielstände und Nuzlocke-Runs</p>
      </header>

      {notice ? (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-center justify-between gap-3 border-l-4 px-3 py-2 text-sm font-bold ${
            notice.kind === 'error'
              ? 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-300'
              : 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <p>{notice.text}</p>
          <button type="button" onClick={() => setNotice(null)} className="app-action">Schließen</button>
        </div>
      ) : null}

      {/* Aktueller Run Status */}
      <section className="app-section p-5 sm:p-6">
        <h2 className="text-2xl font-bold mb-4 text-[var(--foreground)]">Aktueller Run</h2>
        
        {activeRun ? (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg">
                <span className="font-bold text-green-400">Run #{activeRun.runNumber}</span>
                {activeRun.gameVersion && (
                  <span className="ml-2 text-[var(--text-secondary)]">- {activeRun.gameVersion.name}</span>
                )}
              </p>
              <p className="text-sm text-[var(--text-tertiary)]">
                Gestartet: {new Date(activeRun.startedAt).toLocaleDateString('de-DE')}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowEndRunDialog(true)}
                disabled={processing}
                data-testid="run-completion-open"
                className="min-h-11 rounded-lg border border-blue-500/30 bg-blue-500/20 px-4 py-2 font-semibold text-blue-400 transition hover:bg-blue-500/30 disabled:opacity-50"
              >
                Run abschließen
              </button>
            </div>
          </div>
        ) : (
          latestFinishedRun ? (
            <div
              data-testid="finished-run-actions"
              className={`border-l-4 p-4 ${
                latestFinishedRun.status === 'completed'
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-red-500 bg-red-500/10'
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p
                    className={`text-lg font-bold ${
                      latestFinishedRun.status === 'completed'
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }`}
                  >
                    Run #{latestFinishedRun.runNumber}{' '}
                    {getRunStatusLabel(latestFinishedRun.status).toLowerCase()}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {latestFinishedRun.gameVersion?.name ?? 'Keine Spielversion'} ·{' '}
                    {latestFinishedRun.badgesEarned} von 8 Orden
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="/statistik"
                    className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border-default)] bg-[var(--background-secondary)] px-4 py-2 font-medium text-[var(--foreground)] hover:bg-[var(--background-tertiary)]"
                  >
                    {latestFinishedRun.status === 'completed'
                      ? 'Siegerstand ansehen'
                      : 'Run-Stand ansehen'}
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowSaveDialog(true)}
                    disabled={processing}
                    className="min-h-11 rounded-lg border border-[var(--border-default)] bg-[var(--background-secondary)] px-4 py-2 font-medium text-[var(--foreground)] hover:bg-[var(--background-tertiary)] disabled:opacity-50"
                  >
                    Spielstand sichern
                  </button>
                  <button
                    type="button"
                    data-testid="run-reopen"
                    onClick={() => handleReopenRun(latestFinishedRun)}
                    disabled={processing}
                    className="min-h-11 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    Abschluss rückgängig
                  </button>
                  <button
                    type="button"
                    data-testid="run-next-open"
                    onClick={() => openStartDialog(latestFinishedRun.gameVersion?.key ?? '')}
                    disabled={processing}
                    className="min-h-11 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 font-semibold text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    Nächsten Run starten
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[var(--text-tertiary)]">
                Kein aktiver Run. Starte den ersten Run!
              </p>
              <button
                onClick={() => openStartDialog('')}
                disabled={processing}
                className="min-h-11 rounded-lg border border-green-500/30 bg-green-500/20 px-4 py-2 font-semibold text-green-400 transition hover:bg-green-500/30 disabled:opacity-50"
              >
                Neuen Run starten
              </button>
            </div>
          )
        )}
      </section>

      {/* Run History */}
      {historicalRuns.length > 0 && (
        <section className="app-section p-5 sm:p-6">
          <h2 className="text-2xl font-bold mb-4 text-[var(--foreground)]">Run-Historie ({historicalRuns.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--border-default)]">
                  <th className="py-2 px-4 text-[var(--text-secondary)]">Run</th>
                  <th className="py-2 px-4 text-[var(--text-secondary)]">Spiel</th>
                  <th className="py-2 px-4 text-[var(--text-secondary)]">Status</th>
                  <th className="py-2 px-4 text-[var(--text-secondary)]">Verlierer</th>
                  <th className="py-2 px-4 text-[var(--text-secondary)]">Datum</th>
                </tr>
              </thead>
              <tbody>
                {historicalRuns.map((run) => (
                  <tr key={run.id} className="border-b border-[var(--border-default)] hover:bg-[var(--background-secondary)]">
                    <td className="py-2 px-4 font-bold text-[var(--foreground)]">#{run.runNumber}</td>
                    <td className="py-2 px-4 text-[var(--foreground)]">{run.gameVersion?.name || '-'}</td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-1 rounded text-sm border ${
                        run.status === 'failed' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'
                      }`}>
                        {getRunStatusLabel(run.status)}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-[var(--foreground)]">{run.loserPlayerName || '-'}</td>
                    <td className="py-2 px-4 text-sm text-[var(--text-tertiary)]">
                      {run.endedAt ? new Date(run.endedAt).toLocaleDateString('de-DE') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Spielstände Actions */}
      <div className="flex flex-wrap justify-end gap-3 mb-4">
        {templateVersion ? (
          <button
            onClick={handleSaveRouteTemplate}
            disabled={processing}
            className="px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-lg transition disabled:opacity-50 font-semibold"
          >
            Routen als Vorlage für {templateVersion.name} speichern
          </button>
        ) : null}
        <button
          onClick={() => setShowSaveDialog(true)}
          disabled={processing}
          className="px-6 py-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-lg transition disabled:opacity-50 font-semibold"
        >
          Aktuellen Spielstand sichern
        </button>
      </div>

      {/* Game Saves List */}
      <section className="app-section overflow-hidden">
        <div className="px-6 py-4 bg-[var(--background-secondary)] border-b border-[var(--border-default)]">
          <h2 className="text-xl font-bold text-[var(--foreground)]">Gespeicherte Spielstände ({gameSaves.length})</h2>
        </div>

        {gameSaves.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-tertiary)]">
            <p className="text-lg mb-2">Noch keine Spielstände vorhanden</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-default)]">
            {gameSaves.map((save) => (
              <div key={save.id} className="p-6 hover:bg-[var(--background-secondary)] transition">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-[var(--foreground)] mb-1">{save.name}</h3>
                    {save.description && <p className="text-[var(--text-secondary)] mb-2">{save.description}</p>}
                    <div className="flex gap-4 text-sm text-[var(--text-tertiary)]">
                      <span>{new Date(save.createdAt).toLocaleString('de-DE')}</span>
                      {save.gameVersionKey && (
                        <span>{gameVersions.find(v => v.key === save.gameVersionKey)?.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-4">
                    <button
                      onClick={() => handleDownloadSave(save.id)}
                      className="px-4 py-2 bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] text-[var(--foreground)] border border-[var(--border-default)] rounded-md transition text-sm font-semibold"
                      disabled={processing}
                    >
                      Download
                    </button>
                    <button
                      onClick={() => handleLoadGame(save.id, save.name)}
                      disabled={processing}
                      className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-md transition disabled:opacity-50 text-sm font-semibold"
                    >
                      Laden
                    </button>
                    <button
                      onClick={() => handleDeleteSave(save.id, save.name)}
                      disabled={processing}
                      className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-md transition disabled:opacity-50 text-sm font-semibold"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Upload Section */}
      <section className="app-section p-5 sm:p-6">
        <h2 className="text-2xl font-bold mb-4 text-[var(--foreground)]">Spielstand importieren</h2>
        <form className="space-y-4" onSubmit={handleUploadSave}>
          {uploadError && <div className="bg-red-500/20 text-red-400 p-3 rounded-md border border-red-500/30">{uploadError}</div>}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Datei *</label>
            <input
              type="file"
              accept="application/json"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-[var(--foreground)]"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Name (optional)</label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border-default)] rounded-md bg-[var(--background-secondary)] text-[var(--foreground)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Beschreibung (optional)</label>
              <input
                type="text"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border-default)] rounded-md bg-[var(--background-secondary)] text-[var(--foreground)]"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading}
              className="px-6 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-md transition disabled:opacity-50 font-semibold"
            >
              {uploading ? 'Importiere...' : 'Importieren'}
            </button>
          </div>
        </form>
      </section>

      {/* Dialogs */}
      
      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-lg p-6 max-w-md w-full mx-4 border border-[var(--border-default)]">
            <h2 className="text-2xl font-bold mb-4 text-[var(--foreground)]">Spielstand speichern</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Name *</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="z.B. Pokémon Platin - Nach Arena 4"
                  className="w-full px-3 py-2 border border-[var(--border-default)] rounded-md bg-[var(--background-secondary)] text-[var(--foreground)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Spielversion</label>
                <select
                  value={saveGameVersion}
                  onChange={(e) => setSaveGameVersion(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border-default)] rounded-md bg-[var(--background-secondary)] text-[var(--foreground)]"
                >
                  <option value="">-- Keine Version --</option>
                  {Object.entries(versionsByGen).map(([gen, versions]) => (
                    <optgroup key={gen} label={`Generation ${gen}`}>
                      {versions.map((v) => (
                        <option key={v.key} value={v.key}>{v.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Beschreibung (optional)</label>
                <textarea
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-[var(--border-default)] rounded-md bg-[var(--background-secondary)] text-[var(--foreground)]"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowSaveDialog(false); setSaveName(''); setSaveDescription(''); setSaveGameVersion(''); }}
                  className="px-4 py-2 bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] text-[var(--foreground)] border border-[var(--border-default)] rounded-md"
                  disabled={processing}
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSaveGame}
                  disabled={processing}
                  className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-md disabled:opacity-50"
                >
                  {processing ? 'Speichere...' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Start Run Dialog */}
      {showStartRunDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-lg p-6 max-w-md w-full mx-4 border border-[var(--border-default)]">
            <h2 className="text-2xl font-bold mb-2 text-[var(--foreground)]">
              {latestFinishedRun ? 'Nächsten Run starten' : 'Neuen Run starten'}
            </h2>
            <p className="mb-4 text-sm text-[var(--text-secondary)]">
              {latestFinishedRun
                ? 'Die Spieler bleiben erhalten, die Live-Begegnungen werden geleert. Der Abschlussstand bleibt in der Run-Historie gespeichert.'
                : 'Lege die Spielversion für den ersten Run fest.'}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Spielversion *</label>
                <select
                  value={newRunGameVersion}
                  onChange={(e) => setNewRunGameVersion(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border-default)] rounded-md bg-[var(--background-secondary)] text-[var(--foreground)]"
                >
                  <option value="" disabled>-- Spielversion wählen --</option>
                  {Object.entries(versionsByGen).map(([gen, versions]) => (
                    <optgroup key={gen} label={`Generation ${gen}`}>
                      {versions.map((v) => (
                        <option key={v.key} value={v.key}>{v.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {isVersionChange ? (
                <p role="status" className="text-sm text-[var(--text-secondary)]">
                  {previousVersion?.name}: Die aktuellen Routen werden als Vorlage gesichert.{' '}
                  {chosenTemplateSize > 0
                    ? `${chosenVersion?.name}: ${chosenTemplateSize} Routen aus der Vorlage ersetzen sie.`
                    : `Für ${chosenVersion?.name} gibt es noch keine Vorlage, die Routen bleiben stehen.`}
                </p>
              ) : null}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowStartRunDialog(false); setNewRunGameVersion(''); }}
                  className="px-4 py-2 bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] text-[var(--foreground)] border border-[var(--border-default)] rounded-md"
                  disabled={processing}
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleStartRun}
                  disabled={processing || !newRunGameVersion}
                  className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-md disabled:opacity-50"
                >
                  {processing ? 'Starte...' : 'Run starten'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEndRunDialog && (
        <RunCompletionDialog
          isOpen
          run={activeRun}
          players={players}
          busy={processing}
          onClose={() => setShowEndRunDialog(false)}
          onConfirm={handleFinishRun}
        />
      )}
    </main>
  );
}
