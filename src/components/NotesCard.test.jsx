import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotesCard from './NotesCard';
import { storageManager } from '../utils/localStorage';

describe('NotesCard folders', () => {
  beforeEach(() => {
    localStorage.setItem('kazedesk_sticky_notes', JSON.stringify([]));
    localStorage.setItem('kazedesk_note_categories', JSON.stringify(['Inbox']));
  });

  it('creates folders, assigns new notes, filters by folder, and sorts alphabetically', () => {
    render(<NotesCard />);

    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New notes folder name' }), { target: { value: 'School' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create notes folder' }));
    expect(storageManager.getNoteCategories()).toEqual(['Inbox', 'School']);

    fireEvent.click(screen.getByRole('button', { name: 'Add new note' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Note title' }), { target: { value: 'Zebra notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note', exact: true }));

    expect(storageManager.getStickyNotes()[0].category).toBe('School');
    expect(screen.getByText('Zebra notes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sort notes' }));
    fireEvent.click(screen.getByRole('option', { name: 'Alphabetical' }));
    expect(screen.getByRole('button', { name: 'Sort notes' })).toHaveAttribute('title', 'Sort notes: Alphabetical');

    fireEvent.click(screen.getByRole('button', { name: /All notes/ }));
    expect(screen.getByText('Zebra notes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^School/ }));
    expect(screen.getByText('Zebra notes')).toBeInTheDocument();
  });

  it('moves notes to Inbox when their folder is deleted', () => {
    localStorage.setItem('kazedesk_note_categories', JSON.stringify(['Inbox', 'Work']));
    localStorage.setItem('kazedesk_sticky_notes', JSON.stringify([{
      id: 1,
      title: 'Meeting notes',
      text: '',
      category: 'Work',
      createdAt: new Date().toISOString(),
    }]));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<NotesCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Work folder' }));

    expect(storageManager.getNoteCategories()).toEqual(['Inbox']);
    expect(storageManager.getStickyNotes()[0].category).toBe('Inbox');
    expect(screen.queryByRole('button', { name: 'Delete Work folder' })).not.toBeInTheDocument();
  });

  it('saves per-note tags when creating and editing notes', () => {
    render(<NotesCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Add new note' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Note title' }), { target: { value: 'Tagged note' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Note tags' }), { target: { value: 'work, planning, work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note', exact: true }));

    expect(storageManager.getStickyNotes()[0].tags).toEqual(['work', 'planning']);
    expect(screen.getByLabelText('Tags: work, planning')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Tagged note'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Note tags' }), { target: { value: 'personal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close note' }));

    expect(storageManager.getStickyNotes()[0].tags).toEqual(['personal']);
  });

  it('opens the new-note editor in a distinct modal surface', () => {
    render(<NotesCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Add new note' }));

    expect(screen.getByText('New note').closest('.note-modal-card')).toHaveClass('glassmorphism-card');
    expect(screen.getByRole('textbox', { name: 'Note text' })).toBeVisible();
  });

  it('keeps custom wall colors visible and editable in the dashboard notes widget', () => {
    localStorage.setItem('kazedesk_sticky_notes', JSON.stringify([{
      id: 1,
      title: 'Custom colored note',
      text: 'Color set on the wall',
      color: '#dd8800',
      category: 'Inbox',
      tags: [],
    }]));
    render(<NotesCard />);

    const noteTitle = screen.getByText('Custom colored note');
    expect(noteTitle.closest('.note-item-row').querySelector('.color-indicator-dot')).toHaveStyle({ backgroundColor: '#dd8800' });
    fireEvent.click(noteTitle);
    expect(screen.getByLabelText('Custom note color')).toHaveValue('#dd8800');
  });
});
