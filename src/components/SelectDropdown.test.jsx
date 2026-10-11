import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SelectDropdown from './SelectDropdown';

describe('SelectDropdown', () => {
  it('portals an open menu outside clipped widgets and still selects an option', () => {
    const onChange = vi.fn();
    const { container } = render(
      <div className="widget">
        <SelectDropdown
          label="Chart metric"
          value="focus"
          options={[
            { value: 'focus', label: 'Focus time' },
            { value: 'tasks', label: 'Tasks completed' },
          ]}
          onChange={onChange}
          portal
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Chart metric' }));
    const menu = screen.getByRole('listbox', { name: 'Chart metric' });
    expect(menu.parentElement).toBe(document.body);
    expect(container.querySelector('.ui-select-menu')).toBeNull();

    fireEvent.click(screen.getByRole('option', { name: 'Tasks completed' }));
    expect(onChange).toHaveBeenCalledWith('tasks');
    expect(screen.queryByRole('listbox', { name: 'Chart metric' })).not.toBeInTheDocument();
  });
});
