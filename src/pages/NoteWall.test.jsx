import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NoteWall from './NoteWall';
import { storageManager } from '../utils/localStorage';
import * as noteWallMedia from '../utils/noteWallMedia';
import { encodeWebClipPayload } from '../utils/noteWallWebClipper';

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

  it('shows compact accessible board stats and groups secondary toolbar actions', async () => {
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toBeInTheDocument();
    expect(screen.getByLabelText('2 notes')).toBeInTheDocument();
    expect(screen.getByLabelText('0 tasks')).toBeInTheDocument();
    expect(await screen.findByRole('status', { name: 'Changes saved locally' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Add items'));
    expect(screen.getByRole('button', { name: 'Add attachment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Web clipper' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Export', { selector: 'summary' }));
    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print / PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Markdown' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save to Drive' })).toBeInTheDocument();
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

  it('keeps discussion threads separate from note, task, and attachment content', async () => {
    storageManager.saveTasks([{ id: 7, title: 'Review draft', category: 'Work' }]);
    storageManager.saveNoteWall({
      positions: { 'file-1': { x: 360, y: 30 } },
      sizes: {},
      taskPositions: {},
      connections: [],
      attachments: [{ id: 'file-1', name: 'reference.pdf', mimeType: 'application/pdf', mediaType: 'pdf', size: 12 }],
    });

    noteWallMedia.getWallAttachment.mockReset().mockResolvedValue(new Blob(['pdf']));
    const createObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:thread-pdf') });

    try {
      render(<MemoryRouter><NoteWall /></MemoryRouter>);
      const addComment = async (label, text) => {
        fireEvent.click(await screen.findByRole('button', { name: label }));
        fireEvent.change(screen.getByLabelText('Add a comment'), { target: { value: text } });
        fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));
        await waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Close comments' }));
      };

      await addComment('Open comments for Idea one (0)', 'Keep brainstorming here.');
      await addComment('Open comments for Review draft (0)', 'Check the latest copy.');
      await addComment('Open comments for reference.pdf (0)', 'This PDF has the relevant example.');

      const savedWall = storageManager.getNoteWall();
      expect(savedWall.comments['note:1'][0]).toMatchObject({ author: 'You', text: 'Keep brainstorming here.' });
      expect(savedWall.comments['task:7'][0].text).toBe('Check the latest copy.');
      expect(savedWall.comments['attachment:file-1'][0].text).toBe('This PDF has the relevant example.');
      expect(savedWall.comments['note:2']).toBeUndefined();
      expect(screen.getByText('First thought')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Open comments for Idea one (1)' }));
      expect(screen.getByText('Keep brainstorming here.')).toBeInTheDocument();
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

  it('imports bookmarklet metadata as a saved, connected-ready web clip node', async () => {
    const metadata = {
      url: 'https://example.com/articles/focus',
      title: 'Focus & Flow',
      description: 'A practical guide.',
      siteName: 'Example Journal',
      image: 'https://example.com/images/focus.jpg',
      author: 'A. Writer',
      publishedAt: '2026-10-31',
    };
    const payload = encodeWebClipPayload(metadata);
    window.history.replaceState({}, '', `/?kazedesk_clip=${payload}`);

    render(<MemoryRouter><NoteWall /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Focus & Flow' })).toHaveAttribute('href', metadata.url);
    expect(screen.getByText('A practical guide.')).toBeInTheDocument();
    expect(screen.getByText(/Example Journal/)).toBeInTheDocument();
    await waitFor(() => {
      const { webClips, positions, sizes } = storageManager.getNoteWall();
      expect(webClips).toHaveLength(1);
      expect(webClips[0]).toMatchObject(metadata);
      expect(positions[webClips[0].id]).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
      expect(sizes[webClips[0].id]).toEqual({ width: 190, height: 68 });
    });
    expect(window.location.search).toBe('');
    expect(screen.getByRole('button', { name: 'Open comments for Focus & Flow (0)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open comments for Focus & Flow (0)' }));
    fireEvent.change(screen.getByLabelText('Add a comment'), { target: { value: 'Save this for the next review.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));
    await waitFor(() => expect(storageManager.getNoteWall().comments[`webclip:${storageManager.getNoteWall().webClips[0].id}`][0].text).toBe('Save this for the next review.'));
    window.history.replaceState({}, '', '/');
  });

  it('pins a URL as a movable web clip card using its website name by default', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(<MemoryRouter><NoteWall /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.change(screen.getByLabelText('Page URL'), { target: { value: 'https://example.com/reading-list' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pin link' }));

    await waitFor(() => {
      expect(document.querySelector('[data-node-type="webclip"] a[href="https://example.com/reading-list"]')).toBeInTheDocument();
    });
    expect(screen.queryByRole('dialog', { name: 'Pin a link to the wall' })).not.toBeInTheDocument();
    await waitFor(() => {
      const { webClips, positions, sizes } = storageManager.getNoteWall();
      expect(webClips).toHaveLength(1);
      expect(webClips[0]).toMatchObject({
        url: 'https://example.com/reading-list',
        title: 'example.com',
        siteName: 'example.com',
        category: 'Inbox',
        compact: true,
      });
      expect(positions[webClips[0].id]).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
      expect(sizes[webClips[0].id]).toEqual({ width: 190, height: 68 });
    });
    expect(screen.getByRole('button', { name: 'Drag from right edge of example.com to connect' })).toBeInTheDocument();
    const clipCard = document.querySelector('[data-node-type="webclip"]');
    expect(clipCard).toHaveClass('is-compact');
    const clipToolbar = document.querySelector('.note-wall-webclip-toolbar');
    expect(clipToolbar.querySelector('.note-wall-webclip-move svg')).toBeInTheDocument();
    expect(clipToolbar.querySelector('.note-wall-webclip-kind')).toHaveTextContent('WEB CLIP');
    expect(clipToolbar.querySelector('.note-wall-webclip-pin-menu')).toBeInTheDocument();
    expect(clipToolbar.querySelector('.note-wall-link-actions-menu')).toBeInTheDocument();
    expect(clipCard.querySelector('.note-wall-webclip-title')).toHaveTextContent('example.com');
    expect(clipCard.querySelector('.note-wall-webclip-site-name')).toBeNull();
    expect(clipCard.querySelector('.note-wall-webclip-title').parentElement).toBe(clipCard);
    expect(clipCard.querySelector('.note-wall-webclip-preview')).toContainElement(
      clipCard.querySelector('.note-wall-webclip-preview-title'),
    );
    expect(clipCard.style.getPropertyValue('--note-wall-clip-height')).toBe('68px');
    expect(document.querySelector('.note-wall-attachment-status')).toHaveTextContent('Page metadata unavailable');
  });

  it('pins external clips to a note, keeps the deck attached while moving the note, and unpins them in place', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const board = storageManager.createNoteWallBoard('Anchored links');
    storageManager.saveNoteWallBoard(board.id, {
      notes: [{ id: 'anchor-note', title: 'Anchor note', text: 'Keep this close.', category: 'Inbox', markdown: true }],
      wall: { positions: { 'anchor-note': { x: 100, y: 80 } } },
    });
    render(<MemoryRouter><NoteWall boardId={board.id} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.change(screen.getByLabelText('Page URL'), { target: { value: 'https://example.com/article' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pin link' }));

    await waitFor(() => expect(document.querySelector('[data-node-type="webclip"]')).toBeInTheDocument());
    const clip = storageManager.getNoteWallBoard(board.id).wall.webClips[0];
    fireEvent.click(screen.getByRole('button', { name: 'Pin example.com to a note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pin to Anchor note' }));

    await waitFor(() => {
      const savedWall = storageManager.getNoteWallBoard(board.id).wall;
      expect(savedWall.webClips[0].attachedTo).toBe('anchor-note');
      expect(savedWall.webClips[0].anchorOffset).toEqual({ x: expect.any(Number), y: expect.any(Number) });
      expect(document.querySelector('.note-wall-card [data-node-type="webclip"]')).toBeInTheDocument();
    });
    const attachedClip = document.querySelector('.note-wall-webclip.is-attached');
    const attachedNote = document.querySelector('.note-wall-card');
    const clipHeader = attachedClip.querySelector('.note-wall-webclip-toolbar');
    expect(clipHeader.querySelector('.note-wall-webclip-move svg')).toBeInTheDocument();
    expect(clipHeader.querySelector('.note-wall-webclip-kind')).toHaveTextContent('PINNED');
    expect(attachedClip.querySelector('.note-wall-webclip-title')).toHaveTextContent('example.com');
    expect(attachedClip.querySelector('.note-wall-webclip-toolbar .note-wall-webclip-pin-menu')).toBeInTheDocument();
    expect(attachedClip.querySelector('.note-wall-webclip-toolbar')).not.toContainElement(attachedClip.querySelector('.note-wall-webclip-preview'));
    expect(attachedClip.querySelector('.note-wall-webclip-preview-title')).toHaveTextContent('example.com');
    expect(attachedClip.querySelector('.note-wall-webclip-title').parentElement).toBe(attachedClip);

    const clipStart = storageManager.getNoteWallBoard(board.id).wall.positions[clip.id];
    fireEvent.mouseEnter(attachedClip);
    expect(attachedClip.style.getPropertyValue('--note-wall-clip-height')).toBe('68px');
    expect(attachedNote.style.height).toBe('190px');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move Anchor note' }), { clientX: 110, clientY: 90 });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 120 });
    fireEvent.pointerUp(window, { clientX: 150, clientY: 120 });
    await waitFor(() => {
      const savedWall = storageManager.getNoteWallBoard(board.id).wall;
      expect(savedWall.positions[clip.id]).toEqual({ x: clipStart.x + 40, y: clipStart.y + 30 });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Move or unpin example.com from note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unpin from note' }));
    await waitFor(() => expect(storageManager.getNoteWallBoard(board.id).wall.webClips[0]).not.toHaveProperty('attachedTo'));
    expect(storageManager.getNoteWallBoard(board.id).wall.positions[clip.id]).toEqual({ x: clipStart.x + 40, y: clipStart.y + 30 });
  });

  it('automatically pins Markdown links as draggable paperclip cards beside their note', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const board = storageManager.createNoteWallBoard('Internal links');
    storageManager.saveNoteWallBoard(board.id, {
      notes: [{ id: 'markdown-note', title: 'Markdown note', text: '[Read this](https://example.com/article)', category: 'Inbox', markdown: true }],
      wall: { positions: { 'markdown-note': { x: 100, y: 80 } } },
    });
    render(<MemoryRouter><NoteWall boardId={board.id} /></MemoryRouter>);

    await waitFor(() => {
      const pinnedLink = storageManager.getNoteWallBoard(board.id).notes[0].pinnedLinks[0];
      expect(pinnedLink).toMatchObject({
        url: 'https://example.com/article',
        label: 'Read this',
        anchorOffset: { x: expect.any(Number), y: expect.any(Number) },
      });
      expect(storageManager.getNoteWallBoard(board.id).notes[0].text).toContain('[Read this](https://example.com/article)');
      expect(screen.getByRole('article', { name: 'Pinned note link: Read this' })).toBeInTheDocument();
    });

    const card = screen.getByRole('article', { name: 'Pinned note link: Read this' });
    const noteCard = document.querySelector('[data-note-id="markdown-note"].note-wall-card');
    expect(card.parentElement).toHaveClass('note-wall-board');
    expect(noteCard).not.toContainElement(card);
    const originalOffset = storageManager.getNoteWallBoard(board.id).notes[0].pinnedLinks[0].anchorOffset;
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move pinned link Read this' }), { clientX: 340, clientY: 260 });
    fireEvent.pointerMove(window, { clientX: 365, clientY: 275 });
    fireEvent.pointerUp(window, { clientX: 365, clientY: 275 });
    await waitFor(() => {
      expect(storageManager.getNoteWallBoard(board.id).notes[0].pinnedLinks[0].anchorOffset).toEqual({
        x: originalOffset.x + 25,
        y: originalOffset.y + 15,
      });
      expect(card).toBeInTheDocument();
      expect(card.parentElement).toHaveClass('note-wall-board');
    });
  });

  it('keeps an internal link card fixed while its metadata preview opens in a portal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      '<html><head><title>Article title</title><meta property="og:title" content="Article title"><meta name="author" content="Page author"></head></html>',
      { headers: { 'content-type': 'text/html' } },
    )));
    const board = storageManager.createNoteWallBoard('Stable link hover');
    storageManager.saveNoteWallBoard(board.id, {
      notes: [{
        id: 'stable-link-note',
        title: 'Stable link note',
        text: '[Article](https://hover-stability.example/article)',
        category: 'Inbox',
        markdown: true,
        pinnedLinks: [{
          id: 'stable-link',
          label: 'Article',
          url: 'https://hover-stability.example/article',
          anchorOffset: { x: 220, y: 170 },
        }],
      }],
    });
    render(<MemoryRouter><NoteWall boardId={board.id} /></MemoryRouter>);

    const card = screen.getByRole('article', { name: 'Pinned note link: Article' });
    const link = card.querySelector('.note-wall-markdown-link-preview');
    expect(link).toHaveClass('is-compact');
    const toolbar = card.querySelector('.note-wall-pinned-markdown-link-toolbar');
    expect(toolbar.querySelector('.note-wall-pinned-markdown-link-unpin')).toBeInTheDocument();
    expect(toolbar.querySelector('.note-wall-link-actions-menu')).toBeInTheDocument();
    expect(toolbar).not.toContainElement(link);
    fireEvent.mouseEnter(card);
    expect(card.style.height).toBe('');
    expect(card.style.left).not.toBe('');
    expect(card.style.getPropertyValue('--note-wall-link-width')).toBe('190px');
    expect(card.querySelector('.note-wall-markdown-link-label')).toBeInTheDocument();
    expect(card.querySelector('.note-wall-markdown-link-host')).toBeInTheDocument();
    await waitFor(() => expect(link).toHaveAttribute('aria-label', 'Article title · hover-stability.example'));
    fireEvent.mouseEnter(link);
    const popup = await screen.findByRole('link', { name: 'Open Article title' });

    expect(card).not.toContainElement(popup);
    expect(popup).toHaveTextContent('By Page author');
    expect(card.querySelectorAll('.note-wall-markdown-link-preview')).toHaveLength(1);
    expect(card.querySelector('.note-wall-markdown-link-expanded')).toBeNull();
  });

  it('edits or deletes a pinned Markdown link from its three-dot menu', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const board = storageManager.createNoteWallBoard('Link actions');
    storageManager.saveNoteWallBoard(board.id, {
      notes: [{
        id: 'link-actions-note',
        title: 'Link actions note',
        text: '[Original label](https://example.com/original)',
        category: 'Inbox',
        markdown: true,
        pinnedLinks: [{
          id: 'editable-link',
          label: 'Original label',
          url: 'https://example.com/original',
          anchorOffset: { x: 220, y: 170 },
        }],
      }],
    });
    render(<MemoryRouter><NoteWall boardId={board.id} /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'More actions for link Original label' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit link' }));
    expect(screen.getByRole('dialog', { name: 'Edit link' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Page URL'), { target: { value: 'https://example.com/updated' } });
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Updated label' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    await waitFor(() => {
      expect(storageManager.getNoteWallBoard(board.id).notes[0].pinnedLinks[0]).toMatchObject({
        id: 'editable-link',
        label: 'Updated label',
        url: 'https://example.com/updated',
      });
      expect(storageManager.getNoteWallBoard(board.id).notes[0].text).toContain('[Updated label](https://example.com/updated)');
    });
    expect(screen.queryByRole('dialog', { name: 'Edit link' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More actions for link Updated label' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete link' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete “Updated label” from this note?');
    fireEvent.click(screen.getByRole('alertdialog').querySelector('.note-wall-delete-confirm'));
    await waitFor(() => expect(storageManager.getNoteWallBoard(board.id).notes[0].pinnedLinks).toHaveLength(0));
  });

  it('edits an external web clip from its three-dot menu', async () => {
    const board = storageManager.createNoteWallBoard('Edit web clip');
    storageManager.saveNoteWallBoard(board.id, {
      wall: {
        webClips: [{
          id: 'editable-web-clip',
          url: 'https://example.com/article',
          title: 'Original article',
          siteName: 'Example',
          description: 'Existing metadata',
          image: '',
          author: '',
          publishedAt: '',
          category: 'Inbox',
          compact: true,
        }],
        positions: { 'editable-web-clip': { x: 360, y: 80 } },
      },
    });
    render(<MemoryRouter><NoteWall boardId={board.id} /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'More actions for link Original article' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit link' }));
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Revised article' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    await waitFor(() => {
      expect(storageManager.getNoteWallBoard(board.id).wall.webClips[0]).toMatchObject({
        id: 'editable-web-clip',
        title: 'Revised article',
        url: 'https://example.com/article',
        description: 'Existing metadata',
      });
    });

  });

  it('closes link menus when clicking elsewhere on the board', () => {
    const board = storageManager.createNoteWallBoard('Outside click');
    storageManager.saveNoteWallBoard(board.id, {
      wall: {
        webClips: [{
          id: 'outside-click-clip',
          url: 'https://example.com/article',
          title: 'Outside click link',
          siteName: 'Example',
          compact: true,
        }],
        positions: { 'outside-click-clip': { x: 360, y: 80 } },
      },
    });
    render(<MemoryRouter><NoteWall boardId={board.id} /></MemoryRouter>);

    const pinMenu = document.querySelector('.note-wall-webclip-pin-menu');
    fireEvent.click(screen.getByRole('button', { name: 'Pin Outside click link to a note' }));
    expect(pinMenu).toHaveAttribute('open');
    fireEvent.click(screen.getByText('Add items'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Add task', exact: true }));
    expect(pinMenu).not.toHaveAttribute('open');

    fireEvent.click(screen.getByRole('button', { name: 'More actions for link Outside click link' }));
    const actionMenu = document.querySelector('.note-wall-link-actions-menu');
    expect(actionMenu).toHaveAttribute('open');
    fireEvent.click(screen.getByText('Add items'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Add note', exact: true }));
    expect(actionMenu).not.toHaveAttribute('open');
  });

  it('loads thumbnail and author metadata when pinning a URL and preserves a custom title', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`
      <meta property="og:title" content="Page title">
      <meta property="og:image" content="https://example.com/thumb.jpg">
      <meta name="author" content="Page author">
    `, { status: 200, headers: { 'content-type': 'text/html' } })));
    render(<MemoryRouter><NoteWall /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.change(screen.getByLabelText('Page URL'), { target: { value: 'https://example.com/story' } });
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'My saved title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pin link' }));

    expect(await screen.findByRole('link', { name: 'My saved title' })).toHaveAttribute('href', 'https://example.com/story');
    await waitFor(() => {
      expect(document.querySelector('[data-node-type="webclip"] img')).toHaveAttribute('src', 'https://example.com/thumb.jpg');
      expect(storageManager.getNoteWall().webClips[0]).toMatchObject({
        title: 'My saved title',
        author: 'Page author',
        image: 'https://example.com/thumb.jpg',
        compact: false,
      });
      expect(storageManager.getNoteWall().sizes[storageManager.getNoteWall().webClips[0].id]).toEqual({ width: 190, height: 68 });
    });
    expect(document.querySelector('.note-wall-webclip-title')).toHaveTextContent('My saved title');
    expect(document.querySelector('.note-wall-webclip-site-name')).toHaveTextContent('example.com');
    expect(document.querySelector('.note-wall-webclip-preview')).toContainElement(
      document.querySelector('.note-wall-webclip-image'),
    );
    expect(document.querySelector('.note-wall-attachment-status')).toHaveTextContent('Thumbnail and author loaded');
  });

  it('confirms web clip removal and supports undo and redo', async () => {
    const clip = {
      id: 'clip-delete',
      url: 'https://example.com/article',
      title: 'Saved article',
      siteName: 'Example',
      description: '',
      image: '',
      author: '',
      publishedAt: '',
      category: 'Inbox',
    };
    storageManager.saveNoteWall({
      webClips: [clip],
      positions: { [clip.id]: { x: 360, y: 30 } },
      sizes: { [clip.id]: { width: 320, height: 260 } },
      connections: [{ id: 'clip-line', from: '1', to: clip.id, fromType: 'note', toType: 'webclip' }],
      comments: { [`webclip:${clip.id}`]: [{ id: 'comment-1', text: 'Read this later.' }] },
    });
    render(<MemoryRouter><NoteWall /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'More actions for link Saved article' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete link' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Remove “Saved article” from this wall? You can undo this action.');
    expect(storageManager.getNoteWall().webClips).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(storageManager.getNoteWall().webClips).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'More actions for link Saved article' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove web clip', exact: true }));
    await waitFor(() => {
      const wall = storageManager.getNoteWall();
      expect(wall.webClips).toHaveLength(0);
      expect(wall.positions[clip.id]).toBeUndefined();
      expect(wall.sizes[clip.id]).toBeUndefined();
      expect(wall.comments[`webclip:${clip.id}`]).toBeUndefined();
      expect(wall.connections).toHaveLength(0);
    });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      const wall = storageManager.getNoteWall();
      expect(wall.webClips).toEqual([clip]);
      expect(wall.comments[`webclip:${clip.id}`]).toHaveLength(1);
      expect(wall.connections).toHaveLength(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await waitFor(() => expect(storageManager.getNoteWall().webClips).toHaveLength(0));
  });

  it('creates independent board notes and tasks without changing dashboard data', async () => {
    const dashboardNotes = storageManager.getStickyNotes();
    storageManager.saveTasks([{ id: 'dashboard-task', title: 'Dashboard task', category: 'Inbox' }]);
    storageManager.saveNoteWall({ webClips: [{ id: 'dashboard-clip', url: 'https://dashboard.example' }] });
    const board = storageManager.createNoteWallBoard('Research');

    render(<MemoryRouter><NoteWall boardId={board.id} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Research' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Add items'));
    fireEvent.click(screen.getAllByRole('button', { name: 'New folder', exact: true })[0]);
    fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'Ideas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));

    fireEvent.click(screen.getByText('Add items'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Add note', exact: true })[0]);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Project thought' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Keep this on the research board.' } });
    fireEvent.click(screen.getByText('Organize note'));
    fireEvent.change(screen.getByLabelText('Tags Separate with commas'), { target: { value: 'research, planning' } });
    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: 'Ideas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create note' }));
    expect(await screen.findByText('Project thought', { selector: 'strong' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Add items'));
    fireEvent.click(screen.getByRole('button', { name: 'Add task', exact: true }));
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'Review research' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'high' } });
    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: 'Ideas' } });
    fireEvent.click(screen.getByRole('dialog', { name: 'Add a task' }).querySelector('button[type="submit"]'));
    await waitFor(() => {
      const savedBoard = storageManager.getNoteWallBoard(board.id);
      expect(savedBoard.categories).toContain('Ideas');
      expect(savedBoard.taskCategories).toContain('Ideas');
      expect(savedBoard.notes).toMatchObject([{ title: 'Project thought', text: 'Keep this on the research board.', tags: ['research', 'planning'], category: 'Ideas' }]);
      expect(savedBoard.tasks).toMatchObject([{ title: 'Review research', priority: 'high', completed: false, category: 'Ideas' }]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mark task Review research complete' }));
    await waitFor(() => expect(storageManager.getNoteWallBoard(board.id).tasks[0].completed).toBe(true));
    expect(storageManager.getStickyNotes()).toEqual(dashboardNotes);
    expect(storageManager.getTasks()).toEqual([{ id: 'dashboard-task', title: 'Dashboard task', category: 'Inbox' }]);
    expect(storageManager.getNoteWall().webClips).toEqual([{ id: 'dashboard-clip', url: 'https://dashboard.example' }]);
  });

  it('creates a board folder from the note editor and previews safe, editable Markdown', async () => {
    const board = storageManager.createNoteWallBoard('Markdown notes');
    render(<MemoryRouter><NoteWall boardId={board.id} /></MemoryRouter>);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add note', exact: true })[0]);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Reading notes' } });
    const markdown = '## Key idea\n\n**Keep this** useful.\n\n<img src=x onerror=alert(1)>';
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: markdown } });
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    const preview = screen.getByRole('tabpanel', { name: 'Markdown preview' });
    expect(preview.querySelector('h2')).toHaveTextContent('Key idea');
    expect(preview.querySelector('strong')).toHaveTextContent('Keep this');
    expect(preview.querySelector('img')).toBeNull();
    expect(preview.textContent).toContain('<img src=x onerror=alert(1)>');

    fireEvent.click(screen.getByText('Organize note'));
    fireEvent.click(screen.getByRole('button', { name: '+ New folder' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New folder name for note' }), { target: { value: 'Reading' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));
    expect(screen.getByLabelText('Folder')).toHaveValue('Reading');
    fireEvent.click(screen.getByRole('tab', { name: 'Write' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create note' }));

    await waitFor(() => {
      expect(storageManager.getNoteWallBoard(board.id).notes).toMatchObject([
        { title: 'Reading notes', text: markdown, category: 'Reading', markdown: true },
      ]);
    });
    const savedCard = screen.getByRole('article', { name: 'Select Reading notes card to change its color' });
    expect(savedCard.querySelector('.note-wall-note-preview h2')).toHaveTextContent('Key idea');
    expect(savedCard.querySelector('.note-wall-note-preview strong')).toHaveTextContent('Keep this');
    expect(savedCard.querySelector('.note-wall-note-preview img')).toBeNull();

    fireEvent.doubleClick(screen.getByRole('article', { name: 'Select Reading notes card to change its color' }));
    expect(screen.getByRole('dialog', { name: 'Reading notes' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Reading notes' }).querySelector('.note-wall-markdown-content h2')).toHaveTextContent('Key idea');
    const noteCard = screen.getByRole('article', { name: 'Select Reading notes card to change its color' });
    fireEvent.click(noteCard.querySelector('summary'));
    expect(noteCard.querySelector('[role="menu"]')).toBeInTheDocument();
    fireEvent.click(noteCard.querySelector('[role="menuitem"]'));
    expect(screen.getByLabelText('Note')).toHaveValue(markdown);
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByRole('tabpanel', { name: 'Markdown preview' }).querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.doubleClick(screen.getByRole('article', { name: 'Select Reading notes card to change its color' }));
    const noteView = screen.getByRole('dialog', { name: 'Reading notes' });
    fireEvent.click(noteView.querySelector('summary'));
    fireEvent.click(noteView.querySelectorAll('[role="menuitem"]')[1]);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete “Reading notes” from this board?');
  });

  it('rejects unsafe URLs when manually pinning a link', async () => {
    render(<MemoryRouter><NoteWall /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.change(screen.getByLabelText('Page URL'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.submit(screen.getByRole('dialog', { name: 'Pin a link to the wall' }).querySelector('form'));

    expect(await screen.findByRole('alert')).toHaveTextContent('valid http or https');
    expect(storageManager.getNoteWall().webClips).toHaveLength(0);
  });

  it('provides bookmarklet setup instructions with a copy control', () => {
    render(<MemoryRouter><NoteWall /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Web clipper' }));
    expect(screen.getByRole('dialog', { name: 'Save pages to your wall' })).toHaveTextContent('canonical URL');
    expect(screen.getByLabelText('Bookmarklet code').value).toContain('javascript:');
    expect(screen.getByRole('button', { name: 'Copy bookmarklet' })).toBeEnabled();
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
