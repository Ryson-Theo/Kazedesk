import { isValidElement, useId, useLayoutEffect, useRef, useState } from 'react';
import './BranchedMenu.css';

const PAD = 6;
const MARKER_SIZE = 16;

function toSet(value) {
  if (Array.isArray(value)) return new Set(value);
  return Number.isInteger(value) && value >= 0 ? new Set([value]) : new Set();
}

function renderIcon(icon) {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  const Icon = icon;
  return <Icon size={16} strokeWidth={1.8} aria-hidden="true" />;
}

export default function BranchedMenu({
  items,
  defaultOpen = 0,
  defaultActive = '',
  onSelect,
  ariaLabel = 'Board item navigation',
  color = '#f5f5f5',
  accentColor = '#f5f5f5',
  lineColor = '#3f3f46',
  width = 240,
  rowHeight = 36,
  indent = 40,
  trunk = 14,
  radius = 10,
  lineWidth = 1.5,
  fontSize = 14,
  drawDuration = 400,
  foldDuration = 300,
  className = '',
}) {
  const [open, setOpen] = useState(() => toSet(defaultOpen));
  const [active, setActive] = useState(() => {
    if (defaultActive) return defaultActive;
    const firstOpenSection = items.find((item, index) => item.children && toSet(defaultOpen).has(index));
    return firstOpenSection?.children?.[0]?.value || '';
  });
  const navRef = useRef(null);
  const heads = useRef([]);
  const markerRef = useRef(null);
  const navId = useId();
  const activeSection = items.findIndex((item) => item.children?.some((child) => child.value === active));
  const markerShown = activeSection >= 0 && open.has(activeSection);

  useLayoutEffect(() => {
    const placeMarker = (glide) => {
      const marker = markerRef.current;
      const header = heads.current[activeSection];
      if (!marker) return;
      const shouldShow = markerShown && header;
      if (!glide) marker.style.transition = 'none';
      if (shouldShow) marker.style.top = `${header.offsetTop + (header.offsetHeight - MARKER_SIZE) / 2}px`;
      marker.toggleAttribute('data-on', Boolean(shouldShow));
      if (!glide) {
        void marker.offsetHeight;
        marker.style.transition = '';
      }
    };

    placeMarker(true);
    if (typeof ResizeObserver === 'undefined' || !navRef.current) return undefined;
    let firstResize = true;
    const observer = new ResizeObserver(() => {
      if (firstResize) {
        firstResize = false;
        return;
      }
      placeMarker(false);
    });
    observer.observe(navRef.current);
    return () => observer.disconnect();
  }, [activeSection, markerShown, items, fontSize, rowHeight]);

  const selectItem = (value, item) => {
    setActive(value);
    onSelect?.(value, item);
  };

  const toggleSection = (index) => {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const curveRadius = Math.min(radius, rowHeight / 2 - 2);
  const endX = indent - 8;
  const rowY = (index) => PAD + index * rowHeight + rowHeight / 2;
  const branch = (index) => `M ${trunk} ${rowY(index) - curveRadius} A ${curveRadius} ${curveRadius} 0 0 0 ${trunk + curveRadius} ${rowY(index)} H ${endX}`;
  const reach = (index) => `M ${trunk} 0 V ${rowY(index) - curveRadius} A ${curveRadius} ${curveRadius} 0 0 0 ${trunk + curveRadius} ${rowY(index)} H ${endX}`;
  const pathLength = (index) => rowY(index) - curveRadius + (Math.PI * curveRadius) / 2 + (endX - trunk - curveRadius);

  return (
    <nav
      ref={navRef}
      className={`branched-menu${className ? ` ${className}` : ''}`}
      aria-label={ariaLabel}
      style={{
        '--bm-w': `${width}px`,
        '--bm-ink': color,
        '--bm-accent': accentColor,
        '--bm-line': lineColor,
        '--bm-font': `${fontSize}px`,
        '--bm-row': `${rowHeight}px`,
        '--bm-indent': `${indent}px`,
        '--bm-line-w': lineWidth,
        '--bm-draw': `${drawDuration}ms`,
        '--bm-fold': `${foldDuration}ms`,
      }}
    >
      <span ref={markerRef} className="branched-menu__marker" aria-hidden="true" />
      {items.map((item, index) => {
        const children = item.children;
        const isOpen = Boolean(children && open.has(index));
        const leafValue = item.value ?? item.label;
        const isActiveLeaf = !children && leafValue === active;
        const bodyHeight = children ? PAD * 2 + children.length * rowHeight : 0;
        const bodyId = `${navId}-section-${index}`;

        return (
          <div
            key={item.value ?? item.label}
            className="branched-menu__section"
            data-open={isOpen ? '' : undefined}
          >
            <button
              ref={(element) => { heads.current[index] = element; }}
              type="button"
              className="branched-menu__head"
              aria-label={item.ariaLabel}
              aria-expanded={children ? isOpen : undefined}
              aria-controls={children ? bodyId : undefined}
              aria-current={isActiveLeaf ? 'page' : undefined}
              data-active={isActiveLeaf ? '' : undefined}
              onClick={() => (children ? toggleSection(index) : selectItem(leafValue, item))}
            >
              {item.icon && <span className="branched-menu__icon">{renderIcon(item.icon)}</span>}
              <span className="branched-menu__label">{item.label}</span>
            </button>
            {children && (
              <div id={bodyId} className="branched-menu__body">
                <div className="branched-menu__fold">
                  <div className="branched-menu__tree" style={{ height: bodyHeight }}>
                    <svg className="branched-menu__lines" width={indent} height={bodyHeight} aria-hidden="true">
                      <path className="branched-menu__base" d={`M ${trunk} 0 V ${rowY(children.length - 1) - curveRadius}`} />
                      {children.map((child, childIndex) => (
                        <path key={`base-${child.value}`} className="branched-menu__base" d={branch(childIndex)} />
                      ))}
                      {children.map((child, childIndex) => (
                        <path
                          key={`reach-${child.value}`}
                          className="branched-menu__reach"
                          d={reach(childIndex)}
                          style={{
                            strokeDasharray: pathLength(childIndex),
                            strokeDashoffset: child.value === active ? 0 : pathLength(childIndex),
                          }}
                        />
                      ))}
                    </svg>
                    {children.map((child) => (
                      <button
                        key={child.value}
                        type="button"
                        className="branched-menu__item"
                        aria-label={child.ariaLabel}
                        title={child.label}
                        aria-current={child.value === active ? 'page' : undefined}
                        data-active={child.value === active ? '' : undefined}
                        tabIndex={isOpen ? 0 : -1}
                        onClick={() => selectItem(child.value, child)}
                      >
                        {child.icon && <span className="branched-menu__icon">{renderIcon(child.icon)}</span>}
                        <span className="branched-menu__label">{child.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
