import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import '../styles/SelectDropdown.css';

export default function SelectDropdown({ value, options, onChange, label, icon: Icon, iconOnly = false, portal = false, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const listboxId = useId();
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!portal || !isOpen) {
      setMenuPosition(null);
      return undefined;
    }

    const updatePosition = () => {
      const trigger = rootRef.current?.querySelector('.ui-select-trigger');
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const triggerBounds = trigger.getBoundingClientRect();
      const menuBounds = menu.getBoundingClientRect();
      const margin = 8;
      const gap = 5;
      const left = Math.max(margin, Math.min(
        triggerBounds.left,
        window.innerWidth - menuBounds.width - margin,
      ));
      const below = triggerBounds.bottom + gap;
      const top = below + menuBounds.height <= window.innerHeight - margin
        ? below
        : Math.max(margin, triggerBounds.top - menuBounds.height - gap);
      setMenuPosition({ left, top });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, portal]);

  const menu = isOpen && (
    <div
      className={`ui-select-menu ${portal ? 'ui-select-menu--portal' : ''}`}
      id={listboxId}
      role="listbox"
      aria-label={label}
      ref={menuRef}
      style={portal ? (menuPosition
        ? { left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }
        : { visibility: 'hidden' }) : undefined}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === value}
          className={`ui-select-option ${option.value === value ? 'is-selected' : ''}`}
          onClick={() => {
            onChange(option.value);
            setIsOpen(false);
          }}
        >
          <span>{option.label}</span>
          {option.value === value && <Check size={13} />}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`ui-select ${className}`} ref={rootRef}>
      <button
        type="button"
        className="ui-select-trigger"
        aria-label={label}
        title={iconOnly ? `${label}: ${selectedOption?.label ?? value}` : undefined}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        {Icon && <Icon className="ui-select-leading-icon" size={13} />}
        {!iconOnly && <span className="ui-select-value">{selectedOption?.label ?? value}</span>}
        <ChevronDown className={`ui-select-chevron ${isOpen ? 'is-open' : ''}`} size={13} />
      </button>
      {!portal && menu}
      {portal && menu && createPortal(menu, document.body)}
    </div>
  );
}
