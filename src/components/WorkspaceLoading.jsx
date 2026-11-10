import LatticeLoader from './LatticeLoader';
import './WorkspaceLoading.css';

export default function WorkspaceLoading({ label = 'Launching', isDone = false }) {
  return (
    <div className="workspace-loading" aria-busy="true">
      <LatticeLoader
        status={isDone ? 'done' : 'working'}
        label={label}
        doneLabel="Workspace Ready"
        errorLabel="Failed To Load "
        pattern="orbit"
        grid={3}
        shape="round"
        doneColor="#22c55e"
        errorColor="#ef4444"
        cellSize={6}
        gap={2}
        fontSize={14}
        step={90}
        idleOpacity={0.15}
        glow={false}
        glowColor="#b2e3a1"
        showTimer
        color="#95c482"
      />
    </div>
  );
}
