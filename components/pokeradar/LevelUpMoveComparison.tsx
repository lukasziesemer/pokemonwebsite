'use client';

import { useId, useMemo, useState, type CSSProperties } from 'react';
import { usePokemonDetailsData } from '@/lib/hooks/usePokemonDetailsData';
import { getGermanTypeName } from '@/lib/design-tokens';
import type { Pokemon } from '@/lib/types';
import TypeBadge from '@/components/ui/TypeBadge';
import PokemonMiniSprite from './PokemonMiniSprite';
import { EmptyComparisonState, getPokemonDisplayName, getSeriesColor, SeriesMarker } from './comparison-ui';
import {
  buildLevelUpMoveRows,
  filterLevelUpMoveRows,
  getMoveComparisonColumns,
  type MoveColumnState,
} from './level-up-move-comparison';
import styles from './LevelUpMoveComparison.module.css';

interface LevelUpMoveComparisonProps {
  pokemon: Pokemon[];
  gameVersionKey: string | null;
  gameVersionName: string | null;
  levelCap: number | null;
}

const damageClassLabels: Record<string, string> = {
  physical: 'Physisch',
  special: 'Spezial',
  status: 'Status',
  variable: 'Typabhängig',
};

const columnLabels: Record<Exclude<MoveColumnState, 'ready'>, string> = {
  loading: 'Wird geladen …',
  error: 'Ladefehler',
  unavailable: 'Keine Editionsdaten',
};

function seriesStyle(index: number): CSSProperties {
  return { '--comparison-color': getSeriesColor(index) } as CSSProperties;
}

