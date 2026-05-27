import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useIndex } from '../data/useIndex';
import Sidebar from './detail/Sidebar';
import styles from './detail/DetailView.module.css';

export default function DetailView() {
  const { slug = '' } = useParams<{ slug: string }>();
  const state = useIndex();

  const { fiche, prev, next } = useMemo(() => {
    if (state.status !== 'ready') return { fiche: null, prev: null, next: null };
    const fiches = state.data.fiches;
    const idx = fiches.findIndex((f) => f.slug === slug);
    if (idx < 0) return { fiche: null, prev: null, next: null };
    return {
      fiche: fiches[idx],
      prev: idx > 0 ? fiches[idx - 1] : null,
      next: idx < fiches.length - 1 ? fiches[idx + 1] : null,
    };
  }, [state, slug]);

  if (state.status === 'loading') return <div className={styles.center}>Chargement…</div>;
  if (state.status === 'error')
    return <div className={styles.center}>Erreur : {state.error.message}</div>;
  if (!fiche)
    return (
      <div className={styles.center}>
        <p>Fiche introuvable : <code>{slug}</code></p>
        <p>
          <Link to="/">← Retour à la liste</Link>
        </p>
      </div>
    );

  return (
    <article className={styles.layout}>
      <div className={styles.content}>
        <div className={styles.breadcrumb}>
          <Link to="/">← Liste</Link>
          <span className={styles.month}>{fiche.month}</span>
        </div>
        <h1 className={styles.title}>{fiche.title}</h1>
        <div className={styles.markdown}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{fiche.body_markdown}</ReactMarkdown>
        </div>
        <nav className={styles.nav}>
          {prev ? (
            <Link to={`/fiche/${prev.slug}`} className={styles.navItem}>
              <span className={styles.navDir}>← Précédent</span>
              <span className={styles.navTitle}>{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link to={`/fiche/${next.slug}`} className={`${styles.navItem} ${styles.navRight}`}>
              <span className={styles.navDir}>Suivant →</span>
              <span className={styles.navTitle}>{next.title}</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
      <Sidebar fiche={fiche} fiches={state.data.fiches} />
    </article>
  );
}
