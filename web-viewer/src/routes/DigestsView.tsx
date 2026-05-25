import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useIndex } from '../data/useIndex';
import type { MorningDigest } from '../types';
import styles from './digests/DigestsView.module.css';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function DigestsView() {
  const state = useIndex();
  const [selected, setSelected] = useState<MorningDigest | null>(null);

  if (state.status === 'loading') {
    return <div className={styles.center}>Chargement…</div>;
  }

  if (state.status === 'error') {
    return (
      <div className={styles.center}>
        <p>Erreur de chargement de l'index.</p>
        <pre>{state.error.message}</pre>
      </div>
    );
  }

  const { morningDigests, fiches } = state.data;

  if (selected) {
    const linkedFiches = fiches.filter((f) =>
      selected.linked_fiche_slugs.includes(f.slug),
    );

    return (
      <div className={styles.detailLayout}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => setSelected(null)}
        >
          &larr; Tous les digests
        </button>

        <h1 className={styles.detailDate}>{formatDate(selected.date)}</h1>

        <div
          className={styles.htmlContent}
          dangerouslySetInnerHTML={{ __html: selected.body_html }}
        />

        {linkedFiches.length > 0 && (
          <section className={styles.linkedSection}>
            <h2 className={styles.linkedH}>Fiches du jour ({linkedFiches.length})</h2>
            <ul className={styles.linkedList}>
              {linkedFiches.map((f) => (
                <li key={f.slug}>
                  <Link to={`/fiche/${f.slug}`} className={styles.ficheLink}>
                    {f.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  if (morningDigests.length === 0) {
    return (
      <div className={styles.listLayout}>
        <h2 className={styles.pageTitle}>Digests quotidiens</h2>
        <p className={styles.empty}>Aucun digest quotidien pour l'instant.</p>
      </div>
    );
  }

  return (
    <div className={styles.listLayout}>
      <h2 className={styles.pageTitle}>
        Digests quotidiens ({morningDigests.length})
      </h2>

      <div className={styles.cardGrid}>
        {morningDigests.map((md) => {
          const preview = stripHtml(md.body_html).slice(0, 200);
          return (
            <button
              key={md.slug}
              type="button"
              className={styles.digestCard}
              onClick={() => setSelected(md)}
            >
              <div className={styles.cardDate}>{formatDate(md.date)}</div>
              <div className={styles.cardMeta}>
                <span>{md.sujet_count} sujet{md.sujet_count > 1 ? 's' : ''}</span>
                {md.fiches_count > 0 && (
                  <span> &middot; {md.fiches_count} fiche{md.fiches_count > 1 ? 's' : ''} liée{md.fiches_count > 1 ? 's' : ''}</span>
                )}
              </div>
              {preview && <p className={styles.cardPreview}>{preview}&hellip;</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
