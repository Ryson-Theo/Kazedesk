import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BranchedMenu from './BranchedMenu';

const items = [
  {
    label: 'Workspace',
    children: [
      { value: 'dashboard', label: 'Dashboard' },
      { value: 'boards', label: 'Boards' },
    ],
  },
  {
    label: 'Tools',
    children: [{ value: 'tasks', label: 'Tasks' }],
  },
];

describe('BranchedMenu', () => {
  it('lets a section collapse and expand its branch', () => {
    render(<BranchedMenu items={items} defaultOpen={[0]} defaultActive="dashboard" />);

    const section = screen.getByRole('button', { name: 'Workspace' });
    const dashboard = screen.getByRole('button', { name: 'Dashboard' });
    expect(section).toHaveAttribute('aria-expanded', 'true');
    expect(dashboard).toHaveAttribute('tabindex', '0');

    fireEvent.click(section);
    expect(section).toHaveAttribute('aria-expanded', 'false');
    expect(dashboard).toHaveAttribute('tabindex', '-1');

    fireEvent.click(section);
    expect(section).toHaveAttribute('aria-expanded', 'true');
    expect(dashboard).toHaveAttribute('tabindex', '0');
  });

  it('selects an item and traces the active branch', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <BranchedMenu items={items} defaultOpen={[0]} defaultActive="dashboard" onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Boards' }));

    expect(onSelect).toHaveBeenCalledWith('boards', items[0].children[1]);
    expect(screen.getByRole('button', { name: 'Boards' })).toHaveAttribute('aria-current', 'page');
    const reaches = container.querySelectorAll('.branched-menu__reach');
    expect(reaches[1].style.strokeDashoffset).toBe('0');
    expect(reaches[0].style.strokeDashoffset).not.toBe('0');
  });
});
