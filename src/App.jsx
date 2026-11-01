import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import WorkspaceLoading from './components/WorkspaceLoading';
import { storageManager } from './utils/localStorage';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const NoteWall = lazy(() => import('./pages/NoteWall'));
const NoteWallBoards = lazy(() => import('./pages/NoteWallBoards'));

function IndependentBoardRoute() {
  const { boardId } = useParams();
  if (!storageManager.getNoteWallBoard(boardId)) return <Navigate to="/wall/boards" replace />;
  return (
    <Suspense fallback={<WorkspaceLoading label="Loading your note wall" />}>
      <NoteWall key={boardId} boardId={boardId} />
    </Suspense>
  );
}

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
        <Route path="/wall/boards" element={
          <Suspense fallback={<WorkspaceLoading label="Loading your boards" />}>
            <NoteWallBoards />
          </Suspense>
        } />
        <Route path="/wall/boards/:boardId" element={<IndependentBoardRoute />} />
        <Route path="/wall" element={
          <Suspense fallback={<WorkspaceLoading label="Loading your note wall" />}>
            <NoteWall />
          </Suspense>
        } />
      </Routes>
    </Router>
  );
}
