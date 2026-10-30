import PipIcon from './PipIcon';
import './WorkspaceLoading.css';

export default function WorkspaceLoading({ label = 'Loading workspace' }) {
  return (
    <div className="workspace-loading" role="status" aria-live="polite">
      <div className="workspace-loading-card">
        <div className="workspace-loading-brand">
          <span className="workspace-loading-mascot">
            <PipIcon size={64} />
          </span>
          <span className="workspace-loading-name">Kazedesk</span>
        </div>
        <div className="workspace-loading-indicator" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="workspace-loading-label">{label}</span>
      </div>
    </div>
  );
}
