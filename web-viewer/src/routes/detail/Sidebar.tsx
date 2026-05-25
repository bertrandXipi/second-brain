import type { Fiche } from '../../types';
import styles from './Sidebar.module.css';

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

interface Props {
  fiche: Fiche;
}

export default function Sidebar({ fiche }: Props) {
  return (
    <aside className={styles.aside}>
      <section>
        <h4 className={styles.label}>Source</h4>
        <a href={fiche.source_url} target="_blank" rel="noreferrer" className={styles.link}>
          {domain(fiche.source_url)} ↗
        </a>
      </section>

      {fiche.notebooklm_url && (
        <section>
          <h4 className={styles.label}>NotebookLM</h4>
          <a
            href={fiche.notebooklm_url}
            target="_blank"
            rel="noreferrer"
            className={styles.link}
          >
            Ouvrir le notebook ↗
          </a>
        </section>
      )}

      <section>
        <h4 className={styles.label}>Métadonnées</h4>
        <dl className={styles.meta}>
          <dt>Capturée</dt>
          <dd>{fiche.date_captured.slice(0, 16).replace('T', ' ')}</dd>
          {fiche.date_processed && (
            <>
              <dt>Traitée</dt>
              <dd>{fiche.date_processed.slice(0, 16).replace('T', ' ')}</dd>
            </>
          )}
          <dt>Source</dt>
          <dd>{fiche.source_type}</dd>
          <dt>Statut</dt>
          <dd>{fiche.status}</dd>
          {fiche.language && (
            <>
              <dt>Langue</dt>
              <dd>{fiche.language}</dd>
            </>
          )}
          <dt>Mots</dt>
          <dd>{fiche.word_count}</dd>
          <dt>Mois</dt>
          <dd>{fiche.month}</dd>
        </dl>
      </section>

      {fiche.keywords.length > 0 && (
        <section>
          <h4 className={styles.label}>Keywords</h4>
          <ul className={styles.chips}>
            {fiche.keywords.map((k) => (
              <li key={k} className={styles.chip}>
                {k}
              </li>
            ))}
          </ul>
        </section>
      )}

      {fiche.tags.length > 0 && (
        <section>
          <h4 className={styles.label}>Tags</h4>
          <ul className={styles.chips}>
            {fiche.tags.map((t) => (
              <li key={t} className={`${styles.chip} ${styles.tag}`}>
                #{t}
              </li>
            ))}
          </ul>
        </section>
      )}

      {fiche.discord_message_url && (
        <section>
          <h4 className={styles.label}>Origine</h4>
          <a
            href={fiche.discord_message_url}
            target="_blank"
            rel="noreferrer"
            className={styles.link}
          >
            Message Discord ↗
          </a>
        </section>
      )}
    </aside>
  );
}
