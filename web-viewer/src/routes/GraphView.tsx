import { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D from 'react-force-graph-2d';
import { useIndex } from '../data/useIndex';
import { buildGraph, type GraphNode } from './graph/buildGraph';
import styles from './graph/GraphView.module.css';

export default function GraphView() {
  const state = useIndex();
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [maxNodes, setMaxNodes] = useState(120);
  const [minShared, setMinShared] = useState(2);
  const [keyword, setKeyword] = useState('');
  const [hovered, setHovered] = useState<GraphNode | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => {
    if (state.status !== 'ready') return { nodes: [], links: [], isolatedCount: 0 };
    return buildGraph({
      fiches: state.data.fiches,
      keywordFilter: keyword.trim() || undefined,
      minSharedTerms: minShared,
      maxNodes,
    });
  }, [state, maxNodes, minShared, keyword]);

  const allKeywords = state.status === 'ready' ? state.data.facets.keywords.slice(0, 80) : [];

  if (state.status === 'loading')
    return <div style={{ padding: '3rem', textAlign: 'center' }}>Chargement…</div>;
  if (state.status === 'error')
    return <div style={{ padding: '3rem', textAlign: 'center' }}>Erreur : {state.error.message}</div>;

  return (
    <div className={styles.layout}>
      <div className={styles.controls}>
        <h3 className={styles.h}>Connexions</h3>
        <label className={styles.field}>
          <span>Keyword filtre</span>
          <input
            list="kw-list"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="vide = tous"
            className={styles.input}
          />
          <datalist id="kw-list">
            {allKeywords.map((k) => (
              <option key={k.name} value={k.name} />
            ))}
          </datalist>
        </label>
        <label className={styles.field}>
          <span>Max nœuds : {maxNodes}</span>
          <input
            type="range"
            min={20}
            max={300}
            step={10}
            value={maxNodes}
            onChange={(e) => setMaxNodes(Number(e.target.value))}
          />
        </label>
        <label className={styles.field}>
          <span>Min termes partagés : {minShared}</span>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={minShared}
            onChange={(e) => setMinShared(Number(e.target.value))}
          />
        </label>
        <div className={styles.stats}>
          <div>
            <strong>{graph.nodes.length}</strong> nœuds
          </div>
          <div>
            <strong>{graph.links.length}</strong> liens
          </div>
          <div className={styles.muted}>{graph.isolatedCount} isolés</div>
        </div>
        {hovered && (
          <div className={styles.hovered}>
            <div className={styles.hoveredTitle}>{hovered.label}</div>
            <div className={styles.muted}>{hovered.month}</div>
          </div>
        )}
        <p className={styles.help}>
          Survole un nœud pour voir le titre, clique pour ouvrir la fiche. Couleur = mois de capture.
        </p>
      </div>
      <div ref={wrapRef} className={styles.canvas}>
        <ForceGraph2D
          graphData={graph}
          width={size.w}
          height={size.h}
          nodeLabel={(n) => (n as GraphNode).label}
          nodeRelSize={4}
          nodeVal={(n) => (n as GraphNode).size}
          nodeColor={(n) => (n as GraphNode).color}
          linkWidth={(l: { value?: number }) => Math.min(3, (l.value ?? 1) * 0.5)}
          linkColor={() => 'rgba(120,120,140,0.3)'}
          onNodeClick={(n) => navigate(`/fiche/${(n as GraphNode).id}`)}
          onNodeHover={(n) => setHovered((n as GraphNode) ?? null)}
          cooldownTicks={120}
        />
      </div>
    </div>
  );
}
