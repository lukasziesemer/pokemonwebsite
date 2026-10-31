'use client';

/**
 * Admin: Pokémon-Cache-Verwaltung
 * PokeAPI Synchronisierung und Cache-Übersicht
 */

import { useState, useEffect } from 'react';

interface Pokemon {
  id: number;
  pokedexId: number;
  name: string;
  nameGerman: string | null;
  updatedAt: string;
}

export default function AdminPokemonPage() {
  const [pokemon, setPokemon] = useState<Pokemon[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [addPokedexId, setAddPokedexId] = useState('');
  const [adding, setAdding] = useState(false);
  const [syncingGifs, setSyncingGifs] = useState(false);
  const [gifSyncProgress, setGifSyncProgress] = useState('');
  const MAX_AVAILABLE = 1050; // Aktuell verfügbare Pokémon (Gen 1-9)
  const [liveProgress, setLiveProgress] = useState<{
    current: number;
    total: number;
    isRunning: boolean;
  }>({
    current: 0,
    total: MAX_AVAILABLE,
    isRunning: false,
  });

  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Unbekannter Fehler';

  // Pokémon laden
  const loadPokemon = () =>
    fetch('/api/pokemon')
      .then((res) => res.json())
      .then((data: { pokemon: Pokemon[]; count: number }) => {
        setPokemon(data.pokemon || []);
        setCount(data.count || 0);
      })
      .catch((error) => {
        console.error('Error loading pokemon:', error);
      })
      .finally(() => {
        setLoading(false);
      });

  useEffect(() => {
    loadPokemon();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchProgress = async () => {
      try {
        const res = await fetch('/api/admin/pokemon/sync/progress', {
          cache: 'no-store',
        });
        if (!res.ok || !isMounted) return;
        const data = await res.json();
        setLiveProgress({
          current: data.current ?? 0,
          total: data.total ?? MAX_AVAILABLE,
          isRunning: Boolean(data.isRunning),
        });
        if (isMounted && Boolean(data.isRunning) !== syncing) {
          setSyncing(Boolean(data.isRunning));
        }
      } catch (error) {
        if (isMounted) {
          console.error('Error fetching sync progress:', error);
        }
      }
    };

    fetchProgress();
    const interval = setInterval(fetchProgress, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [MAX_AVAILABLE, syncing]);

  // Alle Pokémon synchronisieren (Gen 1-4, 1-493)
  const handleSyncPlatinum = async () => {
    if (!confirm('Alle Pokémon von Gen 1-4 (1-493) synchronisieren? Dies kann einige Minuten dauern.')) {
      return;
    }

    setSyncing(true);
    setSyncProgress('Synchronisierung gestartet...');

    try {
      const res = await fetch('/api/admin/pokemon/sync', {
        method: 'POST',
      });

      const data = await res.json();

      if (res.ok) {
        setSyncProgress(`Erfolgreich! ${data.count} Pokémon synchronisiert.`);
        await loadPokemon();
      } else {
        const errorMsg = data.error || 'Unbekannter Fehler';
        const details = data.details ? `\n\nDetails: ${data.details}` : '';
        setSyncProgress(`Fehler: ${errorMsg}${details}`);
        console.error('Sync error:', data);
      }
    } catch (error) {
      setSyncProgress(
        `Netzwerkfehler beim Synchronisieren: ${getErrorMessage(error)}`
      );
      console.error('Network error:', error);
    } finally {
      setSyncing(false);
    }
  };

  // Alle verfügbaren Pokémon synchronisieren (1-1050)
  const handleSyncAll = async () => {
    if (!confirm(`Alle verfügbaren Pokémon (1-${MAX_AVAILABLE}, Gen 1-9) synchronisieren?\n\nDies kann 15-20 Minuten dauern!`)) {
      return;
    }

    setSyncing(true);
    setSyncProgress('Synchronisierung gestartet... (Dies kann sehr lange dauern!)');

    try {
      const res = await fetch('/api/admin/pokemon/sync?all=true', {
        method: 'POST',
      });

      const data = await res.json();

      if (res.ok) {
        setSyncProgress(`Erfolgreich! ${data.count} Pokémon synchronisiert.`);
        await loadPokemon();
      } else {
        const errorMsg = data.error || 'Unbekannter Fehler';
        const details = data.details ? `\n\nDetails: ${data.details}` : '';
        setSyncProgress(`Fehler: ${errorMsg}${details}`);
        console.error('Sync error:', data);
      }
    } catch (error) {
      setSyncProgress(
        `Netzwerkfehler beim Synchronisieren: ${getErrorMessage(error)}`
      );
      console.error('Network error:', error);
    } finally {
      setSyncing(false);
    }
  };

  // GIF-Sprites synchronisieren
  const handleSyncGifs = async () => {
    if (!confirm('GIF-Sprites für alle Pokémon ohne animierte Sprites nachladen? Dies kann einige Minuten dauern.')) {
      return;
    }

    setSyncingGifs(true);
    setGifSyncProgress('GIF-Synchronisierung gestartet...');

    try {
      const res = await fetch('/api/admin/pokemon/sync-gifs', {
        method: 'POST',
      });

      const data = await res.json();

      if (res.ok) {
        setGifSyncProgress(`Erfolgreich! ${data.updated} von ${data.total} GIF-Sprites aktualisiert.`);
      } else {
        setGifSyncProgress(`Fehler: ${data.error || 'Unbekannter Fehler'}`);
      }
    } catch (error) {
      setGifSyncProgress(`Netzwerkfehler: ${getErrorMessage(error)}`);
    } finally {
      setSyncingGifs(false);
    }
  };

  // Einzelnes Pokémon hinzufügen
  const handleAddPokemon = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);

    try {
      const res = await fetch('/api/admin/pokemon/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pokedexId: addPokedexId }),
      });

      const data = await res.json();

      if (res.ok) {
        alert(data.message);
        setAddPokedexId('');
        await loadPokemon();
      } else {
        alert(`Fehler: ${data.error}`);
      }
    } catch (error) {
      console.error('Error adding pokemon:', error);
      alert('Netzwerkfehler');
    } finally {
      setAdding(false);
    }
  };

  return (
    <main className="admin-page">
      <h1 className="text-4xl font-bold text-[var(--foreground)]">
        Pokémon-Cache verwalten
      </h1>

      {/* Stats */}
      <section className="app-band grid grid-cols-1 divide-y divide-[var(--border-default)] md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-[var(--text-secondary)] mb-2">
            Gecachte Pokémon
          </h3>
          <p className="text-4xl font-bold text-red-400">{count}</p>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            von {MAX_AVAILABLE} (Gen 1-9)
          </p>
        </div>

        <div className="p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-[var(--text-secondary)] mb-2">
            Fortschritt
          </h3>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-bold text-blue-400">
              {((count / MAX_AVAILABLE) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="mt-2 h-2 w-full bg-[var(--background-secondary)]">
            <div
              className="h-2 bg-[var(--brand-blue)] transition-all"
              style={{ width: `${Math.min((count / MAX_AVAILABLE) * 100, 100)}%` }}
            />
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            Live-Status:{' '}
            {liveProgress.current}/{liveProgress.total}{' '}
            {liveProgress.isRunning ? '(läuft …)' : '(inaktiv)'}
          </p>
        </div>
      </section>

      {/* Sync-Aktionen */}
      <section className="app-section p-5 sm:p-6">
        <h2 className="text-2xl font-bold mb-4 text-[var(--foreground)]">Synchronisierung</h2>

        <div className="space-y-4">
          {/* Vollständige Synchronisierung - Alle verfügbaren */}
          <div>
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {syncing
                ? 'Synchronisiere...'
                : `Alle verfügbaren Pokémon synchronisieren (1-${MAX_AVAILABLE})`}
            </button>
            <p className="text-sm text-[var(--text-tertiary)] mt-2">
              Lädt alle verfügbaren Pokémon von Gen 1-9 von der PokeAPI. Dies kann 15-20 Minuten dauern.
            </p>
            {syncProgress && (
              <div className={`mt-3 p-3 rounded-md whitespace-pre-wrap border ${
                syncProgress.startsWith('Fehler:') || syncProgress.startsWith('Netzwerkfehler')
                  ? 'bg-red-500/20 text-red-400 border-red-500/30'
                  : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
              }`}>
                <div className="max-h-48 overflow-y-auto">
                  {syncProgress}
                </div>
              </div>
            )}
          </div>

          {/* Nur Gen 1-4 Synchronisierung */}
          <div className="pt-4 border-t border-[var(--border-default)]">
            <button
              onClick={handleSyncPlatinum}
              disabled={syncing}
              className="px-6 py-3 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing
                ? 'Synchronisiere...'
                : 'Nur Gen 1-4 synchronisieren (1-493)'}
            </button>
            <p className="text-sm text-[var(--text-tertiary)] mt-2">
              Lädt nur Pokémon von Gen 1-4 (Pokémon Platin). Dies kann 5-10 Minuten dauern.
            </p>
          </div>

          {/* GIF-Sprites nachladen */}
          <div className="pt-4 border-t border-[var(--border-default)]">
            <button
              onClick={handleSyncGifs}
              disabled={syncingGifs || syncing}
              className="px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {syncingGifs ? 'Synchronisiere GIFs...' : 'Animierte GIF-Sprites nachladen'}
            </button>
            <p className="text-sm text-[var(--text-tertiary)] mt-2">
              Lädt animierte Sprites (GIF) für alle Pokémon nach, die noch keine haben.
              Hinweis: GIF-Sprites sind nur für ältere Generationen verfügbar.
            </p>
            {gifSyncProgress && (
              <div className={`mt-3 p-3 rounded-md border ${
                gifSyncProgress.startsWith('Fehler:') || gifSyncProgress.startsWith('Netzwerkfehler')
                  ? 'bg-red-500/20 text-red-400 border-red-500/30'
                  : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
              }`}>
                {gifSyncProgress}
              </div>
            )}
          </div>

          {/* Einzelnes Pokémon hinzufügen */}
          <div className="pt-4 border-t border-[var(--border-default)]">
            <h3 className="text-lg font-semibold mb-2 text-[var(--foreground)]">
              Einzelnes Pokémon hinzufügen
            </h3>
            <form onSubmit={handleAddPokemon} className="flex gap-2">
              <input
                type="number"
                min="1"
                max={MAX_AVAILABLE}
                required
                value={addPokedexId}
                onChange={(e) => setAddPokedexId(e.target.value)}
                placeholder={`Pokedex-Nummer (1-${MAX_AVAILABLE})`}
                className="flex-1 px-3 py-2 border border-[var(--border-default)] rounded-md bg-[var(--background-secondary)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                type="submit"
                disabled={adding}
                className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-md transition disabled:opacity-50"
              >
                {adding ? 'Lädt...' : 'Hinzufügen'}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Pokémon-Liste */}
      <section className="app-section overflow-hidden p-5 sm:p-6">
        <h2 className="text-2xl font-bold mb-4 text-[var(--foreground)]">Gecachte Pokémon</h2>

        {loading ? (
          <p className="text-[var(--text-tertiary)]">Lädt...</p>
        ) : pokemon.length === 0 ? (
          <p className="text-[var(--text-tertiary)]">
            Noch keine Pokémon im Cache. Klicke auf &quot;Alle Pokémon
            synchronisieren&quot; um zu starten.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--card-bg)]">
                <tr className="border-b border-[var(--border-default)]">
                  <th className="text-left py-2 px-4 text-[var(--text-secondary)]">#</th>
                  <th className="text-left py-2 px-4 text-[var(--text-secondary)]">Name (Deutsch)</th>
                  <th className="text-left py-2 px-4 text-[var(--text-secondary)]">Name (Englisch)</th>
                  <th className="text-left py-2 px-4 text-[var(--text-secondary)]">Zuletzt aktualisiert</th>
                </tr>
              </thead>
              <tbody>
                {pokemon.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--border-default)] hover:bg-[var(--background-secondary)]">
                    <td className="py-2 px-4 text-[var(--foreground)]">#{p.pokedexId}</td>
                    <td className="py-2 px-4 font-semibold text-[var(--foreground)]">
                      {p.nameGerman || '-'}
                    </td>
                    <td className="py-2 px-4 text-[var(--foreground)]">{p.name}</td>
                    <td className="py-2 px-4 text-[var(--text-tertiary)]">
                      {new Date(p.updatedAt).toLocaleDateString('de-DE')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

