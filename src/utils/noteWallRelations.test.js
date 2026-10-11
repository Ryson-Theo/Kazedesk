import { describe, expect, it } from 'vitest';
import { addRelatedWallConnections } from './noteWallRelations';

describe('addRelatedWallConnections', () => {
  it('creates solid folder, dotted tag, and dashed task links with shared folder colors', () => {
    const notes = [
      { id: 'work-1', category: 'Work', tags: ['planning'] },
      { id: 'work-2', category: 'Work', tags: ['planning'] },
      { id: 'idea', category: 'Inbox', tags: ['planning'] },
    ];
    const tasks = [{ id: 'task', category: 'Work' }];
    const connections = addRelatedWallConnections(notes, tasks, []);

    const folderNoteLine = connections.find((line) => line.from === 'work-1' && line.to === 'work-2');
    const sharedTagLine = connections.find((line) => line.from === 'work-1' && line.to === 'idea');
    const taskLine = connections.find((line) => line.fromType === 'task');

    expect(folderNoteLine).toMatchObject({ style: 'solid', color: taskLine.color, curved: true });
    expect(sharedTagLine).toMatchObject({ style: 'dotted', curved: true });
    expect(taskLine).toMatchObject({ fromType: 'task', toType: 'note', style: 'dashed', curved: true });
  });

  it('keeps customized existing lines and does not add duplicate relations', () => {
    const notes = [
      { id: 1, category: 'Work', tags: [] },
      { id: 2, category: 'Work', tags: [] },
    ];
    const customLine = { id: 'custom', from: '2', to: '1', color: '#ff0000', style: 'dotted', curved: false };

    const connections = addRelatedWallConnections(notes, [], [customLine]);

    expect(connections).toEqual([customLine]);
  });

  it('does not auto-connect tasks in Inbox or tasks without a custom folder', () => {
    const notes = [{ id: 'inbox-note', category: 'Inbox', tags: [] }];
    const tasks = [
      { id: 'inbox-task', category: 'Inbox' },
      { id: 'uncategorized-task' },
    ];

    expect(addRelatedWallConnections(notes, tasks, [])).toEqual([]);
  });
});
