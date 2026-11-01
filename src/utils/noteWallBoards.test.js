import { beforeEach, describe, expect, it } from 'vitest';
import { storageManager } from './localStorage';

describe('isolated note wall boards', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates separately stored named boards without changing dashboard content', () => {
    storageManager.saveStickyNotes([{ id: 'dashboard-note', title: 'Dashboard note' }]);
    storageManager.saveTasks([{ id: 'dashboard-task', title: 'Dashboard task' }]);
    storageManager.saveNoteWall({ webClips: [{ id: 'dashboard-clip' }] });

    const board = storageManager.createNoteWallBoard('Research');

    expect(board).toMatchObject({
      name: 'Research',
      notes: [],
      tasks: [],
      categories: ['Inbox'],
      taskCategories: ['Inbox'],
      wall: { webClips: [], attachments: [], connections: [] },
    });
    expect(storageManager.getNoteWallBoards()).toEqual([board]);
    expect(storageManager.getStickyNotes()).toEqual([{ id: 'dashboard-note', title: 'Dashboard note' }]);
    expect(storageManager.getTasks()).toEqual([{ id: 'dashboard-task', title: 'Dashboard task' }]);
    expect(storageManager.getNoteWall().webClips).toEqual([{ id: 'dashboard-clip' }]);
  });

  it('saves board content independently, renames boards, and rejects duplicate names', () => {
    const first = storageManager.createNoteWallBoard('Reading');
    const second = storageManager.createNoteWallBoard('Ideas');
    const saved = storageManager.saveNoteWallBoard(first.id, {
      notes: [{ id: 'board-note', title: 'Board only' }],
      tasks: [{ id: 'board-task', title: 'Board task' }],
      wall: { webClips: [{ id: 'board-clip' }] },
    });

    expect(saved).toMatchObject({
      name: 'Reading',
      notes: [{ id: 'board-note', title: 'Board only' }],
      tasks: [{ id: 'board-task', title: 'Board task' }],
      wall: { webClips: [{ id: 'board-clip' }], attachments: [], connections: [] },
    });
    expect(storageManager.updateNoteWallBoard(first.id, { name: 'Planning' }).name).toBe('Planning');
    expect(storageManager.getNoteWallBoard(second.id).name).toBe('Ideas');
    expect(() => storageManager.updateNoteWallBoard(second.id, { name: ' planning ' })).toThrow(/already exists/);
    expect(() => storageManager.createNoteWallBoard('')).toThrow(/Enter a name/);
  });

  it('deletes only the selected board', () => {
    const first = storageManager.createNoteWallBoard('First');
    const second = storageManager.createNoteWallBoard('Second');

    expect(storageManager.deleteNoteWallBoard(first.id)).toBe(true);
    expect(storageManager.deleteNoteWallBoard(first.id)).toBe(false);
    expect(storageManager.getNoteWallBoards().map((board) => board.id)).toEqual([second.id]);
  });
});
