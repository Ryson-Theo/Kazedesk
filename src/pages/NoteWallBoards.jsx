import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, LayoutGrid, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { storageManager } from '../utils/localStorage';
import { deleteWallAttachment, saveWallAttachments } from '../utils/noteWallMedia';
import { createAttachmentIdMap, loadReferencedWallAttachments, remapBackupMediaFiles, remapWallAttachmentIds } from '../utils/backupArchive';
import { parseNoteWallBackupArchive, parseNoteWallBackupJSON } from '../utils/noteWallBackup';
import '../styles/NoteWallBoards.css';

export default function NoteWallBoards() {
  const navigate = useNavigate();
  const importFileRef = useRef(null);
  const [boards, setBoards] = useState(() => storageManager.getNoteWallBoards());
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');

  const createBoard = (event) => {
    event.preventDefault();
    try {
      const board = storageManager.createNoteWallBoard(newName);
      setBoards(storageManager.getNoteWallBoards());
      setNewName('');
      setError('');
      navigate(`/wall/boards/${board.id}`);
    } catch (createError) {
      setError(createError.message || 'Could not create this board.');
    }
  };

  const importBoardBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsImporting(true);
    setError('');
    try {
      const isZip = file.type === 'application/zip' || /\.zip$/i.test(file.name);
      const backup = isZip
        ? parseNoteWallBackupArchive(new Uint8Array(await file.arrayBuffer()))
        : null;
      const data = backup?.data || parseNoteWallBackupJSON(await file.text());
      if (data.context !== 'board') {
        throw new Error('Choose a custom board JSON or ZIP backup to import a new board.');
      }
      const idMap = createAttachmentIdMap([data.wall]);
      const wall = remapWallAttachmentIds(data.wall, idMap);
      const mediaFiles = isZip
        ? remapBackupMediaFiles(backup.mediaFiles, idMap)
        : await loadReferencedWallAttachments(data.wall, idMap);
      await saveWallAttachments(mediaFiles.map(({ id, blob }) => ({ id, blob })));
      const board = storageManager.importNoteWallBoard({
        ...data,
        name: data.boardName,
        wall,
      });
      setBoards(storageManager.getNoteWallBoards());
      navigate(`/wall/boards/${board.id}`);
    } catch (importError) {
      setError(importError.message || 'Could not import this board backup.');
    } finally {
      setIsImporting(false);
    }
  };

  const saveRename = (event) => {
    event.preventDefault();
    try {
      storageManager.updateNoteWallBoard(editingId, { name: editingName });
      setBoards(storageManager.getNoteWallBoards());
      setEditingId(null);
      setEditingName('');
      setError('');
    } catch (renameError) {
      setError(renameError.message || 'Could not rename this board.');
    }
  };

  const deleteBoard = async () => {
    if (!pendingDelete) return;
    let boardRemoved = false;
    try {
      const deleted = storageManager.deleteNoteWallBoard(pendingDelete.id);
      if (!deleted) throw new Error('This board no longer exists.');
      boardRemoved = true;
      setBoards(storageManager.getNoteWallBoards());
      setPendingDelete(null);
      await Promise.all(pendingDelete.wall.attachments.map((attachment) => deleteWallAttachment(attachment.id)));
      setError('');
    } catch (deleteError) {
      setError(boardRemoved
        ? `Board deleted, but some attachment files may remain in browser storage: ${deleteError.message || 'storage is unavailable.'}`
        : deleteError.message || 'Could not delete this board.');
    }
  };

  return (
    <main className="note-wall-boards-page">
      <header className="note-wall-boards-header">
        <Link to="/dashboard" aria-label="Back to dashboard"><ArrowLeft size={17} /> Dashboard</Link>
        <div>
          <span className="note-wall-boards-eyebrow"><LayoutGrid size={14} /> YOUR WORKSPACES</span>
          <h1>Note wall boards</h1>
          <p>Each board has its own notes, tasks, files, links, and layout. Your dashboard stays separate.</p>
        </div>
      </header>

      <section className="note-wall-boards-content" aria-labelledby="note-wall-boards-heading">
        <h2 id="note-wall-boards-heading">Your boards</h2>
        <div className="note-wall-board-list">
          <article className="note-wall-board-entry is-dashboard">
            <div className="note-wall-board-entry-copy">
              <span className="note-wall-board-entry-type">EXISTING WORKSPACE</span>
              <h3>Dashboard note wall</h3>
              <p>Uses your existing dashboard notes and tasks.</p>
            </div>
            <Link className="note-wall-board-open" to="/wall">Open wall <ArrowRight size={15} /></Link>
          </article>

          {boards.map((board) => (
            <article className="note-wall-board-entry" key={board.id}>
              {editingId === board.id ? (
                <form className="note-wall-board-rename" onSubmit={saveRename}>
                  <label htmlFor={`rename-board-${board.id}`}>Board name</label>
                  <input
                    id={`rename-board-${board.id}`}
                    autoFocus
                    maxLength={80}
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                  />
                  <button type="submit" className="note-wall-board-small-action">Save</button>
                  <button type="button" className="note-wall-board-small-action is-muted" onClick={() => setEditingId(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <div className="note-wall-board-entry-copy">
                    <span className="note-wall-board-entry-type">INDEPENDENT BOARD</span>
                    <h3>{board.name}</h3>
                    <p>{board.notes.length} notes · {board.tasks.length} tasks · {board.wall.attachments.length} files · {board.wall.webClips.length} links</p>
                  </div>
                  <div className="note-wall-board-entry-actions">
                    <Link className="note-wall-board-open" to={`/wall/boards/${board.id}`}>Open <ArrowRight size={15} /></Link>
                    <button
                      type="button"
                      className="note-wall-board-icon-action"
                      aria-label={`Rename ${board.name}`}
                      title="Rename board"
                      onClick={() => { setEditingId(board.id); setEditingName(board.name); setError(''); }}
                    ><Pencil size={15} /></button>
                    <button
                      type="button"
                      className="note-wall-board-icon-action is-danger"
                      aria-label={`Delete ${board.name}`}
                      title="Delete board"
                      onClick={() => { setPendingDelete(board); setError(''); }}
                    ><Trash2 size={15} /></button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>

        <form className="note-wall-board-create" onSubmit={createBoard}>
          <label htmlFor="new-note-wall-board">Create a new board</label>
          <div>
            <input
              id="new-note-wall-board"
              maxLength={80}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Project research"
            />
            <button type="submit" className="note-wall-board-create-button" disabled={!newName.trim()}>
              <Plus size={16} /> Create board
            </button>
          </div>
        </form>
        <div className="note-wall-board-import">
          <div>
            <h3>Import a board backup</h3>
            <p>JSON uses media already saved in this browser; ZIP backups include their media files.</p>
          </div>
          <button type="button" className="note-wall-board-open" disabled={isImporting} onClick={() => importFileRef.current?.click()}>
            <Upload size={15} /> {isImporting ? 'Importing…' : 'Choose JSON or ZIP'}
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".json,application/json,.zip,application/zip"
            aria-label="Choose board backup JSON or ZIP"
            hidden
            onChange={importBoardBackup}
          />
        </div>
        {error && <p className="note-wall-boards-error" role="alert">{error}</p>}
      </section>

      {pendingDelete && (
        <div className="note-wall-boards-backdrop" role="presentation" onClick={() => setPendingDelete(null)}>
          <section className="note-wall-boards-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-board-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-board-close" aria-label="Cancel delete board" onClick={() => setPendingDelete(null)}><X size={17} /></button>
            <h2 id="delete-board-title">Delete “{pendingDelete.name}”?</h2>
            <p>This permanently removes the board and its notes, tasks, links, and layout from this browser. Your dashboard and other boards are not affected.</p>
            <div className="note-wall-board-confirm-actions">
              <button type="button" className="note-wall-board-delete" onClick={deleteBoard}>Delete board</button>
              <button type="button" className="note-wall-board-small-action is-muted" onClick={() => setPendingDelete(null)}>Cancel</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
