import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NoteWallBoards from './NoteWallBoards';
import { storageManager } from '../utils/localStorage';
import { createNoteWallBackupArchive } from '../utils/noteWallBackup';
import * as noteWallMedia from '../utils/noteWallMedia';

vi.mock('../utils/noteWallMedia', async (importOriginal) => ({
  ...(await importOriginal()),
  getWallAttachment: vi.fn(),
  saveWallAttachments: vi.fn().mockResolvedValue(undefined),
}));

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

  it('imports a board backup using its exported board name and content', async () => {
    const backup = await createNoteWallBackupArchive({
      boardId: 'old-board-id',
      boardName: 'Research board',
      notes: [{ id: 'note-1', title: 'Sources', text: 'Keep these sources' }],
      categories: ['Inbox', 'Research'],
      tasks: [{ id: 'task-1', title: 'Review sources', completed: false }],
      taskCategories: ['Inbox', 'Research'],
      wall: { positions: { 'note-1': { x: 120, y: 80 } }, attachments: [] },
    });
    render(
      <MemoryRouter initialEntries={['/wall/boards']}>
        <NoteWallBoards />
        <CurrentPath />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Choose board backup JSON or ZIP'), {
      target: {
        files: [new File([backup.blob], backup.filename, { type: 'application/zip' })],
      },
    });

    await waitFor(() => {
      const [board] = storageManager.getNoteWallBoards();
      expect(board).toMatchObject({
        name: 'Research board',
        notes: [{ id: 'note-1', title: 'Sources', text: 'Keep these sources' }],
        categories: ['Inbox', 'Research'],
        tasks: [{ id: 'task-1', title: 'Review sources', completed: false }],
        wall: { positions: { 'note-1': { x: 120, y: 80 } } },
      });
      expect(screen.getByLabelText('Current path')).toHaveTextContent(`/wall/boards/${board.id}`);
    });
  });

  it('imports board JSON by resolving referenced media from browser storage', async () => {
    noteWallMedia.getWallAttachment.mockResolvedValue(new Blob(['saved image'], { type: 'image/png' }));
    const data = {
      app: 'Kazedesk',
      type: 'sticky-note-wall',
      context: 'board',
      version: 2,
      boardId: 'original-board',
      boardName: 'Local media board',
      notes: [{ id: 'note-1', title: 'Image notes' }],
      categories: ['Inbox'],
      tasks: [],
      taskCategories: ['Inbox'],
      wall: {
        attachments: [{
          id: 'saved-image-id',
          name: 'diagram.png',
          mimeType: 'image/png',
          mediaType: 'image',
        }],
        positions: { 'saved-image-id': { x: 15, y: 25 } },
      },
    };
    render(
      <MemoryRouter initialEntries={['/wall/boards']}>
        <NoteWallBoards />
        <CurrentPath />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Choose board backup JSON or ZIP'), {
      target: {
        files: [new File([JSON.stringify(data)], 'board.json', { type: 'application/json' })],
      },
    });

    await waitFor(() => {
      const [board] = storageManager.getNoteWallBoards();
      const newAttachmentId = board.wall.attachments[0].id;
      expect(newAttachmentId).not.toBe('saved-image-id');
      expect(board.wall.positions).toHaveProperty(newAttachmentId);
      expect(noteWallMedia.getWallAttachment).toHaveBeenCalledWith('saved-image-id');
      expect(noteWallMedia.saveWallAttachments).toHaveBeenCalledWith([{
        id: newAttachmentId,
        blob: expect.any(Blob),
      }]);
      expect(screen.getByLabelText('Current path')).toHaveTextContent(`/wall/boards/${board.id}`);
    });
  });
});
