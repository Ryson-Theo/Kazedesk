import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TaskCard from './TaskCard';
import { storageManager } from '../utils/localStorage';

describe('TaskCard', () => {
  it('creates category folders and repeats a task daily', () => {
    render(<TaskCard />);

    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New category name' }), { target: { value: 'Work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add new task' }));
    fireEvent.click(screen.getByRole('button', { name: 'New task category' }));
    fireEvent.click(screen.getByRole('option', { name: 'Work' }));
    fireEvent.change(screen.getByPlaceholderText('What needs to be done today?'), { target: { value: 'Read chapter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Task' }));

    const task = storageManager.getTasks()[0];
    expect(task.category).toBe('Work');
    expect(storageManager.getTaskCategories()).toContain('Work');

    fireEvent.click(screen.getByRole('button', { name: 'More options for Read chapter' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Repeat daily' }));
    expect(storageManager.getTasks()[0].repeatDaily).toBe(true);
    expect(Number.isNaN(Date.parse(storageManager.getTasks()[0].reminder))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'More options for Read chapter' }));
    expect(screen.getByRole('menuitem', { name: /Stop daily repeat/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit task' }));
    expect(screen.getByRole('button', { name: 'Priority for Read chapter' })).toBeInTheDocument();
  });

  it('advances a due daily reminder to the same local time tomorrow', () => {
    vi.useFakeTimers();
    const now = new Date(2026, 9, 11, 10, 0, 30);
    vi.setSystemTime(now);
    const dueReminder = new Date(now);
    dueReminder.setHours(9, 15, 0, 0);
    localStorage.setItem('kazedesk_tasks', JSON.stringify([{
      id: 1,
      title: 'Daily task',
      category: 'Inbox',
      completed: false,
      repeatDaily: true,
      notified: false,
      reminder: dueReminder.toISOString(),
    }]));
    const reminderListener = vi.fn();
    window.addEventListener('task-reminder-due', reminderListener);
    const view = render(<TaskCard />);

    const expectedReminder = new Date(now);
    expectedReminder.setDate(expectedReminder.getDate() + 1);
    expectedReminder.setHours(9, 15, 0, 0);
    expect(new Date(storageManager.getTasks()[0].reminder).getTime()).toBe(expectedReminder.getTime());
    expect(reminderListener).toHaveBeenCalledOnce();
    expect(reminderListener.mock.calls[0][0].detail.tasks).toEqual([{ id: 1, title: 'Daily task' }]);

    view.unmount();
    window.removeEventListener('task-reminder-due', reminderListener);
    vi.useRealTimers();
  });

  it('deletes a category folder and moves its tasks to Inbox', () => {
    localStorage.setItem('kazedesk_task_categories', JSON.stringify(['Inbox', 'Work']));
    localStorage.setItem('kazedesk_tasks', JSON.stringify([{
      id: 2,
      title: 'Prepare report',
      category: 'Work',
      completed: false,
      priority: 'medium',
    }]));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TaskCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Work folder' }));

    expect(storageManager.getTaskCategories()).toEqual(['Inbox']);
    expect(storageManager.getTasks()[0].category).toBe('Inbox');
    expect(screen.queryByRole('button', { name: 'Delete Work folder' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Inbox/ })).toBeInTheDocument();
  });

  it('opens task sorting choices from the filter icon beside the selected folder', () => {
    localStorage.setItem('kazedesk_tasks', JSON.stringify([
      { id: 3, title: 'Zebra task', completed: false, priority: 'low' },
      { id: 4, title: 'Alpha task', completed: false, priority: 'high' },
    ]));
    render(<TaskCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Sort tasks' }));
    fireEvent.click(screen.getByRole('option', { name: 'Alphabetical' }));

    expect(screen.getByRole('button', { name: 'Sort tasks' })).toHaveAttribute('title', 'Sort tasks: Alphabetical');
    expect(Array.from(document.querySelectorAll('.task-item-title-input')).map((input) => input.value))
      .toEqual(['Alpha task', 'Zebra task']);
  });

  it('deletes a task from its three-dot action menu', () => {
    localStorage.setItem('kazedesk_tasks', JSON.stringify([
      { id: 5, title: 'Remove me', completed: false, priority: 'medium' },
    ]));
    render(<TaskCard />);

    fireEvent.click(screen.getByRole('button', { name: 'More options for Remove me' }));
    const actionMenu = screen.getByRole('menu', { name: 'Actions for Remove me' });
    expect(actionMenu.parentElement).toBe(document.body);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete task' }));

    expect(storageManager.getTasks()).toEqual([]);
    expect(screen.queryByDisplayValue('Remove me')).not.toBeInTheDocument();
  });

  it('animates a completed task out of active tasks and keeps it in a collapsed completed section', () => {
    vi.useFakeTimers();
    localStorage.setItem('kazedesk_tasks', JSON.stringify([
      { id: 6, title: 'Finish draft', completed: false, priority: 'medium' },
    ]));
    render(<TaskCard />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Complete Finish draft' }));
    expect(screen.getByRole('checkbox', { name: 'Mark incomplete Finish draft' })).toBeInTheDocument();
    expect(storageManager.getTasks()[0].completed).toBe(true);

    act(() => vi.advanceTimersByTime(421));
    expect(screen.queryByDisplayValue('Finish draft')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Completed/ })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: /Completed/ }));
    expect(screen.getByDisplayValue('Finish draft')).toBeInTheDocument();

    vi.useRealTimers();
  });
});
