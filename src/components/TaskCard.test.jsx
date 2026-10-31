import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TaskCard from './TaskCard';
import { storageManager } from '../utils/localStorage';

describe('TaskCard', () => {
  it('creates category folders and repeats a task daily', () => {
    render(<TaskCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Show task options' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Priority for Read chapter' }));
    expect(screen.getByRole('listbox', { name: 'Priority for Read chapter' }))
      .toHaveClass('ui-select-menu--portal');
    fireEvent.click(screen.getByRole('option', { name: 'High' }));
    expect(storageManager.getTasks()[0].priority).toBe('high');
  });

  it('keeps minimize beside the options menu in the header', () => {
    render(<TaskCard />);

    const header = document.querySelector('.task-header');
    expect(header.querySelector('h2')).toHaveTextContent("Today's Tasks");
    expect(header.querySelector('.task-badge')).toHaveTextContent('0');
    expect(header.querySelectorAll('button')).toHaveLength(2);
    expect(header.querySelector('.task-header-actions').lastElementChild)
      .toHaveAccessibleName('Show task options');
    expect(header.querySelector('.task-header-actions').firstElementChild)
      .toHaveAccessibleName('Minimize tasks');
    expect(screen.queryByRole('button', { name: 'New folder' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show task options' }));
    expect(screen.getByRole('button', { name: 'New folder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add new task' })).toBeInTheDocument();
    expect(document.querySelector('.task-tools-panel')).not.toContainElement(
      screen.getByRole('button', { name: 'Minimize tasks' }),
    );
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

  it('checks a scheduled reminder at its due time without polling every second', () => {
    vi.useFakeTimers();
    const now = new Date(2026, 9, 11, 10, 0, 0);
    vi.setSystemTime(now);
    const reminder = new Date(now.getTime() + 5_000);
    localStorage.setItem('kazedesk_tasks', JSON.stringify([{
      id: 2,
      title: 'Timed task',
      category: 'Inbox',
      completed: false,
      repeatDaily: false,
      notified: false,
      reminder: reminder.toISOString(),
    }]));
    const reminderListener = vi.fn();
    window.addEventListener('task-reminder-due', reminderListener);
    const view = render(<TaskCard />);

    expect(reminderListener).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(4_999));
    expect(reminderListener).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(reminderListener).toHaveBeenCalledOnce();
    expect(storageManager.getTasks()[0].notified).toBe(true);

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

    fireEvent.click(screen.getByRole('button', { name: 'Show task options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose task folder' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Show task options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sort tasks' }));
    expect(screen.getByRole('listbox', { name: 'Sort tasks' }))
      .toHaveClass('ui-select-menu--portal');
    fireEvent.click(screen.getByRole('option', { name: 'Alphabetical' }));

    expect(screen.getByRole('button', { name: 'Sort tasks' })).toHaveAttribute('title', 'Sort tasks: Alphabetical');
    expect(Array.from(document.querySelectorAll('.task-item-title-input')).map((input) => input.value))
      .toEqual(['Alpha task', 'Zebra task']);
  });

  it('reveals folder choices from the compact task options panel', () => {
    render(<TaskCard />);

    const optionsToggle = screen.getByRole('button', { name: 'Show task options' });
    expect(screen.queryByRole('button', { name: 'Choose task folder' })).not.toBeInTheDocument();

    fireEvent.click(optionsToggle);
    const folderToggle = screen.getByRole('button', { name: 'Choose task folder' });
    expect(folderToggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('.task-folder-choices')).toBeNull();

    fireEvent.click(folderToggle);

    expect(folderToggle).toHaveAttribute('aria-expanded', 'true');
    const folderChoices = document.querySelector('.task-folder-choices');
    expect(folderChoices).toHaveClass('is-open');
    expect(screen.getByRole('button', { name: /Inbox/ })).toBeInTheDocument();
  });

  it('shows todays reminders across folders and unreminded Inbox tasks in Today', () => {
    const todayReminder = new Date();
    todayReminder.setHours(18, 30, 0, 0);
    const tomorrowReminder = new Date(todayReminder);
    tomorrowReminder.setDate(tomorrowReminder.getDate() + 1);
    localStorage.setItem('kazedesk_task_categories', JSON.stringify(['Inbox', 'Work']));
    localStorage.setItem('kazedesk_tasks', JSON.stringify([
      { id: 21, title: 'Inbox quick task', category: 'Inbox', completed: false },
      { id: 22, title: 'Work due today', category: 'Work', completed: false, reminder: todayReminder.toISOString() },
      { id: 23, title: 'Work due tomorrow', category: 'Work', completed: false, reminder: tomorrowReminder.toISOString() },
      { id: 24, title: 'Inbox scheduled tomorrow', category: 'Inbox', completed: false, reminder: tomorrowReminder.toISOString() },
    ]));
    render(<TaskCard />);

    expect(screen.getByRole('heading', { name: "Today's Tasks" })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Inbox quick task')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Work due today')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Work due tomorrow')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Inbox scheduled tomorrow')).not.toBeInTheDocument();
  });

  it('swipes left to Today and right through user-created folders', () => {
    localStorage.setItem('kazedesk_task_categories', JSON.stringify(['Inbox', 'Work', 'Home']));
    render(<TaskCard />);
    const taskList = document.querySelector('.task-list');

    const startSwipe = (x, y) => {
      const event = new Event('touchstart', { bubbles: true });
      Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: y }] });
      fireEvent(taskList, event);
    };
    const endSwipe = (x, y) => {
      const event = new Event('touchend', { bubbles: true });
      Object.defineProperty(event, 'changedTouches', { value: [{ clientX: x, clientY: y }] });
      fireEvent(taskList, event);
    };

    startSwipe(160, 100);
    endSwipe(240, 102);
    expect(screen.getByRole('heading', { name: 'Work' })).toBeInTheDocument();

    startSwipe(240, 100);
    endSwipe(160, 102);
    expect(screen.getByRole('heading', { name: "Today's Tasks" })).toBeInTheDocument();
  });

  it('limits visible tasks to 5, 10, or the maximum', () => {
    localStorage.setItem('kazedesk_tasks', JSON.stringify(Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      title: `Task ${index + 1}`,
      category: 'Inbox',
      completed: false,
      priority: 'medium',
    }))));
    render(<TaskCard />);

    expect(document.querySelectorAll('.task-item:not(.is-completed)')).toHaveLength(12);

    fireEvent.click(screen.getByRole('button', { name: 'Show task options' }));
    const limitDropdown = screen.getByRole('button', { name: 'Number of tasks to show' });
    fireEvent.click(limitDropdown);
    expect(screen.getByRole('listbox', { name: 'Number of tasks to show' }))
      .toHaveClass('ui-select-menu--portal');
    fireEvent.click(screen.getByRole('option', { name: '5 tasks' }));
    expect(document.querySelectorAll('.task-item:not(.is-completed)')).toHaveLength(5);
    expect(document.querySelector('.task-badge-count')).toHaveTextContent('12');
    expect(screen.queryByText('Showing 5 of 12')).not.toBeInTheDocument();

    fireEvent.click(limitDropdown);
    fireEvent.click(screen.getByRole('option', { name: '10 tasks' }));
    expect(document.querySelectorAll('.task-item:not(.is-completed)')).toHaveLength(10);

    fireEvent.click(limitDropdown);
    fireEvent.click(screen.getByRole('option', { name: 'Max' }));
    expect(document.querySelectorAll('.task-item:not(.is-completed)')).toHaveLength(12);
  });

  it('uses a native time input for reminder edits and provides an in-panel close action', () => {
    const reminder = new Date(2026, 9, 31, 15, 45).toISOString();
    localStorage.setItem('kazedesk_tasks', JSON.stringify([
      { id: 8, title: 'Focus block', completed: false, priority: 'medium', reminder },
    ]));
    render(<TaskCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Show task options' }));
    fireEvent.click(screen.getByRole('button', { name: 'More options for Focus block' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit task' }));
    const timeInput = screen.getByLabelText('Reminder for Focus block');
    expect(timeInput).toHaveAttribute('type', 'time');
    expect(timeInput).toHaveValue('15:45');

    fireEvent.change(timeInput, { target: { value: '09:20' } });
    const updatedReminder = new Date(storageManager.getTasks()[0].reminder);
    expect(updatedReminder.getHours()).toBe(9);
    expect(updatedReminder.getMinutes()).toBe(20);

    fireEvent.click(screen.getByRole('button', { name: 'Done editing Focus block' }));
    expect(screen.queryByLabelText('Reminder for Focus block')).not.toBeInTheDocument();
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
