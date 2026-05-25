import type { Fiche } from '../../types';
import styles from './MonthlyBars.module.css';

interface Props {
  fiches: Fiche[];
}

export default function MonthlyBars({ fiches }: Props) {
  const counts = new Map<string, number>();
  for (const f of fiches) counts.set(f.month, (counts.get(f.month) ?? 0) + 1);
  const months = [...counts.keys()].sort();
  const max = Math.max(...months.map((m) => counts.get(m) ?? 0), 1);

  return (
    <section className={styles.section}>
      <h3 className={styles.h}>Évolution mensuelle</h3>
      <div className={styles.chart}>
        {months.map((m) => {
          const c = counts.get(m) ?? 0;
          const h = Math.max(4, Math.round((c / max) * 140));
          return (
            <div key={m} className={styles.col} title={`${m} — ${c} fiches`}>
              <div className={styles.barWrap}>
                <span className={styles.value}>{c}</span>
                <div className={styles.bar} style={{ height: `${h}px` }} />
              </div>
              <span className={styles.month}>{m}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
