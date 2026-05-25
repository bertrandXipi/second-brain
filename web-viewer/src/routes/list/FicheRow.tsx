import { Link } from 'react-router-dom';
import type { Fiche } from '../../types';
import styles from './FicheRow.module.css';

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

interface Props {
  fiche: Fiche;
}

export default function FicheRow({ fiche }: Props) {
  return (
    <article className={styles.row}>
      <div className={styles.meta}>
        <time className={styles.date}>{fmtDate(fiche.date_captured)}</time>
        <span className={styles.badge}>{fiche.source_type}</span>
        <span className={styles.domain}>{domain(fiche.source_url)}</span>
      </div>
      <h3 className={styles.title}>
        <Link to={`/fiche/${fiche.slug}`}>{fiche.title}</Link>
      </h3>
      {fiche.body_excerpt && <p className={styles.excerpt}>{fiche.body_excerpt}…</p>}
      <div className={styles.chips}>
        {fiche.keywords.slice(0, 5).map((k) => (
          <span key={k} className={styles.chip}>
            {k}
          </span>
        ))}
        {fiche.tags.slice(0, 4).map((t) => (
          <span key={t} className={`${styles.chip} ${styles.tag}`}>
            #{t}
          </span>
        ))}
      </div>
    </article>
  );
}
