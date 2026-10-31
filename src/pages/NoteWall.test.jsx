import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NoteWall from './NoteWall';
import { storageManager } from '../utils/localStorage';
import * as noteWallMedia from '../utils/noteWallMedia';

vi.mock('../utils/noteWallMedia', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    saveWallAttachment: vi.fn(),
    getWallAttachment: vi.fn(),
    deleteWallAttachment: vi.fn(),
    pruneWallAttachments: vi.fn().mockResolvedValue(undefined),
  };
});

describe('NoteWall', () => {
  beforeEach(() => {
    localStorage.setItem('kazedesk_sticky_notes', JSON.stringify([
      { id: 1, title: 'Idea one', text: 'First thought', category: 'Work', tags: ['planning'] },
      { id: 2, title: 'Idea two', text: 'Second thought', category: 'Inbox', tags: ['personal'] },
    ]));
    localStorage.setItem('kazedesk_note_categories', JSON.stringify(['Inbox', 'Work']));
    localStorage.setItem('kazedesk_tasks', JSON.stringify([]));
    localStorage.setItem('kazedesk-landing-theme', 'dark');
    localStorage.removeItem('kazedesk_note_wall');
  });

  it('filters notes by tag and saves customizable connections', async () => {
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'tag:planning' } });
    expect(screen.getByText('Idea one', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByText('Idea two', { selector: 'strong' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'all' } });
    fireEvent.click(screen.getByText(/Connections/));
    fireEvent.change(screen.getByLabelText('Connection start note'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Connection end note'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Connection color'), { target: { value: '#ff0000' } });
    fireEvent.change(screen.getByLabelText('Connection style'), { target: { value: 'dashed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));

    await waitFor(() => {
      expect(storageManager.getNoteWall().connections).toHaveLength(1);
    });
    expect(storageManager.getNoteWall().connections[0]).toMatchObject({
      from: '1',
      to: '2',
      color: '#ff0000',
      style: 'dashed',
      curved: true,
      fromAnchor: 'right',
    });
  });

  it('uses and updates the landing page theme preference', () => {
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    expect(localStorage.getItem('kazedesk_note_wall_visited')).toBe('true');
    expect(screen.getByRole('main')).toHaveClass('landing-theme-dark');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(screen.getByRole('main')).toHaveClass('landing-theme-light');
    expect(localStorage.getItem('kazedesk-landing-theme')).toBe('light');
  });

  it('uploads an image as a movable wall node, previews it, and removes its stored file', async () => {
    noteWallMedia.saveWallAttachment.mockReset().mockResolvedValue(undefined);
    noteWallMedia.getWallAttachment.mockReset().mockResolvedValue(new Blob(['image bytes'], { type: 'image/png' }));
    noteWallMedia.deleteWallAttachment.mockReset().mockResolvedValue(undefined);
    const createObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:wall-image') });

    try {
      render(<MemoryRouter><NoteWall /></MemoryRouter>);
      const file = new File(['image bytes'], 'preview.png', { type: 'image/png' });
      fireEvent.change(screen.getByLabelText('Choose image, PDF, or audio attachment'), { target: { files: [file] } });

      expect(await screen.findByAltText('preview.png')).toHaveAttribute('src', 'blob:wall-image');
      expect(noteWallMedia.saveWallAttachment).toHaveBeenCalledWith(expect.any(String), file);
      const [attachment] = storageManager.getNoteWall().attachments;
      expect(attachment).toMatchObject({ name: 'preview.png', mimeType: 'image/png', mediaType: 'image', size: file.size });
      expect(storageManager.getNoteWall().positions[attachment.id]).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));

      const startPosition = storageManager.getNoteWall().positions[attachment.id];
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Move attachment preview.png' }), { clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 160, clientY: 140 });
      fireEvent.pointerUp(window, { clientX: 160, clientY: 140 });
      await waitFor(() => expect(storageManager.getNoteWall().positions[attachment.id].x).toBe(startPosition.x + 60));

      const startSize = storageManager.getNoteWall().sizes[attachment.id];
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Resize attachment preview.png' }), { clientX: 300, clientY: 250 });
      fireEvent.pointerMove(window, { clientX: 340, clientY: 280 });
      fireEvent.pointerUp(window, { clientX: 340, clientY: 280 });
      await waitFor(() => expect(storageManager.getNoteWall().sizes[attachment.id]).toMatchObject({ width: startSize.width + 40, height: startSize.height + 30 }));

      fireEvent.click(screen.getByRole('button', { name: 'Remove attachment preview.png' }));
      expect(screen.getByRole('alertdialog')).toHaveTextContent('You can undo this action');
      expect(storageManager.getNoteWall().attachments).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(storageManager.getNoteWall().attachments).toHaveLength(1);

      fireEvent.click(screen.getByRole('button', { name: 'Remove attachment preview.png' }));
      fireEvent.click(screen.getByRole('button', { name: 'Remove attachment', exact: true }));
      await waitFor(() => expect(storageManager.getNoteWall().attachments).toHaveLength(0));
      expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
      expect(noteWallMedia.deleteWallAttachment).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(storageManager.getNoteWall().attachments).toHaveLength(1));
      expect(await screen.findByAltText('preview.png')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
      await waitFor(() => expect(storageManager.getNoteWall().attachments).toHaveLength(0));
    } finally {
      if (createObjectURL) Object.defineProperty(URL, 'createObjectURL', createObjectURL);
      else delete URL.createObjectURL;
    }
  });

  it('reports unsupported attachment files without storing them', async () => {
    noteWallMedia.saveWallAttachment.mockReset().mockResolvedValue(undefined);
    render(<MemoryRouter><NoteWall /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Choose image, PDF, or audio attachment'), {
      target: { files: [new File(['markup'], 'unsafe.svg', { type: 'image/svg+xml' })] },
    });

    expect(await screen.findByText(/Supported files:/)).toBeInTheDocument();
    expect(noteWallMedia.saveWallAttachment).not.toHaveBeenCalled();
    expect(storageManager.getNoteWall().attachments).toHaveLength(0);
  });

  it('renders embedded PDF and audio controls from stored attachment nodes', async () => {
    const attachments = [
      { id: 'pdf-1', name: 'guide.pdf', mimeType: 'application/pdf', mediaType: 'pdf', size: 12, category: 'Inbox' },
      { id: 'audio-1', name: 'clip.mp3', mimeType: 'audio/mpeg', mediaType: 'audio', size: 8, category: 'Inbox' },
    ];
    storageManager.saveNoteWall({
      positions: { 'pdf-1': { x: 30, y: 30 }, 'audio-1': { x: 360, y: 30 } },
      sizes: {},
      taskPositions: {},
      connections: [],
      attachments,
    });
    noteWallMedia.getWallAttachment.mockReset().mockResolvedValue(new Blob(['preview']));
    let urlIndex = 0;
    const createObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:attachment-${urlIndex++}`) });

    try {
      render(<MemoryRouter><NoteWall /></MemoryRouter>);
      expect(await screen.findByTitle('PDF preview: guide.pdf')).toHaveAttribute('src', 'blob:attachment-0');
      expect(await screen.findByLabelText('Play clip.mp3')).toHaveAttribute('controls');
      expect(document.querySelector('[data-node-type="attachment"][data-node-id="audio-1"]')).toBeInTheDocument();
    } finally {
      if (createObjectURL) Object.defineProperty(URL, 'createObjectURL', createObjectURL);
      else delete URL.createObjectURL;
    }
  });

  it('opens the full note content and supports drag-to-connect and resizing', async () => {
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Idea one' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('First thought');
    fireEvent.click(screen.getByRole('button', { name: 'Close note' }));

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => document.querySelector('[data-note-id="2"]')),
    });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Drag from right edge of Idea one to connect' }), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 220, clientY: 180 });
    fireEvent.pointerUp(window, { clientX: 220, clientY: 180 });
    await waitFor(() => expect(storageManager.getNoteWall().connections).toHaveLength(1));

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Resize Idea one' }), { clientX: 250, clientY: 190 });
    fireEvent.pointerMove(window, { clientX: 320, clientY: 250 });
    fireEvent.pointerUp(window, { clientX: 320, clientY: 250 });
    await waitFor(() => expect(storageManager.getNoteWall().sizes['1']).toMatchObject({ width: 320, height: 250 }));
  });

  it('selects and edits connection and card colors and anchors', async () => {
    storageManager.saveNoteWall({
      positions: { 1: { x: 20, y: 20 }, 2: { x: 340, y: 20 } },
      sizes: {},
      connections: [{ id: 'line-1', from: '1', to: '2', color: '#a5b4fc', style: 'dotted', curved: true, fromAnchor: 'right', toAnchor: 'left' }],
    });
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Select connection from Idea one to Idea two' }));
    fireEvent.change(screen.getByLabelText('Selected line color'), { target: { value: '#00aa55' } });
    fireEvent.change(screen.getByLabelText('Selected line end edge'), { target: { value: 'top' } });
    fireEvent.click(screen.getByLabelText('Selected line curved'));
    await waitFor(() => {
      expect(storageManager.getNoteWall().connections[0]).toMatchObject({
        color: '#00aa55',
        toAnchor: 'top',
        curved: false,
      });
      expect(screen.getByLabelText('Selected line start edge')).toHaveValue('right');
    });

    fireEvent.click(screen.getByLabelText('Select Idea one card to change its color'));
    fireEvent.change(screen.getByLabelText('Selected card color'), { target: { value: '#dd8800' } });
    await waitFor(() => expect(storageManager.getStickyNotes()[0].color).toBe('#dd8800'));
  });

  it('saves theme-aware colors for crossing lines and preserves them after manual color edits', async () => {
    storageManager.saveStickyNotes([
      { id: 1, title: 'Idea one', text: 'First thought', category: 'Work', tags: ['planning'] },
      { id: 2, title: 'Idea two', text: 'Second thought', category: 'Inbox', tags: ['personal'] },
      { id: 3, title: 'Idea three', text: 'Third thought', category: 'Work', tags: [] },
      { id: 4, title: 'Idea four', text: 'Fourth thought', category: 'Inbox', tags: [] },
    ]);
    storageManager.saveNoteWall({
      positions: {
        1: { x: 0, y: 145 },
        2: { x: 400, y: 145 },
        3: { x: 200, y: 0 },
        4: { x: 200, y: 300 },
      },
      sizes: {},
      connections: [
        { id: 'horizontal', from: '1', to: '2', color: '#aaaaaa', baseColor: '#aaaaaa', managedColor: true },
        { id: 'vertical', from: '3', to: '4', color: '#aaaaaa', baseColor: '#aaaaaa', managedColor: true, fromAnchor: 'bottom', toAnchor: 'top' },
      ],
    });
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    await waitFor(() => {
      const colors = storageManager.getNoteWall().connections.map((line) => line.color);
      expect(colors[0]).not.toBe(colors[1]);
      expect(colors).not.toContain('#aaaaaa');
    });
    const darkColors = storageManager.getNoteWall().connections.map((line) => line.color);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    await waitFor(() => expect(storageManager.getNoteWall().connections.map((line) => line.color)).not.toEqual(darkColors));

    fireEvent.click(screen.getByRole('button', { name: 'Select connection from Idea one to Idea two' }));
    fireEvent.change(screen.getByLabelText('Selected line color'), { target: { value: '#ff00ff' } });
    await waitFor(() => expect(storageManager.getNoteWall().connections[0]).toMatchObject({
      color: '#ff00ff',
      managedColor: false,
      customColor: true,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    await waitFor(() => expect(storageManager.getNoteWall().connections[0].color).toBe('#ff00ff'));
  });

  it('auto-connects related notes with solid folder and dotted tag lines without duplicates', async () => {
    storageManager.saveStickyNotes([
      { id: 1, title: 'Work planning', category: 'Work', tags: ['planning'] },
      { id: 2, title: 'Work follow-up', category: 'Work', tags: [] },
      { id: 3, title: 'Tagged idea', category: 'Inbox', tags: ['planning'] },
      { id: 4, title: 'Unrelated', category: 'Inbox', tags: ['personal'] },
    ]);
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    fireEvent.click(screen.getByText(/Connections/));
    fireEvent.click(screen.getByRole('button', { name: 'Auto-connect related' }));
    await waitFor(() => expect(storageManager.getNoteWall().connections).toHaveLength(3));
    expect(storageManager.getNoteWall().connections.map((connection) => connection.style)).toContain('solid');
    expect(storageManager.getNoteWall().connections.map((connection) => connection.style)).toContain('dotted');
    fireEvent.click(screen.getByRole('button', { name: 'Auto-connect related' }));
    expect(storageManager.getNoteWall().connections).toHaveLength(3);
  });

  it('tidies overlapping cards while keeping them separated and centered', async () => {
    storageManager.saveNoteWall({ positions: { 1: { x: 100, y: 100 }, 2: { x: 100, y: 100 } }, sizes: {}, connections: [] });
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Tidy & center' }));
    expect(screen.getByRole('dialog', { name: 'Tidy the board?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep lines & tidy' }));
    await waitFor(() => {
      const { positions } = storageManager.getNoteWall();
      const first = positions['1'];
      const second = positions['2'];
      const overlapX = Math.min(first.x + 250 - second.x, second.x + 250 - first.x);
      const overlapY = Math.min(first.y + 190 - second.y, second.y + 190 - first.y);
      expect(overlapX <= 0 || overlapY <= 0).toBe(true);
    });
  });

  it('auto-connects same-folder tasks to notes with dashed folder-colored links and saves task positions', async () => {
    storageManager.saveStickyNotes([
      { id: 11, title: 'Project notes', category: 'Work', tags: [] },
      { id: 12, title: 'Home notes', category: 'Home', tags: [] },
    ]);
    storageManager.saveTasks([
      { id: 21, title: 'Review project', category: 'Work', completed: false, reminder: '2025-01-01T14:30:00.000Z', priority: 'high' },
    ]);
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    expect(screen.getByText('Task · Work')).toBeInTheDocument();
    expect(screen.getByText('Review project')).toBeInTheDocument();
    expect(screen.getByText('Status: Open')).toBeInTheDocument();
    expect(screen.getByText('Priority: High')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Connections/));
    fireEvent.click(screen.getByRole('button', { name: 'Auto-connect related' }));

    await waitFor(() => {
      const wall = storageManager.getNoteWall();
      expect(wall.connections).toHaveLength(1);
      expect(wall.connections[0]).toMatchObject({
        from: '21',
        to: '11',
        fromType: 'task',
        toType: 'note',
        style: 'dashed',
        color: expect.stringMatching(/^#[\da-f]{6}$/i),
      });
      expect(wall.taskPositions['21']).toBeDefined();
    });
  });

  it('can hide Inbox tasks from the board', () => {
    storageManager.saveTasks([
      { id: 71, title: 'Unfiled task', category: 'Inbox', completed: false },
      { id: 72, title: 'Filed task', category: 'Work', completed: false },
    ]);
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    expect(screen.getByLabelText('Task Unfiled task in Inbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide orphan tasks' }));
    expect(screen.queryByLabelText('Task Unfiled task in Inbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Task Filed task in Work')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show orphan tasks' }));
    expect(screen.getByLabelText('Task Unfiled task in Inbox')).toBeInTheDocument();
  });

  it('removes Inbox task links during tidy while keeping eligible existing lines', async () => {
    storageManager.saveTasks([{ id: 81, title: 'Inbox task', category: 'Inbox', completed: false }]);
    storageManager.saveNoteWall({
      positions: { 1: { x: 30, y: 30 }, 2: { x: 400, y: 30 } },
      sizes: {},
      taskPositions: { 81: { x: 700, y: 30 } },
      connections: [
        { id: 'inbox-task-link', from: '81', fromType: 'task', to: '1', toType: 'note', style: 'dashed' },
        { id: 'note-link', from: '1', to: '2', style: 'dotted' },
      ],
    });
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Tidy & center' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep lines & tidy' }));
    await waitFor(() => {
      expect(storageManager.getNoteWall().connections.map((line) => line.id)).toEqual(['note-link']);
    });
  });

  it('undoes and redoes wall edits', async () => {
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    fireEvent.click(screen.getByText(/Connections/));
    fireEvent.change(screen.getByLabelText('Connection start note'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Connection end note'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));
    await waitFor(() => expect(storageManager.getNoteWall().connections).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(storageManager.getNoteWall().connections).toHaveLength(0));
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await waitFor(() => expect(storageManager.getNoteWall().connections).toHaveLength(1));
  });

  it('drag-connects a task to a note using their shared folder color and dashed style', async () => {
    storageManager.saveStickyNotes([{ id: 51, title: 'Matching note', category: 'Work', tags: [] }]);
    storageManager.saveTasks([{ id: 61, title: 'Matching task', category: 'Work', completed: false, priority: 'medium' }]);
    render(<MemoryRouter><NoteWall /></MemoryRouter>);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => document.querySelector('[data-node-id="51"]')),
    });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Connect task Matching task to a note' }), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 220, clientY: 180 });
    fireEvent.pointerUp(window, { clientX: 220, clientY: 180 });

    await waitFor(() => expect(storageManager.getNoteWall().connections[0]).toMatchObject({
      from: '61',
      to: '51',
      fromType: 'task',
      toType: 'note',
      style: 'dashed',
      color: expect.stringMatching(/^#[\da-f]{6}$/i),
    }));
  });

  it('clears connections only after the explicit clear-and-tidy choice', async () => {
    storageManager.saveNoteWall({
      positions: { 1: { x: 30, y: 30 }, 2: { x: 400, y: 30 } },
      sizes: {},
      connections: [{ id: 'saved-line', from: '1', to: '2', style: 'dotted' }],
    });
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Tidy & center' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(storageManager.getNoteWall().connections).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Tidy & center' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear lines & tidy' }));
    await waitFor(() => expect(storageManager.getNoteWall().connections).toHaveLength(0));
  });

  it('tidies into curved relationship lines, aligns folder colors, and confirms local save', async () => {
    storageManager.saveStickyNotes([
      { id: 31, title: 'Work brief', category: 'Work', tags: ['launch'] },
      { id: 32, title: 'Work checklist', category: 'Work', tags: ['launch'] },
      { id: 33, title: 'Launch idea', category: 'Inbox', tags: ['launch'] },
    ]);
    storageManager.saveTasks([
      { id: 41, title: 'Ship release', category: 'Work', completed: false, priority: 'high' },
    ]);
    storageManager.saveNoteWall({
      positions: {
        31: { x: 100, y: 100 },
        32: { x: 100, y: 100 },
        33: { x: 100, y: 100 },
      },
      sizes: {},
      taskPositions: { 41: { x: 100, y: 100 } },
      connections: [],
    });
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Tidy & center' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep lines & tidy' }));
    await waitFor(() => {
      const { connections, positions, taskPositions } = storageManager.getNoteWall();
      expect(connections.map((line) => line.style)).toEqual(expect.arrayContaining(['solid', 'dotted', 'dashed']));
      expect(connections.every((line) => line.curved)).toBe(true);
      const workFolderLine = connections.find((line) => line.from === '31' && line.to === '32');
      const taskFolderLine = connections.find((line) => line.fromType === 'task');
      expect(workFolderLine.color).toBe(taskFolderLine.color);

      const nodes = [
        { x: positions['31'].x, y: positions['31'].y, width: 250, height: 190 },
        { x: positions['32'].x, y: positions['32'].y, width: 250, height: 190 },
        { x: positions['33'].x, y: positions['33'].y, width: 250, height: 190 },
        { x: taskPositions['41'].x, y: taskPositions['41'].y, width: 180, height: 42 },
      ];
      nodes.forEach((node, index) => {
        nodes.slice(index + 1).forEach((other) => {
          const overlapX = node.x < other.x + other.width && other.x < node.x + node.width;
          const overlapY = node.y < other.y + other.height && other.y < node.y + node.height;
          expect(overlapX && overlapY).toBe(false);
        });
      });
    });
    expect(screen.getByText(/Board tidied and saved locally/)).toBeInTheDocument();
  });
});
