import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { DashboardPlayer } from '@/app/dashboard-data';
import {
  describeDefensiveMultiplier,
  formatDefensiveMultiplier,
  getDefensiveCoverageKind,
  typeAbbreviations,
} from '@/lib/defensive-coverage';
import { getTypeColor } from '@/lib/design-tokens';
import { allPokemonTypes, getDefenseMultiplier, getGermanTypeName } from '@/lib/typeEffectiveness';
import { getDisplayName } from './dashboard-view';
import styles from './Dashboard.module.css';

const legend = [
  { multiplier: 0, label: 'Immun' },
  { multiplier: 0.25, label: 'Stark resistent' },
  { multiplier: 0.5, label: 'Resistent' },
  { multiplier: 2, label: 'Schwach' },
  { multiplier: 4, label: 'Kritisch' },
];

interface CoverageGridProps {
  player: DashboardPlayer;
  linkedSlot: number | null;
  onSlotHover: (slot: number | null) => void;
}

export default function CoverageGrid({ player, linkedSlot, onSlotHover }: CoverageGridProps) {
  const team = [...player.team].sort((a, b) => a.teamSlot - b.teamSlot);
  if (team.length === 0) {
    return <p className={styles.coverageEmpty}>Noch keine Pokémon im Team.</p>;
  }

  return (
    <div className={styles.coverage}>
      <table className={styles.coverageTable}>
        <caption className="sr-only">
          Defensive Coverage: Schadensmultiplikatoren der 18 Angriffstypen gegen jedes Pokémon im Team von {player.name}
        </caption>
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">Team-Pokémon</span></th>
            {allPokemonTypes.map(type => (
              <th key={type} scope="col" className={styles.typeHead}>
                <abbr
                  title={getGermanTypeName(type)}
                  style={{ '--type': getTypeColor(type) } as CSSProperties}
                >
                  <Image src={`/icons/types/${type}.svg`} alt="" width={14} height={14} />
                  <span className="sr-only">{getGermanTypeName(type)} ({typeAbbreviations[type]})</span>
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {team.map(pokemon => {
            const name = getDisplayName(pokemon);

            return (
              <tr
                key={pokemon.id}
                data-linked={linkedSlot === pokemon.teamSlot ? 'true' : undefined}
                onPointerEnter={() => onSlotHover(pokemon.teamSlot)}
                onPointerLeave={() => onSlotHover(null)}
              >
                <th scope="row" className={styles.rowHead} title={name}>
                  <Image src={pokemon.spriteUrl ?? '/pokeball.svg'} alt="" width={24} height={24} sizes="24px" />
                  <span className="sr-only">{name}</span>
                </th>
                {allPokemonTypes.map((attackType, column) => {
                  const multiplier = getDefenseMultiplier(pokemon.types, attackType);
                  const kind = getDefensiveCoverageKind(multiplier);
                  const typeLabel = getGermanTypeName(attackType);

                  return (
                    <td
                      key={attackType}
                      data-kind={kind}
                      style={{ '--col': column } as CSSProperties}
                      aria-label={`${name} gegen ${typeLabel}: ${describeDefensiveMultiplier(multiplier)}`}
                      title={`${name} gegen ${typeLabel}: ${describeDefensiveMultiplier(multiplier)}`}
                    >
                      {kind === 'neutral' ? null : formatDefensiveMultiplier(multiplier).replace('×', '')}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CoverageLegend() {
  return (
    <div className={styles.legend}>
      <strong>Defensive Coverage</strong>
      <ul aria-label="Schadensmultiplikatoren">
        {legend.map(item => (
          <li key={item.multiplier}>
            <b data-kind={getDefensiveCoverageKind(item.multiplier)}>
              {formatDefensiveMultiplier(item.multiplier)}
            </b>
            {item.label}
          </li>
        ))}
      </ul>
      <p>Nur aus den Typen berechnet, ohne Fähigkeiten und Items.</p>
    </div>
  );
}
