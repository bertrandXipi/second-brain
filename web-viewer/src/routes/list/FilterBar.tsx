import type { FacetCount } from '../../types';
import styles from './FilterBar.module.css';

export interface Filters {
  query: string;
  month: string;          // '' = all
  sourceType: string;     // '' = all
  status: string;         // '' = all
  tag: string;            // '' = all
  sort: 'date_desc' | 'date_asc';
}

interface Props {
  filters: Filters;
  onChange: (next: Filters) => void;
  months: string[];
  sourceTypes: string[];
  statuses: string[];
  tags: FacetCount[];
  totalMatching: number;
  totalAll: number;
}

export default function FilterBar({
  filters,
  onChange,
  months,
  sourceTypes,
  statuses,
  tags,
  totalMatching,
  totalAll,
}: Props) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  return (
    <div className={styles.bar}>
      <input
        type="search"
        placeholder="Rechercher (titre, keywords)…"
        value={filters.query}
        onChange={(e) => set('query', e.target.value)}
        className={styles.search}
      />
      <select
        value={filters.month}
        onChange={(e) => set('month', e.target.value)}
        className={styles.select}
      >
        <option value="">Tous mois</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        value={filters.sourceType}
        onChange={(e) => set('sourceType', e.target.value)}
        className={styles.select}
      >
        <option value="">Toute source</option>
        {sourceTypes.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={filters.tag}
        onChange={(e) => set('tag', e.target.value)}
        className={styles.select}
      >
        <option value="">Tous tags</option>
        {tags.slice(0, 60).map((t) => (
          <option key={t.name} value={t.name}>
            {t.name} ({t.count})
          </option>
        ))}
      </select>
      <select
        value={filters.status}
        onChange={(e) => set('status', e.target.value)}
        className={styles.select}
      >
        <option value="">Tous statuts</option>
        {statuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={filters.sort}
        onChange={(e) => set('sort', e.target.value as Filters['sort'])}
        className={styles.select}
      >
        <option value="date_desc">Date ↓</option>
        <option value="date_asc">Date ↑</option>
      </select>
      <button
        type="button"
        className={styles.reset}
        onClick={() =>
          onChange({ query: '', month: '', sourceType: '', status: '', tag: '', sort: 'date_desc' })
        }
        disabled={
          !filters.query &&
          !filters.month &&
          !filters.sourceType &&
          !filters.status &&
          !filters.tag &&
          filters.sort === 'date_desc'
        }
      >
        Reset
      </button>
      <span className={styles.count}>
        {totalMatching} / {totalAll}
      </span>
    </div>
  );
}
