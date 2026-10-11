import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const NoteWall = lazy(() => import('./pages/NoteWall'));

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={
          <Suspense fallback={<div role="status" aria-live="polite">Loading workspace…</div>}>
            <Dashboard />
          </Suspense>
        } />
        <Route path="/wall" element={
          <Suspense fallback={<div role="status" aria-live="polite">Loading note wall…</div>}>
            <NoteWall />
          </Suspense>
        } />
      </Routes>
    </Router>
  );
}
