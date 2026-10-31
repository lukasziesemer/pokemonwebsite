'use client';

import Image from 'next/image';
import { createPortal } from 'react-dom';
import { useEffect, useId, useMemo, useRef, type CSSProperties } from 'react';
import { getTypeColor, getGermanTypeName } from '@/lib/design-tokens';
import type {
  EvolutionEdge,
  EvolutionNode,
  LevelUpMove,
  PokemonDetailsResponse,
} from '@/lib/pokemon-details';
import { getSpriteUrl } from '@/lib/sprite-utils';
import { useSpriteMode } from '@/lib/contexts/SpriteContext';
import type { PokemonDetailsTarget } from './PokemonDetailsProvider';

interface PokemonDetailsDialogProps {
  target: PokemonDetailsTarget;
  targetName: string;
  details: PokemonDetailsResponse | null;
  loading: boolean;
  error: string | null;
  gameVersionName?: string | null;
  onClose: () => void;
  onRetry: () => void;
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const statDefinitions = [
  { key: 'hp', label: 'KP' },
  { key: 'attack', label: 'Angriff' },
  { key: 'defense', label: 'Verteidigung' },
  { key: 'spAttack', label: 'Sp.-Angriff' },
  { key: 'spDefense', label: 'Sp.-Verteidigung' },
  { key: 'speed', label: 'Initiative' },
] as const;

const damageClassLabels: Record<string, string> = {
  physical: 'Physisch',
  special: 'Spezial',
  status: 'Status',
  variable: 'Typabhängig',
};

function MoveRows({ moves }: { moves: LevelUpMove[] }) {
  if (moves.length === 0) {
    return <p className="pokemon-details-empty">Für diese Edition sind keine Level-up-Attacken hinterlegt.</p>;
  }

  return (
    <div className="pokemon-details-moves-scroll">
      <table className="pokemon-details-moves">
        <thead>
          <tr>
            <th>Level</th>
            <th>Attacke</th>
            <th>Typ</th>
            <th>Klasse</th>
            <th>Stärke</th>
            <th title="Genauigkeit">Gen.</th>
            <th>AP</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((move, index) => (
            <tr key={`${move.name}-${move.level}-${move.order}-${index}`}>
              <td><strong>{move.level}</strong></td>
              <th scope="row">{move.displayName}</th>
              <td>
                <span
                  className="pokemon-details-type"
                  style={{ '--type-accent': getTypeColor(move.type) } as CSSProperties}
                >
                  {getGermanTypeName(move.type)}
                </span>
              </td>
              <td>{damageClassLabels[move.damageClass] ?? move.damageClass}</td>
              <td>{move.power ?? '–'}</td>
              <td>{move.accuracy === null ? '–' : `${move.accuracy}%`}</td>
              <td>{move.pp ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvolutionPokemon({ node }: { node: EvolutionNode | undefined }) {
  if (!node) return <span className="pokemon-details-evolution-missing">Unbekannt</span>;
  return (
    <span className="pokemon-details-evolution-pokemon">
      {node.spriteUrl ? (
        <Image src={node.spriteUrl} alt="" width={52} height={52} sizes="52px" />
      ) : null}
      <span>
        <strong>{node.displayName}</strong>
        <small>#{node.pokedexId}</small>
      </span>
    </span>
  );
}

function EvolutionRows({
  nodes,
  edges,
  currentPokedexId,
}: {
  nodes: EvolutionNode[];
  edges: EvolutionEdge[];
  currentPokedexId: number;
}) {
  const nodesById = useMemo(
    () => new Map(nodes.map(node => [node.pokedexId, node])),
    [nodes],
  );

  if (edges.length === 0) {
    const onlyNode = nodes.find(node => node.pokedexId === currentPokedexId) ?? nodes[0];
    return (
      <div className="pokemon-details-evolution-single">
        <EvolutionPokemon node={onlyNode} />
        <p>Keine weitere Entwicklung.</p>
      </div>
    );
  }

  return (
    <ol className="pokemon-details-evolution-list">
      {edges.map((edge, index) => (
        <li key={`${edge.fromPokedexId}-${edge.toPokedexId}-${index}`}>
          <EvolutionPokemon node={nodesById.get(edge.fromPokedexId)} />
          <span className="pokemon-details-evolution-condition">
            <svg viewBox="0 0 42 18" aria-hidden="true">
              <path d="M1 9h37m-7-6 7 6-7 6" />
            </svg>
            <span>
              {edge.conditions.length > 0
                ? edge.conditions.map(condition => condition.label).join(' oder ')
                : 'Entwicklung'}
            </span>
          </span>
          <EvolutionPokemon node={nodesById.get(edge.toPokedexId)} />
        </li>
      ))}
    </ol>
  );
}

export default function PokemonDetailsDialog({
  target,
  targetName,
  details,
  loading,
  error,
  gameVersionName,
  onClose,
  onRetry,
}: PokemonDetailsDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const { spriteMode } = useSpriteMode();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => closeRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const pokemon = details?.pokemon;
  const displayName = pokemon?.displayName ?? targetName;
  const spriteUrl = pokemon
    ? getSpriteUrl(pokemon, spriteMode)
    : getSpriteUrl({
        spriteUrl: target.spriteUrl ?? null,
        spriteGifUrl: target.spriteGifUrl ?? null,
      }, spriteMode);
  const editionName = details?.edition?.name ?? gameVersionName;

  return createPortal(
    <div
      className="pokemon-details-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="pokemon-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header className="pokemon-details-header">
          <div className="pokemon-details-identity">
            {spriteUrl ? (
              <Image
                src={spriteUrl}
                alt=""
                width={82}
                height={82}
                sizes="(max-width: 767px) 64px, 82px"
                unoptimized={spriteMode === 'animated' && Boolean(pokemon?.spriteGifUrl ?? target.spriteGifUrl)}
              />
            ) : null}
            <div>
              <span className="pokemon-details-kicker">Pokémon #{pokemon?.pokedexId ?? target.pokedexId}</span>
              <h2 id={titleId}>{displayName}</h2>
              <div className="pokemon-details-types">
                {(pokemon?.types ?? target.types ?? []).map(type => (
                  <span
                    key={type}
                    className="pokemon-details-type"
                    style={{ '--type-accent': getTypeColor(type) } as CSSProperties}
                  >
                    {getGermanTypeName(type)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p id={descriptionId}>
            Basiswerte, Level-up-Attacken und Entwicklungen
            {editionName ? ` für ${editionName}` : ''}.
          </p>
          <button
            ref={closeRef}
            type="button"
            className="pokemon-details-close"
            onClick={onClose}
            aria-label="Pokémon-Details schließen"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="pokemon-details-body">
          {loading ? (
            <div className="pokemon-details-loading" role="status">
              <span aria-hidden="true" />
              Pokémon-Daten werden geladen …
            </div>
          ) : null}

          {error ? (
            <div className="pokemon-details-error" role="alert">
              <strong>Daten konnten nicht geladen werden.</strong>
              <p>{error}</p>
              <button type="button" className="app-action" onClick={onRetry}>Erneut versuchen</button>
            </div>
          ) : null}

          {details ? (
            <>
              <section className="pokemon-details-section" aria-labelledby={`${titleId}-stats`}>
                <div className="pokemon-details-section-title">
                  <span>01</span>
                  <h3 id={`${titleId}-stats`}>Basiswerte</h3>
                  <strong>{details.pokemon.stats.total} Gesamt-BP</strong>
                </div>
                <dl className="pokemon-details-stats">
                  {statDefinitions.map(definition => {
                    const value = details.pokemon.stats[definition.key];
                    return (
                      <div key={definition.key}>
                        <dt>{definition.label}</dt>
                        <dd>
                          <span className="pokemon-details-stat-track" aria-hidden="true">
                            <span style={{ '--stat-width': `${Math.min(100, (value / 255) * 100)}%` } as CSSProperties} />
                          </span>
                          <strong>{value}</strong>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>

              <section className="pokemon-details-section" aria-labelledby={`${titleId}-moves`}>
                <div className="pokemon-details-section-title">
                  <span>02</span>
                  <h3 id={`${titleId}-moves`}>Attacken nach Level</h3>
                  {details.edition ? <strong>{details.edition.name}</strong> : null}
                </div>
                {details.levelUpMoves === null ? (
                  <div className="pokemon-details-edition-warning">
                    <strong>Keine Edition festgelegt</strong>
                    <p>Ohne Edition des aktuellen Runs wird keine möglicherweise falsche Attackenliste angezeigt.</p>
                  </div>
                ) : <MoveRows moves={details.levelUpMoves} />}
              </section>

              <section className="pokemon-details-section" aria-labelledby={`${titleId}-evolution`}>
                <div className="pokemon-details-section-title">
                  <span>03</span>
                  <h3 id={`${titleId}-evolution`}>Entwicklungen</h3>
                </div>
                {details.evolution.editionScope?.note ? (
                  <p className="mb-4 text-sm leading-6 text-[var(--text-secondary)]">
                    {details.evolution.editionScope.note}
                  </p>
                ) : null}
                <EvolutionRows
                  nodes={details.evolution.nodes}
                  edges={details.evolution.edges}
                  currentPokedexId={details.pokemon.pokedexId}
                />
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
