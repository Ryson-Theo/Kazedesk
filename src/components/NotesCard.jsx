import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bold, GripVertical, Italic, Trash2, Plus, X, Maximize2, Minimize2, StickyNote, Undo2, Folder, FolderPlus, ListFilter, ListTodo } from 'lucide-react';
import { storageManager } from '../utils/localStorage';
import SelectDropdown from './SelectDropdown';
import '../styles/NotesCard.css';

const COLOR_PALETTE = {
  yellow: { bg: '#fef08a' },
  pink: { bg: '#fbcfe8' },
  blue: { bg: '#bae6fd' },
  green: { bg: '#bbf7d0' },
  purple: { bg: '#e9d5ff' },
  orange: { bg: '#fed7aa' },
};
const FOLDER_COLORS = ['#a5b4fc', '#67e8f9', '#86efac', '#f9a8d4', '#fcd34d', '#c4b5fd'];

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function sanitizeRichText(value, plainText = false) {
  const parsed = new DOMParser().parseFromString('<div></div>', 'text/html');
  if (plainText) {
    parsed.body.firstElementChild.textContent = value;
  } else {
    parsed.body.firstElementChild.innerHTML = value;
  }

  const serialize = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.nodeValue || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return [...node.childNodes].map(serialize).join('');

    const tag = node.tagName.toLowerCase();
    const content = [...node.childNodes].map(serialize).join('');
    if (tag === 'br') return '<br>';
    if (tag === 'b' || tag === 'strong') return `<strong>${content}</strong>`;
    if (tag === 'i' || tag === 'em') return `<em>${content}</em>`;
    if (tag === 'p' || tag === 'div') return `<p>${content}</p>`;
    return content;
  };

  return [...parsed.body.firstElementChild.childNodes].map(serialize).join('');
}

function richTextToPlainText(markup) {
  const parsed = new DOMParser().parseFromString(markup, 'text/html');
  parsed.body.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith('\n'));
  parsed.body.querySelectorAll('p, div').forEach((block) => block.append('\n'));
  return parsed.body.textContent || '';
}

function getNoteTitle(note) {
  return note.title?.trim() || note.text?.split(/\r?\n/).find((line) => line.trim())?.trim() || 'Untitled note';
}

function parseTags(value) {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))];
}

function getCreatedAt(note) {
  const createdAt = Date.parse(note.createdAt || '');
  return Number.isFinite(createdAt) ? createdAt : Number(note.id) || 0;
}

function NoteFormatToolbar({ editorRef, label }) {
  const applyFormat = (format) => {
    editorRef.current?.focus();
    document.execCommand(format, false);
  };

  return (
    <div className="note-format-toolbar" role="toolbar" aria-label={`${label} formatting`}>
      <button type="button" aria-label="Bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat('bold')}><Bold size={15} /></button>
      <button type="button" aria-label="Italic" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat('italic')}><Italic size={15} /></button>
    </div>
  );
}

