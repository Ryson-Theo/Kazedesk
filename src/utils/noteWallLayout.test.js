import { describe, expect, it } from 'vitest';
import { tidyWallLayout } from './noteWallLayout';

describe('tidyWallLayout', () => {
  it('separates overlapping cards and routes curves toward each other', () => {
    const notes = [{ id: 1 }, { id: 2 }];
    const layout = tidyWallLayout(notes, {
      positions: { 1: { x: 100, y: 100 }, 2: { x: 100, y: 100 } },
      sizes: {},
      connections: [{ id: 'line', from: '1', to: '2', color: '#fff' }],
    });
    const first = layout.positions['1'];
    const second = layout.positions['2'];
    const overlapsX = first.x < second.x + 250 && second.x < first.x + 250;
    const overlapsY = first.y < second.y + 190 && second.y < first.y + 190;

    expect(overlapsX && overlapsY).toBe(false);
    expect(layout.connections[0]).toMatchObject({
      fromAnchor: 'bottom',
      toAnchor: 'top',
      curved: true,
      color: '#fff',
    });
  });

  it('keeps separated card positions and existing line styles', () => {
    const notes = [{ id: 1 }, { id: 2 }];
    const wall = {
      positions: { 1: { x: 10, y: 10 }, 2: { x: 500, y: 10 } },
      sizes: {},
      connections: [{ id: 'line', from: '1', to: '2', style: 'dotted', curved: false }],
    };

    const result = tidyWallLayout(notes, wall);

    expect(result.positions).toEqual(wall.positions);
    expect(result.connections[0]).toMatchObject({ style: 'dotted', curved: true });
  });

  it('clears a dense cluster of overlapping cards', () => {
    const notes = Array.from({ length: 5 }, (_, id) => ({ id }));
    const positions = Object.fromEntries(notes.map((note) => [note.id, { x: 0, y: 0 }]));
    const result = tidyWallLayout(notes, { positions, sizes: {}, connections: [] });

    for (let first = 0; first < notes.length; first += 1) {
      for (let second = first + 1; second < notes.length; second += 1) {
        const firstPosition = result.positions[notes[first].id];
        const secondPosition = result.positions[notes[second].id];
        const overlapsX = firstPosition.x < secondPosition.x + 250 && secondPosition.x < firstPosition.x + 250;
        const overlapsY = firstPosition.y < secondPosition.y + 190 && secondPosition.y < firstPosition.y + 190;
        expect(overlapsX && overlapsY).toBe(false);
      }
    }
  });

  it('tidies task and note nodes together and keeps typed connection endpoints', () => {
    const notes = [{ id: 'note-1' }];
    const tasks = [{ id: 'task-1', type: 'task', wallKey: 'task:task-1' }];
    const result = tidyWallLayout(notes, {
      positions: { 'note-1': { x: 100, y: 100 } },
      taskPositions: { 'task-1': { x: 100, y: 100 } },
      sizes: {},
      connections: [{ id: 'task-link', from: 'task-1', fromType: 'task', to: 'note-1', toType: 'note', style: 'dashed' }],
    }, tasks);

    expect(result.taskPositions['task-1']).toBeDefined();
    expect(result.positions['note-1']).toBeDefined();
    expect(result.connections[0]).toMatchObject({
      from: 'task-1',
      fromType: 'task',
      to: 'note-1',
      toType: 'note',
      style: 'dashed',
      curved: true,
    });
    expect(result.taskPositions['task-1']).not.toEqual(result.positions['note-1']);
  });
});
