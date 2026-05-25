import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import type { Digest, Insight } from '../../types';
import styles from './Timeline.module.css';

type Entry =
  | { kind: 'digest'; week: number; year: number; data: Digest }
  | { kind: 'insight'; week: number; year: number; data: Insight };

function mergeSort(digests: Digest[], insights: Insight[]): Entry[] {
  const all: Entry[] = [
    ...digests.map((d): Entry => ({ kind: 'digest', week: d.week, year: d.year, data: d })),
    ...insights.map((i): Entry => ({ kind: 'insight', week: i.week, year: i.year, data: i })),
  ];
  return all.sort((a, b) => (a.year !== b.year ? b.year - a.year : b.week - a.week));
}

interface Props {
  digests: Digest[];
  insights: Insight[];
}

export default function Timeline({ digests, insights }: Props) {
  const entries = mergeSort(digests, insights);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  return (
    <section className={styles.section}>
      <h3 className={styles.h}>Timeline hebdomadaire</h3>
      {entries.length === 0 && (
        <p className={styles.empty}>Aucun digest ni insight pour l'instant.</p>
      )}
      <ol className={styles.timeline}>
        {entries.map((e) => {
          const key = `${e.kind}:${e.data.slug}`;
          const open = openSlug === key;
          return (
            <li
              key={key}
              className={`${styles.item} ${e.kind === 'insight' ? styles.insight : styles.digest}`}
            >
              <button
                type="button"
                className={styles.header}
                onClick={() => setOpenSlug(open ? null : key)}
              >
                <span className={styles.weekTag}>
                  {e.year}-W{String(e.week).padStart(2, '0')}
                </span>
                <span className={styles.kindTag}>{e.kind}</span>
                <span className={styles.title}>
                  {e.kind === 'digest'
                    ? `Digest semaine ${e.week} — ${e.data.fiches_count} fiches`
                    : `Insight semaine ${e.week}${e.data.focus ? ` — ${e.data.focus}` : ''}`}
                </span>
                <span className={styles.chev}>{open ? '−' : '+'}</span>
              </button>
              {open && (
                <div className={styles.body}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {e.data.body_markdown}
                  </ReactMarkdown>
                  {e.kind === 'digest' && e.data.linked_fiche_slugs.length > 0 && (
                    <div className={styles.linked}>
                      <h5 className={styles.linkedH}>
                        Fiches liées ({e.data.linked_fiche_slugs.length})
                      </h5>
                      <ul className={styles.linkedList}>
                        {e.data.linked_fiche_slugs.slice(0, 30).map((s) => (
                          <li key={s}>
                            <Link to={`/fiche/${s}`}>{s}</Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
