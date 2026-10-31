'use client';

import { useId, useMemo, useState, type CSSProperties } from 'react';
import type { Pokemon } from '@/lib/types';
import { usePokemonDetailsData } from '@/lib/hooks/usePokemonDetailsData';
import { buildEvolutionForest, evolutionAddState, type EvolutionTreeNode } from '@/lib/pokemon-evolution-comparison';
import { getPokemonDisplayName, getSeriesColor, SeriesMarker } from './comparison-ui';
import PokemonMiniSprite from './PokemonMiniSprite';
import styles from './EvolutionComparison.module.css';

interface EvolutionComparisonProps {
  pokemon: Pokemon[];
  gameVersionKey: string | null;
  gameVersionName: string | null;
  availablePokemonIds: number[];
  onAddPokemon: (pokedexId: number) => void;
}

interface BranchProps {
  branch: EvolutionTreeNode;
  currentId: number;
  selectedIds: number[];
  availableIds: ReadonlySet<number>;
  onAddPokemon: (pokedexId: number) => void;
}

function EvolutionBranch({ branch, currentId, selectedIds, availableIds, onAddPokemon }: BranchProps) {
  const current = branch.pokemon.pokedexId === currentId;
  const addState = evolutionAddState(branch.pokemon.pokedexId, selectedIds, availableIds);
  return (
    <li className={styles.branch}>
      {branch.conditions.length > 0 ? (
        <div className={styles.connection}>
          <span aria-hidden="true">→</span>
          <span>{branch.conditions.map(condition => condition.label).join(' oder ')}</span>
        </div>
      ) : null}
      <div className={`${styles.node} ${current ? styles.current : ''}`} aria-current={current ? 'true' : undefined}>
        <div className={styles.identity}>
          <PokemonMiniSprite pokemon={branch.pokemon} size="md" />
          <strong>{branch.pokemon.displayName}</strong>
          <span>#{branch.pokemon.pokedexId}</span>
        </div>
        {current ? <span className={styles.currentLabel}>Aktuelle Form</span> : (
          <>
            <button
              type="button"
              className={`app-action ${styles.addButton}`}
              disabled={addState.disabled}
              title={addState.reason ?? undefined}
              aria-label={`${branch.pokemon.displayName} zum Vergleich hinzufügen`}
              onClick={() => onAddPokemon(branch.pokemon.pokedexId)}
            >
              {addState.label}
            </button>
            {addState.reason ? <small className={styles.reason}>{addState.reason}</small> : null}
          </>
        )}
      </div>
      {branch.children.length > 0 ? (
        <ol className={styles.children} aria-label={`Entwicklungen von ${branch.pokemon.displayName}`}>
          {branch.children.map(child => (
            <EvolutionBranch
              key={child.pokemon.pokedexId}
              branch={child}
              currentId={currentId}
              selectedIds={selectedIds}
              availableIds={availableIds}
              onAddPokemon={onAddPokemon}
            />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

export default function EvolutionComparison({ pokemon, gameVersionKey, gameVersionName, availablePokemonIds, onAddPokemon }: EvolutionComparisonProps) {
  const [open, setOpen] = useState(false);
  const sectionId = useId();
  const selectedIds = pokemon.map(entry => entry.pokedexId);
  const availableIds = useMemo(() => new Set(availablePokemonIds), [availablePokemonIds]);
  const { detailsById, errorsById, loading, retry } = usePokemonDetailsData({
    pokemonIds: selectedIds,
    gameVersionKey,
    enabled: open,
  });

  if (pokemon.length === 0) return null;

  return (
    <section className={`app-section ${styles.section}`} aria-labelledby={`${sectionId}-title`}>
      <h2 id={`${sectionId}-title`}>
        <button type="button" className={styles.toggle} aria-label="Entwicklungen im Vergleich" aria-expanded={open} aria-controls={`${sectionId}-body`} onClick={() => setOpen(value => !value)}>
          <span>
            <span className={styles.title}>Entwicklungen im Vergleich</span>
            <span className={styles.subtitle}>Entwicklungswege und Bedingungen · {gameVersionName || 'Keine Edition zugeordnet'}</span>
          </span>
          <span className={styles.toggleAction}>
            <span className="hidden sm:inline">{open ? 'Einklappen' : 'Öffnen'}</span>
            <svg aria-hidden="true" className={`size-5 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </button>
      </h2>
      {open ? (
        <div id={`${sectionId}-body`} className={styles.body}>
          <p className={styles.intro}>
            {gameVersionName ? `${gameVersionName} · ` : ''}Aktuelle Formen sind markiert. Hinzufügen belegt nur einen Vergleichsplatz; eure Teams bleiben unverändert.
          </p>
          <p className={styles.scopeNote}>
            Die Entwicklungsketten berücksichtigen die Generation und den Einführungszeitpunkt der Bedingungen. Editionsabhängige Verfügbarkeit und Sonderregeln sind nicht vollständig bestätigt.
          </p>
          {loading ? <p className={styles.status} role="status">Entwicklungen werden geladen …</p> : null}
          <div className={styles.families}>
            {pokemon.map((entry, index) => {
              const details = detailsById[entry.pokedexId];
              const error = errorsById[entry.pokedexId];
              const forest = details ? buildEvolutionForest(details.evolution) : [];
              return (
                <article key={entry.pokedexId} className={styles.family} style={{ '--evolution-accent': getSeriesColor(index) } as CSSProperties}>
                  <h3 className={styles.familyTitle}>
                    <SeriesMarker index={index} size="sm" />
                    <PokemonMiniSprite pokemon={entry} size="xs" />
                    {getPokemonDisplayName(entry)}
                  </h3>
                  {error ? (
                    <div className={styles.error} role="alert">
                      <p>{error}</p>
                      <button type="button" className="app-action" onClick={retry}>Erneut versuchen</button>
                    </div>
                  ) : details ? (
                    <>
                      {forest.length > 0 ? (
                        <div className={styles.scroll} role="region" aria-label={`Entwicklungskette von ${getPokemonDisplayName(entry)}`} tabIndex={0}>
                          <ol className={styles.tree}>
                            {forest.map(branch => (
                              <EvolutionBranch key={branch.pokemon.pokedexId} branch={branch} currentId={entry.pokedexId} selectedIds={selectedIds} availableIds={availableIds} onAddPokemon={onAddPokemon} />
                            ))}
                          </ol>
                        </div>
                      ) : <p className={styles.status}>Für diese Form sind in der gewählten Generation keine Entwicklungsdaten verfügbar.</p>}
                      {details.evolution.editionScope?.excludedPokemonCount ? (
                        <p className={styles.scopeNote}>{details.evolution.editionScope.excludedPokemonCount} spätere oder nicht zur dargestellten Form gehörende Pokémon ausgeblendet.</p>
                      ) : null}
                      {!details.edition ? <p className={styles.scopeNote}>Keine Edition zugeordnet: allgemeine Entwicklungskette ohne Editionsprüfung.</p> : null}
                      {details.evolution.edges.length === 0 && forest.length > 0 ? <p className={styles.scopeNote}>Keine weitere Entwicklung in dieser Kette hinterlegt.</p> : null}
                    </>
                  ) : <p className={styles.status}>Entwicklungsdaten werden angefordert …</p>}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
