import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';

const Dashboard = lazy(() => import('./pages/Dashboard'));

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
      </Routes>
    </Router>
  );
}
