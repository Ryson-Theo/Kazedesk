import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import NoteWallBoards from './NoteWallBoards';
import { storageManager } from '../utils/localStorage';

function CurrentPath() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

describe('NoteWallBoards', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates a named independent board and opens it', async () => {
    render(
      <MemoryRouter initialEntries={['/wall/boards']}>
        <NoteWallBoards />
        <CurrentPath />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Create a new board'), { target: { value: 'Project research' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create board' }));

    await waitFor(() => {
      const [board] = storageManager.getNoteWallBoards();
      expect(board.name).toBe('Project research');
      expect(screen.getByLabelText('Current path')).toHaveTextContent(`/wall/boards/${board.id}`);
    });
  });

  it('renames boards and requires confirmation before deleting them', () => {
    const board = storageManager.createNoteWallBoard('Ideas');
    render(<MemoryRouter><NoteWallBoards /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Rename Ideas' }));
    fireEvent.change(screen.getByLabelText('Board name'), { target: { value: 'Plans' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('heading', { name: 'Plans' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Plans' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Your dashboard and other boards are not affected.');
    expect(storageManager.getNoteWallBoard(board.id)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete board' }));
    expect(storageManager.getNoteWallBoard(board.id)).toBeNull();
  });
});
