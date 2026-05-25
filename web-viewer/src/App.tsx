import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import ListView from './routes/ListView';
import DetailView from './routes/DetailView';
import SyntheseView from './routes/SyntheseView';
import GraphView from './routes/GraphView';

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="main">
        <Routes>
          <Route path="/" element={<ListView />} />
          <Route path="/fiche/:slug" element={<DetailView />} />
          <Route path="/synthese" element={<SyntheseView />} />
          <Route path="/graph" element={<GraphView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
