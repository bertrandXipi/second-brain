import { useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useIndex } from '../data/useIndex';
import type { Fiche } from '../types';
import FilterBar, { type Filters } from './list/FilterBar';
import FicheRow from './list/FicheRow';
import styles from './list/ListView.module.css';

const EMPTY_FILTERS: Filters = {
  query: '',
  month: '',
  sourceType: '',
  status: '',
  tag: '',
  sort: 'date_desc',
};

export default function ListView() {
  const state = useIndex();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const parentRef = useRef<HTMLDivElement>(null);

  const fiches = state.status === 'ready' ? state.data.fiches : [];

  const fuse = useMemo(
    () =>
      new Fuse(fiches, {
        keys: [
          { name: 'title', weight: 0.6 },
          { name: 'keywords', weight: 0.3 },
          { name: 'tags', weight: 0.1 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [fiches],
  );

  const filtered: Fiche[] = useMemo(() => {
    let list = fiches;
    if (filters.query.trim()) {
      list = fuse.search(filters.query.trim()).map((r) => r.item);
    }
    if (filters.month) list = list.filter((f) => f.month === filters.month);
    if (filters.sourceType) list = list.filter((f) => f.source_type === filters.sourceType);
    if (filters.status) list = list.filter((f) => f.status === filters.status);
    if (filters.tag) list = list.filter((f) => f.tags.includes(filters.tag));
    list = [...list].sort((a, b) => {
      const cmp = a.date_captured < b.date_captured ? -1 : a.date_captured > b.date_captured ? 1 : 0;
      return filters.sort === 'date_desc' ? -cmp : cmp;
    });
    return list;
  }, [fiches, fuse, filters]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 160,
    overscan: 6,
  });

  if (state.status === 'loading') return <div className={styles.center}>Chargement…</div>;
  if (state.status === 'error')
    return (
      <div className={styles.center}>
        <p>Erreur de chargement de l'index.</p>
        <pre>{state.error.message}</pre>
      </div>
    );

  return (
    <div className={styles.wrap}>
      <FilterBar
        filters={filters}
        onChange={setFilters}
        months={state.data.facets.months}
        sourceTypes={state.data.facets.source_types}
        statuses={state.data.facets.statuses}
        tags={state.data.facets.tags}
        totalMatching={filtered.length}
        totalAll={fiches.length}
      />
      <div ref={parentRef} className={styles.scroll}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>Aucune fiche ne correspond.</div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const fiche = filtered[vi.index];
              return (
                <div
                  key={fiche.slug}
                  ref={virtualizer.measureElement}
                  data-index={vi.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <FicheRow fiche={fiche} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
