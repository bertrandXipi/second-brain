import { NavLink } from 'react-router-dom';
import { useIndex } from '../data/useIndex';
import styles from './Header.module.css';

export default function Header() {
  const state = useIndex();
  const counts = state.status === 'ready' ? state.data.counts : null;

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.title}>Second Brain</span>
        <span className={styles.subtitle}>Veille</span>
      </div>
      <nav className={styles.nav}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? styles.active : styles.link)}>
          Liste
        </NavLink>
        <NavLink
          to="/synthese"
          className={({ isActive }) => (isActive ? styles.active : styles.link)}
        >
          Synthèse
        </NavLink>
        <NavLink
          to="/digests"
          className={({ isActive }) => (isActive ? styles.active : styles.link)}
        >
          Digests
        </NavLink>
        <NavLink
          to="/graph"
          className={({ isActive }) => (isActive ? styles.active : styles.link)}
        >
          Graph
        </NavLink>
      </nav>
      {counts && (
        <div className={styles.counts}>
          {counts.fiches} fiches · {counts.digests} digests · {counts.insights} insights · {counts.morningDigests} quotidiens
        </div>
      )}
    </header>
  );
}