export default function NotesCard({ minimized = false, onToggleMinimize }) {
  const [notes, setNotes] = useState(() => storageManager.getStickyNotes() || []);
  const [categories, setCategories] = useState(() => storageManager.getNoteCategories());
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteTags, setNewNoteTags] = useState('');
  const [noteColor, setNoteColor] = useState('yellow');
  const [newNoteCategory, setNewNoteCategory] = useState('Inbox');
  const [showInput, setShowInput] = useState(false);
  const [sortOrder, setSortOrder] = useState('newest');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [draggedNoteId, setDraggedNoteId] = useState(null);

  // Track the note currently open in the full editor.
  const [activeNote, setActiveNote] = useState(null);
  const [activeTitle, setActiveTitle] = useState('');
  const [activeColor, setActiveColor] = useState('yellow');
  const [activeCategory, setActiveCategory] = useState('Inbox');
  const [activeTags, setActiveTags] = useState('');

  // Keep the delete confirmation visible while undo remains available.
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const newNoteEditorRef = useRef(null);
  const modalEditorRef = useRef(null);

  useEffect(() => {
    if (activeNote && modalEditorRef.current) {
      const legacyBody = activeNote.text || '';
      modalEditorRef.current.innerHTML = activeNote.body
        ? sanitizeRichText(activeNote.body)
        : sanitizeRichText(legacyBody, true);
      modalEditorRef.current.focus();
    }
  }, [activeNote]);

  useEffect(() => {
    if (showInput && newNoteEditorRef.current) {
      newNoteEditorRef.current.innerHTML = '';
      newNoteEditorRef.current.focus();
    }
  }, [showInput]);

  const handleAddNote = () => {
    const body = sanitizeRichText(newNoteEditorRef.current?.innerHTML || '');
    const text = richTextToPlainText(body).trim();
    const title = newNoteTitle.trim() || text.split(/\r?\n/).find((line) => line.trim())?.trim();
    if (!title && !text) return;

    const newNote = {
      id: Date.now(),
      title: title || 'Untitled note',
      text,
      body,
      color: noteColor,
      category: newNoteCategory,
      tags: parseTags(newNoteTags),
      createdAt: new Date().toISOString(),
    };

    const updated = [newNote, ...notes];
    setNotes(updated);
    storageManager.addStickyNote(newNote);
    storageManager.recordAnalyticsEvent({ type: 'note_created' });

    setNewNoteTitle('');
    setNewNoteText('');
    setNewNoteTags('');
    setNoteColor('yellow');
    setNewNoteCategory(selectedCategory === 'all' ? 'Inbox' : selectedCategory);
    setShowInput(false);
    if (newNoteEditorRef.current) newNoteEditorRef.current.innerHTML = '';
  };

  const handleCancelNewNote = () => {
    setShowInput(false);
    setNewNoteTitle('');
    setNewNoteText('');
    setNewNoteTags('');
    setNoteColor('yellow');
    setNewNoteCategory(selectedCategory === 'all' ? 'Inbox' : selectedCategory);
    if (newNoteEditorRef.current) newNoteEditorRef.current.innerHTML = '';
  };

  const triggerDeleteToast = (deletedNote) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);

    setToast({ note: deletedNote });

    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const handleUndoDelete = () => {
    if (!toast) return;

    const restoredNote = toast.note;
    const updated = sortOrder === 'newest' ? [restoredNote, ...notes] : [...notes, restoredNote];
    setNotes(updated);
    storageManager.addStickyNote(restoredNote);
    storageManager.recordAnalyticsEvent({ type: 'note_restored' });

    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(null);
  };

  const handleDeleteNote = (e, id) => {
    e?.stopPropagation();
    const targetNote = notes.find((n) => n.id === id);
    if (!targetNote) return;

    const updated = notes.filter((note) => note.id !== id);
    setNotes(updated);
    storageManager.deleteStickyNote(id);
    storageManager.recordAnalyticsEvent({ type: 'note_deleted' });

    if (activeNote?.id === id) {
      closeModalWithoutSaving();
    }

    triggerDeleteToast(targetNote);
  };

  const openNoteModal = (note) => {
    setActiveNote(note);
    setActiveTitle(getNoteTitle(note));
    setActiveColor(note.color || 'yellow');
    setActiveCategory(note.category || 'Inbox');
    setActiveTags((note.tags || []).join(', '));
  };

  const saveAndCloseModal = () => {
    if (!activeNote) return;

    const body = sanitizeRichText(modalEditorRef.current?.innerHTML || '');
    const text = richTextToPlainText(body).trim();
    const title = activeTitle.trim() || text.split(/\r?\n/).find((line) => line.trim())?.trim();
    if (!title && !text) {
      handleDeleteNote(null, activeNote.id);
      return;
    }

    const updated = notes.map((note) =>
      note.id === activeNote.id
        ? { ...note, title: title || 'Untitled note', text, body, color: activeColor, category: activeCategory, tags: parseTags(activeTags) }
        : note
    );

    setNotes(updated);
    storageManager.saveStickyNotes(updated);
    storageManager.recordAnalyticsEvent({ type: 'note_updated' });

    setActiveNote(null);
    setActiveTitle('');
  };

  const closeModalWithoutSaving = () => {
    setActiveNote(null);
    setActiveTitle('');
  };

  const reorderNotes = (targetId) => {
    if (draggedNoteId === null || draggedNoteId === targetId) return;
    const reordered = [...notes];
    const sourceIndex = reordered.findIndex((note) => note.id === draggedNoteId);
    const targetIndex = reordered.findIndex((note) => note.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [movedNote] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, movedNote);
    setNotes(reordered);
    storageManager.saveStickyNotes(reordered);
    setDraggedNoteId(null);
  };

  const sortedNotes = sortOrder === 'newest'
    ? [...notes].sort((left, right) => getCreatedAt(right) - getCreatedAt(left))
    : sortOrder === 'alphabetical'
      ? [...notes].sort((left, right) => getNoteTitle(left).localeCompare(getNoteTitle(right)))
      : notes;
  const visibleNotes = sortedNotes.filter((note) => selectedCategory === 'all' || (note.category || 'Inbox') === selectedCategory);

  const handleAddCategory = () => {
    const category = newCategoryName.trim();
    if (!category || categories.some((existing) => existing.toLowerCase() === category.toLowerCase())) return;
    const updated = [...categories, category];
    setCategories(updated);
    storageManager.saveNoteCategories(updated);
    setNewCategoryName('');
    setSelectedCategory(category);
    setNewNoteCategory(category);
    setIsAddingCategory(false);
  };

  const handleDeleteCategory = (category) => {
    if (category === 'Inbox' || !window.confirm(`Delete the "${category}" notes folder? Notes will be moved to Inbox.`)) return;
    const updatedCategories = categories.filter((item) => item !== category);
    const updatedNotes = notes.map((note) => (note.category || 'Inbox') === category ? { ...note, category: 'Inbox' } : note);
    setCategories(updatedCategories);
    setNotes(updatedNotes);
    storageManager.saveNoteCategories(updatedCategories);
    storageManager.saveStickyNotes(updatedNotes);
    if (selectedCategory === category) setSelectedCategory('Inbox');
    if (newNoteCategory === category) setNewNoteCategory('Inbox');
    if (activeCategory === category) setActiveCategory('Inbox');
  };

  const handleModalColorChange = (colorKey) => {
    setActiveColor(colorKey);
    if (!activeNote) return;

    const updated = notes.map((note) =>
      note.id === activeNote.id ? { ...note, color: colorKey } : note
    );
    setNotes(updated);
    storageManager.saveStickyNotes(updated);
  };

  if (minimized) {
    return (
      <button
        type="button"
        className="notes-minimized-button"
        onClick={onToggleMinimize}
        aria-label="Restore notes"
        title="Restore notes"
      >
        <StickyNote size={24} />
      </button>
    );
  }

  return (
    <div className="notes-card-container">
      {/* Note list title and creation controls. */}
      <div className="notes-header">
        <div className="notes-title-group">
          <h3>Notes</h3>
          <span className="notes-badge">{notes.length}</span>
        </div>
        <div className="notes-header-actions">
          <button
            onClick={() => {
              setNewNoteCategory(selectedCategory === 'all' ? 'Inbox' : selectedCategory);
              setShowInput((prev) => !prev);
            }}
            className={`notes-add-btn ${showInput ? 'active' : ''}`}
            title={showInput ? 'Close' : 'Add Note'}
            aria-label={showInput ? 'Close new note' : 'Add new note'}
            aria-expanded={showInput}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={onToggleMinimize}
            className="notes-minimize-btn"
            title="Minimize notes"
            aria-label="Minimize notes"
          >
            <Minimize2 size={15} />
          </button>
        </div>
      </div>

      {/* Compact previews for saved notes. */}
      <div className="notes-list">
          <>
          <div className="notes-folder-bar">
            <div className="notes-folder-controls">
              <div className="notes-folder-current" aria-label="Selected notes folder">
                {selectedCategory === 'all' ? (
                  <ListTodo size={15} aria-hidden="true" />
                ) : (
                  <Folder size={15} aria-hidden="true" style={{ color: FOLDER_COLORS[Math.max(0, categories.indexOf(selectedCategory)) % FOLDER_COLORS.length] }} />
                )}
                <span>{selectedCategory === 'all' ? 'All notes' : selectedCategory}</span>
                <span className="notes-folder-count">
                  {selectedCategory === 'all' ? notes.length : notes.filter((note) => (note.category || 'Inbox') === selectedCategory).length}
                </span>
              </div>
              <SelectDropdown
                label="Sort notes"
                value={sortOrder}
                options={[
                  { value: 'newest', label: 'Newest first' },
                  { value: 'alphabetical', label: 'Alphabetical' },
                  { value: 'custom', label: 'Custom order' },
                ]}
                onChange={setSortOrder}
                icon={ListFilter}
                iconOnly
                className="ui-select--icon"
              />
              <button
                type="button"
                className="notes-folder-new-button"
                onClick={() => setIsAddingCategory((adding) => !adding)}
                aria-expanded={isAddingCategory}
              >
                {isAddingCategory ? <X size={14} /> : <Plus size={14} />}
                <span>{isAddingCategory ? 'Cancel' : 'New folder'}</span>
              </button>
            </div>
            <div className="notes-folder-choices" aria-label="Notes folders">
              {selectedCategory !== 'all' && (
                <button type="button" className="notes-folder-chip" onClick={() => setSelectedCategory('all')}>
                  <ListTodo size={13} />
                  <span>All notes</span>
                  <span className="notes-folder-count">{notes.length}</span>
                </button>
              )}
              {categories.filter((category) => category !== selectedCategory).map((category) => {
                const folderIndex = categories.indexOf(category);
                return (
                  <div key={category} className="notes-folder-item">
                    <button type="button" className="notes-folder-chip" onClick={() => setSelectedCategory(category)}>
                      <Folder size={13} style={{ color: FOLDER_COLORS[Math.max(0, folderIndex) % FOLDER_COLORS.length] }} />
                      <span>{category}</span>
                      <span className="notes-folder-count">{notes.filter((note) => (note.category || 'Inbox') === category).length}</span>
                    </button>
                    {category !== 'Inbox' && (
                      <button
                        type="button"
                        className="notes-folder-delete"
                        aria-label={`Delete ${category} folder`}
                        title={`Delete ${category} folder`}
                        onClick={() => handleDeleteCategory(category)}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {isAddingCategory && (
              <form className="notes-add-folder" onSubmit={(event) => { event.preventDefault(); handleAddCategory(); }}>
                <FolderPlus size={14} aria-hidden="true" />
                <input
                  aria-label="New notes folder name"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="Folder name"
                  maxLength={32}
                  autoFocus
                />
                <button type="submit" aria-label="Create notes folder" title="Create folder"><Plus size={15} /></button>
              </form>
            )}
          </div>
          <div className="notes-list-toolbar">
            {sortOrder === 'custom' && <span className="notes-arrange-hint">Drag to arrange</span>}
          </div>
          {visibleNotes.length === 0 ? (
            <div className="notes-empty notes-folder-empty">
              <p>{notes.length === 0 ? 'No notes yet' : `No notes in ${selectedCategory === 'all' ? 'this view' : selectedCategory}.`}</p>
              <span>{notes.length === 0 ? 'Click "+" to add one' : 'Add a note to this folder or choose another folder.'}</span>
            </div>
          ) : visibleNotes.map((note) => {
            const theme = COLOR_PALETTE[note.color] || {
              bg: /^#[\da-f]{6}$/i.test(note.color || '') ? note.color : COLOR_PALETTE.yellow.bg,
            };

            return (
              <div
                key={note.id}
                className={`note-item-row ${sortOrder === 'custom' ? 'is-arrangeable' : ''} ${draggedNoteId === note.id ? 'is-dragging' : ''}`}
                draggable={sortOrder === 'custom'}
                onMouseDown={(event) => event.stopPropagation()}
                onDragStart={() => setDraggedNoteId(note.id)}
                onDragOver={(event) => { if (sortOrder === 'custom') event.preventDefault(); }}
                onDrop={(event) => { event.preventDefault(); reorderNotes(note.id); }}
                onDragEnd={() => setDraggedNoteId(null)}
                onClick={() => openNoteModal(note)}
              >
                {sortOrder === 'custom' && <GripVertical className="note-drag-handle" size={14} />}
                <div
                  className="color-indicator-dot"
                  style={{ backgroundColor: theme.bg }}
                />

                <p className="note-preview-text">{getNoteTitle(note)}</p>
                {note.tags?.length > 0 && (
                  <span className="note-preview-tags" aria-label={`Tags: ${note.tags.join(', ')}`}>
                    {note.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
                    {note.tags.length > 2 && <span>+{note.tags.length - 2}</span>}
                  </span>
                )}

                <div className="note-row-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openNoteModal(note);
                    }}
                    className="row-action-btn"
                    title="Open note"
                  >
                    <Maximize2 size={13} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteNote(e, note.id)}
                    className="row-action-btn delete"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
          </>
      </div>

      {showInput && createPortal((
        <div className="note-modal-backdrop" onMouseDown={(event) => event.stopPropagation()} onClick={handleCancelNewNote}>
          <div
            className="note-modal-card glassmorphism-card note-create-modal"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="note-modal-header note-create-header">
              <span className="note-create-heading">New note</span>
              <div className="color-selector-row">
                {Object.keys(COLOR_PALETTE).map((colorKey) => (
                  <button
                    key={colorKey}
                    type="button"
                    onClick={() => setNoteColor(colorKey)}
                    className={`color-swatch-small ${noteColor === colorKey ? 'selected' : ''}`}
                    style={{ '--swatch-bg': COLOR_PALETTE[colorKey].bg }}
                    title={colorKey}
                    aria-label={`${colorKey} note color`}
                  />
                ))}
              </div>
              <NoteFormatToolbar editorRef={newNoteEditorRef} label="New note" />
              <button className="modal-close-btn" onClick={handleCancelNewNote} aria-label="Discard new note">
                <X size={16} />
              </button>
            </div>
            <div className="note-modal-body hide-scrollbar">
              <div className="note-category-picker">
                <Folder size={14} aria-hidden="true" />
                <SelectDropdown
                  label="New note folder"
                  value={newNoteCategory}
                  options={categories.map((category) => ({ value: category, label: category }))}
                  onChange={setNewNoteCategory}
                  className="ui-select--folder"
                />
              </div>
              <input className="note-modal-title" value={newNoteTitle} onChange={(event) => setNewNoteTitle(event.target.value)} aria-label="Note title" placeholder="Note title" />
              <input className="note-modal-tags" value={newNoteTags} onChange={(event) => setNewNoteTags(event.target.value)} aria-label="Note tags" placeholder="Tags (comma separated)" />
              <div
                ref={newNoteEditorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label="Note text"
                aria-multiline="true"
                onMouseDown={(event) => event.stopPropagation()}
                onInput={(event) => setNewNoteText(event.currentTarget.innerText)}
                className="modal-direct-textarea note-modal-editor hide-scrollbar"
                data-placeholder="Write a note..."
              />
            </div>
            <div className="note-modal-footer note-create-footer">
              <button type="button" onClick={handleCancelNewNote} className="btn-tertiary">Cancel</button>
              <button type="button" onClick={handleAddNote} className="btn-primary" disabled={!newNoteTitle.trim() && !newNoteText.trim()}>Add note</button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Full-screen editor for the selected note. */}
      {activeNote && createPortal((
        <div className="note-modal-backdrop" onMouseDown={(event) => event.stopPropagation()} onClick={saveAndCloseModal}>
          <div
            className="note-modal-card glassmorphism-card"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="note-modal-header">
              <div className="color-selector-row">
                {Object.keys(COLOR_PALETTE).map((colorKey) => (
                  <button
                    key={colorKey}
                    type="button"
                    onClick={() => handleModalColorChange(colorKey)}
                    className={`color-swatch-small ${
                      activeColor === colorKey ? 'selected' : ''
                    }`}
                    style={{ '--swatch-bg': COLOR_PALETTE[colorKey].bg }}
                    title={colorKey}
                  />
                ))}
                {activeColor.startsWith('#') && (
                  <input
                    type="color"
                    aria-label="Custom note color"
                    value={activeColor}
                    onChange={(event) => handleModalColorChange(event.target.value)}
                  />
                )}
              </div>
              <NoteFormatToolbar editorRef={modalEditorRef} label="Note" />
              <button className="modal-close-btn" onClick={saveAndCloseModal} aria-label="Close note">
                <X size={16} />
              </button>
            </div>

            <div className="note-modal-body hide-scrollbar">
              <div className="note-category-picker">
                <Folder size={14} aria-hidden="true" />
                <SelectDropdown
                  label="Note folder"
                  value={activeCategory}
                  options={categories.map((category) => ({ value: category, label: category }))}
                  onChange={setActiveCategory}
                  className="ui-select--folder"
                />
              </div>
              <input className="note-modal-title" value={activeTitle} onChange={(event) => setActiveTitle(event.target.value)} aria-label="Note title" placeholder="Note title" />
              <input className="note-modal-tags" value={activeTags} onChange={(event) => setActiveTags(event.target.value)} aria-label="Note tags" placeholder="Tags (comma separated)" />
              <div ref={modalEditorRef} contentEditable suppressContentEditableWarning role="textbox" aria-label="Note text" aria-multiline="true" onMouseDown={(event) => event.stopPropagation()} className="modal-direct-textarea note-modal-editor hide-scrollbar" data-placeholder="Type your note here..." />
            </div>

            <div className="note-modal-footer">
              <span className="auto-save-hint">Auto-saves on exit</span>
              <button
                onClick={(e) => handleDeleteNote(e, activeNote.id)}
                className="btn-danger-ghost"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Confirm deletion and provide a short undo window. */}
      {toast && (
        <div className="notes-toast-confirm">
          <span>Note deleted</span>
          <button onClick={handleUndoDelete} className="toast-undo-btn">
            <Undo2 size={13} /> Undo
          </button>
        </div>
      )}
    </div>
  );
}