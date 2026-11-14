import { Folder } from 'lucide-react';
import BranchedMenu from './BranchedMenu';

export default function BoardItemSidebar({ items, onSelect, theme = 'dark', isOpen = false }) {
  const isLight = theme === 'light';

  return (
    <aside
      id="note-wall-item-sidebar"
      className={`note-wall-sidebar${isOpen ? ' is-open' : ''}`}
      aria-label="Board item sidebar"
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      <header className="note-wall-sidebar-header">
        <div className="note-wall-sidebar-title">
          <span className="note-wall-sidebar-mark" aria-hidden="true"><Folder size={17} /></span>
          <span>Board items</span>
        </div>
      </header>
      <BranchedMenu
        items={items}
        defaultOpen={items.map((_, index) => index)}
        ariaLabel="Board item navigation"
        className="note-wall-sidebar-menu"
        onSelect={onSelect}
        color={isLight ? '#17211c' : '#f1f2ec'}
        accentColor={isLight ? '#3d694a' : '#b6d2ad'}
        lineColor={isLight ? '#cbd3cc' : '#3b463e'}
        width={256}
        rowHeight={34}
        indent={34}
        trunk={13}
        radius={9}
        lineWidth={1.5}
        fontSize={12}
        drawDuration={350}
        foldDuration={260}
      />
    </aside>
  );
}
