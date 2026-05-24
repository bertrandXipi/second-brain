import { useIndex } from '../data/useIndex';
import Kpis from './synthese/Kpis';
import MonthlyBars from './synthese/MonthlyBars';
import Timeline from './synthese/Timeline';

export default function SyntheseView() {
  const state = useIndex();
  if (state.status === 'loading')
    return <div style={{ padding: '3rem', textAlign: 'center' }}>Chargement…</div>;
  if (state.status === 'error')
    return <div style={{ padding: '3rem', textAlign: 'center' }}>Erreur : {state.error.message}</div>;

  return (
    <div>
      <Kpis data={state.data} />
      <MonthlyBars fiches={state.data.fiches} />
      <Timeline digests={state.data.digests} insights={state.data.insights} />
    </div>
  );
}
