import type { CSSProperties } from 'react';
import type { DashboardData } from '@/app/dashboard-data';
import RollingNumber from './RollingNumber';
import styles from './Dashboard.module.css';

interface BalanceBandProps {
  totals: DashboardData['totals'];
  playerTotals: DashboardData['playerTotals'];
  gameName: string | null;
  highlighted: boolean;
}

export default function BalanceBand({ totals, playerTotals, gameName, highlighted }: BalanceBandProps) {
  const values = [
    { label: 'Runs', value: totals.wins + totals.losses },
    { label: 'Siege', value: totals.wins, tone: 'win' },
    { label: 'Niederlagen', value: totals.losses, tone: 'loss' },
    { label: 'Siegquote', value: totals.winRate === null ? '–' : `${totals.winRate}%` },
    { label: 'K.O.', value: totals.knockedOut, tone: 'loss' },
    { label: 'Nicht gefangen', value: totals.notCaught, tone: 'escape' },
  ];

  return (
    <section
      className={styles.balance}
      data-lit={highlighted ? 'true' : undefined}
      aria-labelledby="overall-balance-title"
    >
      <div className={styles.balanceTitle}>
        <h2 id="overall-balance-title">Gesamtbilanz</h2>
        {gameName ? <p>{gameName}</p> : null}
      </div>

      <dl className={styles.totals}>
        {values.map(item => (
          <div key={item.label} data-tone={item.tone}>
            <dt>{item.label}</dt>
            <dd><RollingNumber value={item.value} /></dd>
          </div>
        ))}
      </dl>

      <div className={styles.playerBalance}>
        {playerTotals.length > 0 ? (
          <table>
            <caption>Spielerbilanz der abgeschlossenen Runs</caption>
            <thead>
              <tr>
                <th scope="col">Spieler</th>
                <th scope="col">K.O.</th>
                <th scope="col">Nicht gefangen</th>
                <th scope="col">Runs verloren</th>
                <th scope="col">Niederlagenquote</th>
              </tr>
            </thead>
            <tbody>
              {playerTotals.map(player => (
                <tr key={player.id} style={{ '--player': player.color } as CSSProperties}>
                  <th scope="row">
                    <span className={styles.playerMark} aria-hidden="true" />
                    {player.name}
                    <small>{player.runs} {player.runs === 1 ? 'Run' : 'Runs'}</small>
                  </th>
                  <td><RollingNumber value={player.knockedOut} /></td>
                  <td><RollingNumber value={player.notCaught} /></td>
                  <td><RollingNumber value={player.losses} /></td>
                  <td>
                    {player.lossRate === null ? '–' : (
                      <span className={styles.rate}>
                        <RollingNumber value={`${player.lossRate}%`} />
                        <span
                          className={styles.rateBar}
                          style={{ '--rate': `${player.lossRate}%` } as CSSProperties}
                          aria-hidden="true"
                        >
                          <i />
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Noch keine Spielerstatistiken erfasst.</p>
        )}
      </div>
    </section>
  );
}
