export default function MinimizedWidgetDock({ items, position = 'bottom', style = 'icons', embedded = false, idle = false }) {
  if (!items.length) return null;

  return (
    <nav className={`minimized-widget-dock minimized-widget-dock-${position} minimized-widget-dock-${style} ${embedded ? 'minimized-widget-dock-embedded' : ''} ${idle ? 'minimized-widget-dock-idle-hidden' : ''}`} aria-label="Widget dock">
      {items.map(({ id, label, Icon, active, onRestore }) => (
        <button
          key={id}
          type="button"
          className={`minimized-widget-tab ${active ? 'minimized-widget-tab-active' : ''}`}
          onClick={onRestore}
          aria-label={`${active ? 'Minimize' : 'Restore'} ${label}`}
          aria-pressed={active}
          title={`${active ? 'Minimize' : 'Restore'} ${label}`}
        >
          <Icon size={17} aria-hidden="true" />
          {style === 'labels' && <span>{label}</span>}
        </button>
      ))}
    </nav>
  );
}
