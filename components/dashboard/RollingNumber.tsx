import type { CSSProperties } from 'react';
import styles from './Dashboard.module.css';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Zahl als Zählwerk: Die Ziffern rollen beim Laden und bei jeder Änderung auf ihren Wert. */
export default function RollingNumber({ value }: { value: number | string }) {
  const text = String(value);
  const characters = Array.from(text);

  return (
    <span className={styles.rolling}>
      <span className="sr-only">{text}</span>
      <span className={styles.rollingTrack} aria-hidden="true">
        {characters.map((character, index) => {
          // Von rechts gezählt, damit vorhandene Stellen bleiben, wenn die Zahl wächst.
          const place = characters.length - index;
          if (!/\d/.test(character)) return <span key={place}>{character}</span>;

          return (
            <span
              key={place}
              className={styles.digit}
              style={{ '--digit': Number(character) } as CSSProperties}
            >
              <span>
                {DIGITS.map(digit => <span key={digit}>{digit}</span>)}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