export default function LevelUpMoveComparison({
  pokemon,
  gameVersionKey,
  gameVersionName,
  levelCap,
}: LevelUpMoveComparisonProps) {
  const [open, setOpen] = useState(false);
  const [capOnly, setCapOnly] = useState(false);
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const [attackType, setAttackType] = useState('');
  const panelId = useId();
  const pokemonIds = useMemo(() => pokemon.map((entry) => entry.pokedexId), [pokemon]);
  const { detailsById, errorsById, loading, retry } = usePokemonDetailsData({
    pokemonIds,
    gameVersionKey,
    enabled: open && gameVersionKey !== null,
  });
  const columns = useMemo(() => getMoveComparisonColumns(
    pokemonIds, gameVersionKey, detailsById, errorsById,
  ), [pokemonIds, gameVersionKey, detailsById, errorsById]);
  const rows = useMemo(() => buildLevelUpMoveRows(columns), [columns]);
  const allReady = columns.length > 0 && columns.every((column) => column.state === 'ready');
  const canCompareDifferences = allReady && columns.length > 1;
  const activeCap = capOnly ? levelCap : null;
  const types = useMemo(() => Array.from(new Set(rows.map((row) => row.move.type))).sort((a, b) => (
    getGermanTypeName(a).localeCompare(getGermanTypeName(b), 'de')
  )), [rows]);
  const activeType = types.includes(attackType) ? attackType : '';
  const shownRows = useMemo(() => filterLevelUpMoveRows(rows, {
    levelCap: activeCap,
    onlyDifferences: differencesOnly && canCompareDifferences,
    type: activeType,
  }), [rows, activeCap, differencesOnly, canCompareDifferences, activeType]);
  const failedNames = columns.flatMap((column, index) => (
    column.state === 'error' ? [getPokemonDisplayName(pokemon[index])] : []
  ));
  const unavailableNames = columns.flatMap((column, index) => (
    column.state === 'unavailable' ? [getPokemonDisplayName(pokemon[index])] : []
  ));

  return (
    <section className={`app-section p-0 ${styles.section}`}>
      <h2 className={styles.heading}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label="Level-up-Attacken"
        >
          <span>
            <span className="block text-lg font-black uppercase tracking-[-0.02em] text-[var(--foreground)] md:text-xl">
              Level-up-Attacken
            </span>
            <span className="mt-1 block text-xs font-normal normal-case leading-5 tracking-normal text-[var(--text-secondary)] md:text-sm">
              Lernlevel direkt vergleichen · {gameVersionName || 'Keine Edition zugeordnet'}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
            <span className="hidden sm:inline">{open ? 'Einklappen' : 'Öffnen'}</span>
            <svg aria-hidden="true" className={`size-5 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
      </h2>

      {open ? (
        <div id={panelId} className={styles.body}>
          {!gameVersionKey ? (
            <EmptyComparisonState>
              Dem aktuellen Run ist keine Edition zugeordnet. Deshalb wird keine Attackenliste angezeigt.
            </EmptyComparisonState>
          ) : pokemon.length === 0 ? (
            <EmptyComparisonState>Füge Pokémon hinzu, um ihre Level-up-Attacken zu vergleichen.</EmptyComparisonState>
          ) : (
            <>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                Ausschließlich Level-up-Attacken für <strong className="text-[var(--foreground)]">{gameVersionName || gameVersionKey}</strong>.
                {' '}Keine TM-, VM-, Tutor- oder Ei-Attacken.
              </p>
              <div className={styles.filters}>
                <label className={styles.check}>
                  <input type="checkbox" checked={capOnly && levelCap !== null} disabled={levelCap === null} onChange={(event) => setCapOnly(event.target.checked)} />
                  Bis Level-Cap{levelCap !== null ? ` (${levelCap})` : ' (nicht verfügbar)'}
                </label>
                <label className={styles.check} title={!canCompareDifferences ? 'Mindestens zwei vollständig geladene Attackenlisten erforderlich' : undefined}>
                  <input type="checkbox" checked={differencesOnly && canCompareDifferences} disabled={!canCompareDifferences} onChange={(event) => setDifferencesOnly(event.target.checked)} />
                  Nur Unterschiede
                </label>
                <label className={styles.typeFilter}>
                  Attackentyp
                  <select aria-label="Attackentyp" value={activeType} onChange={(event) => setAttackType(event.target.value)}>
                    <option value="">Alle Typen</option>
                    {types.map((type) => <option key={type} value={type}>{getGermanTypeName(type)}</option>)}
                  </select>
                </label>
              </div>

              {failedNames.length > 0 ? (
                <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 border-l-2 border-red-500 bg-red-500/10 p-3 text-sm text-[var(--foreground)]">
                  <span>Daten für {failedNames.join(', ')} konnten nicht geladen werden. Diese Spalten sind unbekannt.</span>
                  <button type="button" className="app-action min-h-11" onClick={() => retry()} disabled={loading}>Erneut versuchen</button>
                </div>
              ) : null}
              {unavailableNames.length > 0 ? (
                <p role="status" className="mb-3 text-sm text-[var(--text-secondary)]">
                  Keine passenden Editionsdaten für {unavailableNames.join(', ')}. Es wird keine andere Edition verwendet.
                </p>
              ) : null}
              <p role="status" className="mb-2 text-xs text-[var(--text-secondary)]">
                {loading ? 'Attackenlisten werden geladen … ' : ''}
                {shownRows.length} von {rows.length} bekannten Attacken sichtbar{!allReady ? ' · Vergleich noch unvollständig' : ''}
              </p>

              {shownRows.length > 0 ? (
                <div className={styles.scroll} tabIndex={0} role="region" aria-label="Level-up-Attacken, horizontal scrollbar">
                  <table className={styles.table}>
                    <caption className="sr-only">Lernlevel der ausgewählten Pokémon in {gameVersionName || gameVersionKey}</caption>
                    <thead>
                      <tr>
                        <th scope="col" className={styles.moveColumn}>Attacke</th>
                        {pokemon.map((entry, index) => (
                          <th key={entry.pokedexId} scope="col" className={styles.pokemonColumn} style={seriesStyle(index)}>
                            <span className={styles.pokemonIdentity}>
                              <SeriesMarker index={index} size="sm" />
                              <PokemonMiniSprite pokemon={entry} size="xs" />
                              <span>{getPokemonDisplayName(entry)}</span>
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shownRows.map((row) => (
                        <tr key={row.move.name}>
                          <th scope="row" className={styles.moveColumn}>
                            <span className="font-bold text-[var(--foreground)]">{row.move.displayName}</span>
                            <span className={styles.metadata}>
                              <TypeBadge type={row.move.type} size="sm" showIcon={false} className="!px-1.5 !py-0 !text-[10px]" />
                              <span>{damageClassLabels[row.move.damageClass] || row.move.damageClass}</span>
                            </span>
                          </th>
                          {columns.map((column, index) => {
                            const levels = row.levels[index];
                            return (
                              <td key={column.pokedexId} style={seriesStyle(index)}>
                                {levels === null ? (
                                  <span className="text-xs text-[var(--text-secondary)]">{column.state === 'ready' ? 'Unbekannt' : columnLabels[column.state]}</span>
                                ) : levels.length === 0 ? (
                                  <span aria-label="In dieser Edition nicht per Levelaufstieg erlernbar" className="text-[var(--text-tertiary)]">–</span>
                                ) : (
                                  <span className={styles.levels}>
                                    {levels.map((level) => (
                                      <span key={level} className={`${styles.level} ${activeCap !== null && level > activeCap ? styles.laterLevel : ''}`} title={`Level ${level}${activeCap !== null && level > activeCap ? ' · über dem Level-Cap' : ''}`}>
                                        Lv. {level}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : loading ? (
                <EmptyComparisonState>Die editionsspezifischen Attacken werden geladen.</EmptyComparisonState>
              ) : rows.length > 0 ? (
                <EmptyComparisonState>
                  <p>Keine Attacken entsprechen diesen Filtern.</p>
                  <button type="button" className="app-action mt-3 min-h-11" onClick={() => { setAttackType(''); setCapOnly(false); setDifferencesOnly(false); }}>Filter zurücksetzen</button>
                </EmptyComparisonState>
              ) : allReady ? (
                <EmptyComparisonState>Keines der ausgewählten Pokémon hat in dieser Edition Level-up-Attacken.</EmptyComparisonState>
              ) : null}

              {rows.length > 0 ? (
                <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
                  – = nicht per Levelaufstieg erlernbar.
                  {activeCap !== null ? ' Gezeigt werden Attacken, die mindestens ein Pokémon bis zum Cap lernt; gedimmte Lernlevel liegen darüber.' : ''}
                  {differencesOnly && canCompareDifferences ? ' Unterschiede beziehen sich auf alle Lernlevel.' : ''}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
