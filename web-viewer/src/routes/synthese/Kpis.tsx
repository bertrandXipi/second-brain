import type { IndexFile } from '../../types';
import styles from './Kpis.module.css';

function topDomains(data: IndexFile, n: number): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const f of data.fiches) {
    try {
      const d = new URL(f.source_url).hostname.replace(/^www\./, '');
      map.set(d, (map.get(d) ?? 0) + 1);
    } catch {
      // ignore
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

interface Props {
  data: IndexFile;
}

export default function Kpis({ data }: Props) {
  const topTags = data.facets.tags.slice(0, 8);
  const topKw = data.facets.keywords.slice(0, 8);
  const domains = topDomains(data, 8);

  return (
    <section className={styles.grid}>
      <div className={styles.card}>
        <h3 className={styles.h}>Volume</h3>
        <div className={styles.numbers}>
          <div className={styles.numCell}>
            <span className={styles.n}>{data.counts.fiches}</span>
            <span className={styles.label}>fiches</span>
          </div>
          <div className={styles.numCell}>
            <span className={styles.n}>{data.counts.digests}</span>
            <span className={styles.label}>digests</span>
          </div>
          <div className={styles.numCell}>
            <span className={styles.n}>{data.counts.insights}</span>
            <span className={styles.label}>insights</span>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.h}>Top tags</h3>
        <ul className={styles.list}>
          {topTags.map((t) => (
            <li key={t.name}>
              <span className={styles.barName}>{t.name}</span>
              <span className={styles.barCount}>{t.count}</span>
            </li>
          ))}
          {topTags.length === 0 && <li className={styles.empty}>aucun tag</li>}
        </ul>
      </div>

      <div className={styles.card}>
        <h3 className={styles.h}>Top keywords</h3>
        <ul className={styles.list}>
          {topKw.map((t) => (
            <li key={t.name}>
              <span className={styles.barName}>{t.name}</span>
              <span className={styles.barCount}>{t.count}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.card}>
        <h3 className={styles.h}>Top sources</h3>
        <ul className={styles.list}>
          {domains.map((d) => (
            <li key={d.name}>
              <span className={styles.barName}>{d.name}</span>
              <span className={styles.barCount}>{d.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
