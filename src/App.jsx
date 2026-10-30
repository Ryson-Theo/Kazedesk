import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import WorkspaceLoading from './components/WorkspaceLoading';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const NoteWall = lazy(() => import('./pages/NoteWall'));

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={
          <Suspense fallback={<WorkspaceLoading />}>
            <Dashboard />
          </Suspense>
        } />
        <Route path="/wall" element={
          <Suspense fallback={<WorkspaceLoading label="Loading your note wall" />}>
            <NoteWall />
          </Suspense>
        } />
      </Routes>
    </Router>
  );
}
