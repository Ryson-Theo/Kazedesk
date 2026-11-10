import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WorkspaceLoading from './WorkspaceLoading';

describe('WorkspaceLoading', () => {
  it('uses the lattice loader as the entire workspace loading screen', () => {
    render(<WorkspaceLoading />);

    expect(screen.getByRole('status')).toHaveClass('lattice-loader');
    expect(screen.getByText('Launching')).toBeInTheDocument();
    expect(document.querySelector('.workspace-loading-mascot')).toBeNull();
    expect(document.querySelector('.workspace-loading-card')).toBeNull();
    expect(document.querySelector('.workspace-loading-brand')).toBeNull();
    expect(document.querySelector('.lattice-loader__run')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'working');
  });

  it('shows the completion state when the workspace is ready', () => {
    render(<WorkspaceLoading isDone />);

    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'done');
    expect(screen.getByText('Workspace Ready')).toBeInTheDocument();
  });
});
