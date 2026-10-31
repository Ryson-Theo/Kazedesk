import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlignCenter, ArrowLeft, Download, Eye, EyeOff, FileJson2, FilePlus2, FileText, Hand, Link2, Moon, Printer, Redo2, Save, StickyNote, Sun, Trash2, Undo2, Unlink, X, ZoomIn, ZoomOut } from 'lucide-react';
import { storageManager } from '../utils/localStorage';
import { exportWallJSON, exportWallMarkdown, exportWallPNG, getNotePlainText, getWallNoteTitle } from '../utils/noteWallExports';
import { tidyWallLayout } from '../utils/noteWallLayout';
import { addRelatedWallConnections, getWallRelationColor } from '../utils/noteWallRelations';
import { recolorIntersectingConnections } from '../utils/noteWallIntersections';
import { getWallAttachment, MAX_WALL_ATTACHMENT_SIZE, pruneWallAttachments, saveWallAttachment, validateWallAttachment } from '../utils/noteWallMedia';
import '../styles/NoteWall.css';

const GOOGLE_DRIVE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const CARD_WIDTH = 250;
const CARD_HEIGHT = 190;
const NOTE_COLORS = {
  yellow: '#fef08a',
  pink: '#fbcfe8',
  blue: '#bae6fd',
  green: '#bbf7d0',
  purple: '#e9d5ff',
  orange: '#fed7aa',
};
const CONNECTION_ANCHORS = ['top', 'right', 'bottom', 'left'];
const ANCHOR_DIRECTIONS = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
const DEFAULT_ATTACHMENT_SIZE = { width: 300, height: 250 };

function getNextAttachmentPosition(wall, notes, tasks) {
  const occupied = [
    ...notes.map((note) => ({
      position: wall.positions[note.id] || { x: 30, y: 30 },
      size: wall.sizes?.[note.id] || { width: CARD_WIDTH, height: CARD_HEIGHT },
    })),
    ...(wall.attachments || []).map((attachment) => ({
      position: wall.positions[attachment.id] || { x: 30, y: 30 },
      size: wall.sizes?.[attachment.id] || DEFAULT_ATTACHMENT_SIZE,
    })),
    ...tasks.map((task) => ({ position: wall.taskPositions?.[task.id] || { x: 900, y: 42 }, size: { width: 180, height: 42 } })),
  ];
  let index = occupied.length;
  let candidate;
  do {
    candidate = { x: 38 + (index % 3) * 330, y: 42 + Math.floor(index / 3) * 275 };
    index += 1;
  } while (occupied.some(({ position, size }) =>
    candidate.x < position.x + size.width + 24 && candidate.x + DEFAULT_ATTACHMENT_SIZE.width + 24 > position.x
    && candidate.y < position.y + size.height + 24 && candidate.y + DEFAULT_ATTACHMENT_SIZE.height + 24 > position.y));
  return candidate;
}

function withoutWallAttachment(wall, id) {
  const positions = { ...wall.positions };
  const sizes = { ...wall.sizes };
  delete positions[id];
  delete sizes[id];
  return {
    ...wall,
    attachments: (wall.attachments || []).filter((item) => item.id !== id),
    positions,
    sizes,
    connections: wall.connections.filter((connection) =>
      !((connection.fromType === 'attachment' && connection.from === id)
        || (connection.toType === 'attachment' && connection.to === id))),
  };
}

function getAnchorPoint(position, dimensions, anchor = 'auto') {
  if (anchor === 'auto') return { x: position.x + dimensions.width / 2, y: position.y + dimensions.height / 2 };
  switch (anchor) {
    case 'top': return { x: position.x + dimensions.width / 2, y: position.y };
    case 'right': return { x: position.x + dimensions.width, y: position.y + dimensions.height / 2 };
    case 'bottom': return { x: position.x + dimensions.width / 2, y: position.y + dimensions.height };
    case 'left': return { x: position.x, y: position.y + dimensions.height / 2 };
    default: return { x: position.x + dimensions.width / 2, y: position.y + dimensions.height / 2 };
  }
}

function getNearestAnchor(point, position, dimensions) {
  const distances = {
    top: Math.abs(point.y - position.y),
    right: Math.abs(point.x - position.x - dimensions.width),
    bottom: Math.abs(point.y - position.y - dimensions.height),
    left: Math.abs(point.x - position.x),
  };
  return CONNECTION_ANCHORS.reduce((closest, anchor) => distances[anchor] < distances[closest] ? anchor : closest, 'top');
}

function getConnectionPath(start, end, fromAnchor, toAnchor, curved) {
  if (!curved) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const startDirection = ANCHOR_DIRECTIONS[fromAnchor] || { x: 0, y: 0 };
  const endDirection = ANCHOR_DIRECTIONS[toAnchor] || { x: 0, y: 0 };
  const distance = Math.max(50, Math.hypot(end.x - start.x, end.y - start.y) * 0.35);
  const control1 = { x: start.x + startDirection.x * distance, y: start.y + startDirection.y * distance };
  const control2 = { x: end.x + endDirection.x * distance, y: end.y + endDirection.y * distance };
  return `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`;
}

function formatTaskReminder(value) {
  if (!value) return 'No time set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No time set';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

async function getGoogleToken() {
  if (!GOOGLE_DRIVE_CLIENT_ID) throw new Error('Google Drive is not configured. Set VITE_GOOGLE_CLIENT_ID to enable it.');
  if (!window.google?.accounts?.oauth2) {
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('Could not load Google sign-in.')), { once: true });
        if (window.google?.accounts?.oauth2) resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load Google sign-in.'));
      document.head.appendChild(script);
    });
  }
  return new Promise((resolve, reject) => {
    window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response) => {
        if (response.error || !response.access_token) reject(new Error(response.error_description || response.error || 'Google sign-in failed.'));
        else resolve(response.access_token);
      },
    }).requestAccessToken();
  });
}

async function savePrivateDriveFile(token, data, fileId) {
  const endpoint = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const body = JSON.stringify(data, null, 2);
  const options = { method: fileId ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}` } };
  if (fileId) {
    options.headers['Content-Type'] = 'application/json';
    options.body = body;
  } else {
    const boundary = `kazedesk_${crypto.randomUUID()}`;
    options.headers['Content-Type'] = `multipart/related; boundary=${boundary}`;
    options.body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: 'Kazedesk sticky note wall.json', mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  }
  const response = await fetch(endpoint, options);
  if (!response.ok) throw new Error(`Google Drive save failed (${response.status}): ${await response.text()}`);
  return fileId || (await response.json()).id;
}

export default function NoteWall() {
  const [notes, setNotes] = useState(() => storageManager.getStickyNotes());
  const [tasks, setTasks] = useState(() => storageManager.getTasks());
  const [categories] = useState(() => storageManager.getNoteCategories());
  const [wall, setWallState] = useState(() => storageManager.getNoteWall());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [groupFilter, setGroupFilter] = useState('all');
  const [connectionFrom, setConnectionFrom] = useState('');
  const [connectionTo, setConnectionTo] = useState('');
  const [connectionColor, setConnectionColor] = useState('#a5b4fc');
  const [connectionStyle, setConnectionStyle] = useState('dotted');
  const [connectionCurved, setConnectionCurved] = useState(true);
  const [connectionFromAnchor, setConnectionFromAnchor] = useState('right');
  const [connectionToAnchor, setConnectionToAnchor] = useState('left');
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [driveStatus, setDriveStatus] = useState('');
  const [wallSaveStatus, setWallSaveStatus] = useState('Changes save automatically in this browser');
  const [attachmentStatus, setAttachmentStatus] = useState('');
  const [pendingDeleteAttachment, setPendingDeleteAttachment] = useState(null);
  const [attachmentUrls, setAttachmentUrls] = useState({});
  const [attachmentErrors, setAttachmentErrors] = useState({});
  const [isAddingAttachment, setIsAddingAttachment] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printScale, setPrintScale] = useState(1);
  const [theme, setTheme] = useState(() => localStorage.getItem('kazedesk-landing-theme') === 'light' ? 'light' : 'dark');
  const [zoom, setZoom] = useState(1);
  const [panMode, setPanMode] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);
  const [showTidyConfirmation, setShowTidyConfirmation] = useState(false);
  const [hideOrphanTasks, setHideOrphanTasks] = useState(false);
  const [connectionPreview, setConnectionPreview] = useState(null);
  const boardRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const connectionPanelRef = useRef(null);
  const gestureRef = useRef(null);
  const nextSaveMessageRef = useRef('');
  const wallHistoryRef = useRef({ past: [], future: [], timer: null });
  const wallRef = useRef(wall);

  const refreshHistoryAvailability = () => {
    setCanUndo(wallHistoryRef.current.past.length > 0);
    setCanRedo(wallHistoryRef.current.future.length > 0);
  };

  const setWall = (updater, recordHistory = true) => {
    const current = wallRef.current;
    const next = typeof updater === 'function' ? updater(current) : updater;
    if (next === current) return;
    const history = wallHistoryRef.current;
    if (recordHistory) {
      if (history.timer === null) history.past.push(current);
      if (history.past.length > 100) history.past.shift();
      history.future = [];
      window.clearTimeout(history.timer);
      history.timer = window.setTimeout(() => {
        history.timer = null;
      }, 500);
    }
    wallRef.current = next;
    setWallState(next);
    refreshHistoryAvailability();
  };

  const undoWallChange = () => {
    const history = wallHistoryRef.current;
    if (!history.past.length) return;
    window.clearTimeout(history.timer);
    history.timer = null;
    history.future.push(wallRef.current);
    const previous = history.past.pop();
    wallRef.current = previous;
    nextSaveMessageRef.current = 'Undo saved locally';
    setWallState(previous);
    refreshHistoryAvailability();
  };

  const redoWallChange = () => {
    const history = wallHistoryRef.current;
    if (!history.future.length) return;
    window.clearTimeout(history.timer);
    history.timer = null;
    history.past.push(wallRef.current);
    const next = history.future.pop();
    wallRef.current = next;
    nextSaveMessageRef.current = 'Redo saved locally';
    setWallState(next);
    refreshHistoryAvailability();
  };

  useEffect(() => () => window.clearTimeout(wallHistoryRef.current.timer), []);

  useEffect(() => {
    pruneWallAttachments(() => (wallRef.current.attachments || []).map((attachment) => attachment.id))
      .catch((error) => setAttachmentStatus(error.message || 'Could not clean up removed attachments.'));
  }, []);

  useLayoutEffect(() => {
    localStorage.setItem('kazedesk_note_wall_visited', 'true');
    window.dispatchEvent(new Event('kazedesk-note-wall-visited'));
  }, []);

  useEffect(() => {
    const syncNotes = (event) => {
      if (event.key === 'kazedesk_sticky_notes') setNotes(storageManager.getStickyNotes());
      if (event.key === 'kazedesk_tasks') setTasks(storageManager.getTasks());
    };
    window.addEventListener('storage', syncNotes);
    return () => window.removeEventListener('storage', syncNotes);
  }, []);

  useEffect(() => {
    setWall((previous) => {
      const positions = { ...previous.positions };
      let changed = false;
      notes.forEach((note) => {
        if (!positions[note.id]) {
          let index = 0;
          let candidate;
          do {
            candidate = { x: 38 + (index % 3) * 300, y: 42 + Math.floor(index / 3) * 245 };
            index += 1;
          } while (Object.values(positions).some((position) => position.x === candidate.x && position.y === candidate.y));
          positions[note.id] = candidate;
          changed = true;
        }
      });
      Object.keys(positions).forEach((id) => {
        if (!notes.some((note) => String(note.id) === String(id))
          && !(previous.attachments || []).some((attachment) => String(attachment.id) === String(id))) {
          delete positions[id];
          changed = true;
        }
      });
      const taskPositions = { ...(previous.taskPositions || {}) };
      tasks.forEach((task, index) => {
        if (!taskPositions[task.id]) {
          taskPositions[task.id] = { x: 900, y: 42 + index * 72 };
          changed = true;
        }
      });
      Object.keys(taskPositions).forEach((id) => {
        if (!tasks.some((task) => String(task.id) === String(id))) {
          delete taskPositions[id];
          changed = true;
        }
      });
      const hasEndpoint = (connection, side) => {
        const type = connection[`${side}Type`] || 'note';
        const id = connection[side];
        return type === 'task'
          ? tasks.some((task) => String(task.id) === String(id))
          : type === 'attachment'
            ? (previous.attachments || []).some((attachment) => String(attachment.id) === String(id))
            : notes.some((note) => String(note.id) === String(id));
      };
      const connections = previous.connections.filter((connection) => hasEndpoint(connection, 'from') && hasEndpoint(connection, 'to'));
      if (connections.length !== previous.connections.length) changed = true;
      return changed ? { ...previous, positions, taskPositions, connections } : previous;
    }, false);
  }, [notes, tasks]);

  useEffect(() => {
    try {
      storageManager.saveNoteWall(wall);
      setWallSaveStatus(nextSaveMessageRef.current || 'Changes saved locally');
      nextSaveMessageRef.current = '';
    } catch (error) {
      setWallSaveStatus(`Could not save locally: ${error.message || 'browser storage is unavailable'}`);
      nextSaveMessageRef.current = '';
    }
  }, [wall]);

  useEffect(() => {
    let active = true;
    const objectUrls = [];
    const loadAttachments = async () => {
      const urls = {};
      const errors = {};
      await Promise.all((wall.attachments || []).map(async (attachment) => {
        try {
          const blob = await getWallAttachment(attachment.id);
          if (!active) return;
          urls[attachment.id] = URL.createObjectURL(blob);
          objectUrls.push(urls[attachment.id]);
        } catch (error) {
          errors[attachment.id] = error.message || 'Could not load this attachment.';
        }
      }));
      if (active) {
        setAttachmentUrls(urls);
        setAttachmentErrors(errors);
        if (Object.keys(errors).length) {
          setAttachmentStatus('Some attachments could not be loaded from browser storage.');
        }
      }
    };
    loadAttachments();
    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [wall.attachments]);

  useEffect(() => {
    const connections = recolorIntersectingConnections(wall.connections, notes, tasks, wall, theme);
    if (!connections.some((connection, index) => connection !== wall.connections[index])) return;
    nextSaveMessageRef.current = 'Line colors updated for crossings · saved locally';
    setWall((current) => ({ ...current, connections }), false);
  }, [notes, tasks, theme, wall]);

  const tags = useMemo(() => [...new Set(notes.flatMap((note) => note.tags || []))].sort((a, b) => a.localeCompare(b)), [notes]);
  const visibleNotes = useMemo(
    () => notes.filter((note) => {
      if (groupFilter === 'all') return true;
      if (groupFilter.startsWith('tag:')) return note.tags?.includes(groupFilter.slice(4));
      return (note.category || 'Inbox') === groupFilter.slice(7);
    }),
    [groupFilter, notes],
  );
  const visibleTasks = useMemo(() => {
    const eligibleTasks = hideOrphanTasks
      ? tasks.filter((task) => (task.category || 'Inbox') !== 'Inbox')
      : tasks;
    if (groupFilter.startsWith('folder:')) return eligibleTasks.filter((task) => (task.category || 'Inbox') === groupFilter.slice(7));
    return groupFilter.startsWith('tag:') ? [] : eligibleTasks;
  }, [groupFilter, hideOrphanTasks, tasks]);
  const visibleAttachments = useMemo(
    () => (wall.attachments || []).filter(() => groupFilter === 'all' || groupFilter === 'folder:Inbox'),
    [groupFilter, wall.attachments],
  );
  const visibleEndpoint = (connection, side) => {
    const type = connection[`${side}Type`] || 'note';
    const id = String(connection[side]);
    return type === 'task'
      ? visibleTasks.some((task) => String(task.id) === id)
      : type === 'attachment'
        ? visibleAttachments.some((attachment) => String(attachment.id) === id)
        : visibleNotes.some((note) => String(note.id) === id);
  };
  const visibleConnections = wall.connections.filter((connection) => visibleEndpoint(connection, 'from') && visibleEndpoint(connection, 'to'));
  const selectedConnection = wall.connections.find((connection) => connection.id === selectedConnectionId);
  const selectedCard = notes.find((note) => String(note.id) === String(selectedCardId));
  const boardSize = [...visibleNotes, ...visibleAttachments].reduce((size, note) => {
    const position = wall.positions[note.id] || { x: 30, y: 30 };
    const dimensions = wall.sizes?.[note.id] || (note.mediaType ? DEFAULT_ATTACHMENT_SIZE : { width: CARD_WIDTH, height: CARD_HEIGHT });
    return {
      width: Math.max(size.width, position.x + dimensions.width + 100),
      height: Math.max(size.height, position.y + dimensions.height + 100),
    };
  }, { width: 1800, height: 1200 });
  const boardWithTasks = visibleTasks.reduce((size, task) => {
    const position = wall.taskPositions?.[task.id] || { x: 900, y: 42 };
    return { width: Math.max(size.width, position.x + 190), height: Math.max(size.height, position.y + 90) };
  }, boardSize);

  const handleAttachmentSelection = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsAddingAttachment(true);
    setAttachmentStatus(`Adding ${file.name}…`);
    try {
      const { mimeType, mediaType } = validateWallAttachment(file);
      const id = crypto.randomUUID();
      await saveWallAttachment(id, file);
      const attachment = { id, name: file.name, mimeType, mediaType, size: file.size, category: 'Inbox' };
      setWall((current) => ({
        ...current,
        attachments: [...(current.attachments || []), attachment],
        positions: { ...current.positions, [id]: getNextAttachmentPosition(current, notes, tasks) },
        sizes: { ...current.sizes, [id]: DEFAULT_ATTACHMENT_SIZE },
      }));
      setAttachmentStatus(`${file.name} added to the wall.`);
    } catch (error) {
      setAttachmentStatus(error.message || 'Could not add this attachment.');
    } finally {
      setIsAddingAttachment(false);
    }
  };

  const removeAttachment = async (attachment) => {
    setPendingDeleteAttachment(attachment);
  };

  const confirmRemoveAttachment = () => {
    if (!pendingDeleteAttachment) return;
    const attachment = pendingDeleteAttachment;
    window.clearTimeout(wallHistoryRef.current.timer);
    wallHistoryRef.current.timer = null;
    setWall((current) => withoutWallAttachment(current, attachment.id));
    setPendingDeleteAttachment(null);
    setAttachmentStatus(`${attachment.name} removed from the wall. Use Undo to restore it.`);
  };

  const getEndpointLabel = (type, id) => {
    if (type === 'task') return tasks.find((task) => String(task.id) === String(id))?.title || 'task';
    if (type === 'attachment') return wall.attachments?.find((item) => String(item.id) === String(id))?.name || 'attachment';
    return getWallNoteTitle(notes.find((note) => String(note.id) === String(id)) || {});
  };

  useEffect(() => {
    if (!isPrinting) return undefined;
    const timer = window.setTimeout(() => window.print(), 80);
    const afterPrint = () => setIsPrinting(false);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, [isPrinting]);

  const getBoardPoint = useCallback((event) => {
    const bounds = boardRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left + boardRef.current.scrollLeft) / zoom,
      y: (event.clientY - bounds.top + boardRef.current.scrollTop) / zoom,
    };
  }, [zoom]);

  useEffect(() => {
    const moveGesture = (event) => {
      const gesture = gestureRef.current;
      if (!gesture || !boardRef.current) return;
      if (gesture.type === 'pan') {
        boardRef.current.scrollLeft = gesture.scrollLeft - (event.clientX - gesture.clientX);
        boardRef.current.scrollTop = gesture.scrollTop - (event.clientY - gesture.clientY);
        return;
      }
      const point = getBoardPoint(event);
      if (gesture.type === 'move-node') {
        const nextPosition = { x: Math.max(0, point.x - gesture.offsetX), y: Math.max(0, point.y - gesture.offsetY) };
        if (gesture.nodeType === 'task') {
          setWall((current) => ({ ...current, taskPositions: { ...current.taskPositions, [gesture.id]: nextPosition } }));
        } else {
        setWall((current) => ({
          ...current,
          positions: {
            ...current.positions,
            [gesture.id]: nextPosition,
          },
        }));
        }
      } else if (gesture.type === 'resize') {
        setWall((current) => ({
          ...current,
          sizes: {
            ...current.sizes,
            [gesture.id]: {
              width: Math.max(180, gesture.width + point.x - gesture.startX),
              height: Math.max(150, gesture.height + point.y - gesture.startY),
            },
          },
        }));
      } else if (gesture.type === 'connect') {
        setConnectionPreview({ from: gesture.id, fromType: gesture.nodeType || 'note', anchor: gesture.anchor, ...point });
      }
    };

    const endGesture = (event) => {
      const gesture = gestureRef.current;
      if (gesture?.type === 'connect') {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-node-id]');
        const to = target?.getAttribute('data-node-id');
        const toType = target?.getAttribute('data-node-type') || 'note';
        if (to && !(toType === (gesture.nodeType || 'note') && String(to) === String(gesture.id))) {
          const targetNotePosition = toType === 'task'
            ? wall.taskPositions?.[to] || { x: 30, y: 30 }
            : wall.positions[to] || { x: 30, y: 30 };
          const targetNoteSize = toType === 'task'
            ? { width: 180, height: 42 }
            : wall.sizes?.[to] || (toType === 'attachment' ? DEFAULT_ATTACHMENT_SIZE : { width: CARD_WIDTH, height: CARD_HEIGHT });
          const pointer = getBoardPoint(event);
          const fromType = gesture.nodeType || 'note';
          const task = fromType === 'task'
            ? tasks.find((item) => String(item.id) === String(gesture.id))
            : toType === 'task' ? tasks.find((item) => String(item.id) === String(to)) : null;
          const relationColor = task ? getWallRelationColor(`folder:${task.category || 'Inbox'}`) : connectionColor;
          setWall((current) => ({
            ...current,
            connections: [...current.connections, {
              id: crypto.randomUUID(),
              from: String(gesture.id),
              to,
              fromType,
              toType,
              color: task ? relationColor : connectionColor,
              ...(task ? { baseColor: relationColor, managedColor: true } : { customColor: true }),
              style: task ? 'dashed' : connectionStyle,
              curved: connectionCurved,
              fromAnchor: gesture.anchor,
              toAnchor: getNearestAnchor(pointer, targetNotePosition, targetNoteSize),
            }],
          }));
          setSelectedConnectionId(null);
        }
      }
      gestureRef.current = null;
      setConnectionPreview(null);
    };

    window.addEventListener('pointermove', moveGesture);
    window.addEventListener('pointerup', endGesture);
    window.addEventListener('pointercancel', endGesture);
    return () => {
      window.removeEventListener('pointermove', moveGesture);
      window.removeEventListener('pointerup', endGesture);
      window.removeEventListener('pointercancel', endGesture);
    };
  }, [connectionColor, connectionCurved, connectionStyle, getBoardPoint, tasks, wall.positions, wall.sizes, wall.taskPositions]);

  const startPan = (event) => {
    if (!panMode || event.target.closest('.note-wall-card, .note-wall-attachment, .note-wall-task') || event.target.closest('button')) return;
    event.preventDefault();
    gestureRef.current = {
      type: 'pan',
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: boardRef.current.scrollLeft,
      scrollTop: boardRef.current.scrollTop,
    };
  };

  const zoomAt = useCallback((nextZoom, clientX, clientY) => {
    if (!boardRef.current) return;
    const viewport = boardRef.current;
    const bounds = viewport.getBoundingClientRect();
    const pointX = (viewport.scrollLeft + clientX - bounds.left) / zoom;
    const pointY = (viewport.scrollTop + clientY - bounds.top) / zoom;
    const boundedZoom = Math.min(2.5, Math.max(0.25, nextZoom));
    setZoom(boundedZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = pointX * boundedZoom - (clientX - bounds.left);
      viewport.scrollTop = pointY * boundedZoom - (clientY - bounds.top);
    });
  }, [zoom]);

  const handleBoardWheel = useCallback((event) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomAt(zoom * (event.deltaY < 0 ? 1.1 : 0.9), event.clientX, event.clientY);
    } else if (event.shiftKey) {
      event.preventDefault();
      boardRef.current.scrollLeft += event.deltaY || event.deltaX;
    }
  }, [zoom, zoomAt]);

  useEffect(() => {
    const viewport = boardRef.current;
    if (!viewport) return undefined;
    viewport.addEventListener('wheel', handleBoardWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleBoardWheel);
  }, [handleBoardWheel]);

  useEffect(() => {
    if (!selectedNote) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedNote(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedNote]);

  useEffect(() => {
    if (!pendingDeleteAttachment) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setPendingDeleteAttachment(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [pendingDeleteAttachment]);

  const addConnection = (event) => {
    event.preventDefault();
    if (!connectionFrom || !connectionTo || connectionFrom === connectionTo) return;
    setWall((current) => ({
      ...current,
      connections: [...current.connections, {
        id: crypto.randomUUID(),
        from: connectionFrom,
        to: connectionTo,
        fromType: 'note',
        toType: 'note',
        color: connectionColor,
        customColor: true,
        style: connectionStyle,
        curved: connectionCurved,
        fromAnchor: connectionFromAnchor,
        toAnchor: connectionToAnchor,
      }],
    }));
  };

  const autoConnectRelated = () => {
    setWall((current) => {
      const connections = addRelatedWallConnections(visibleNotes, visibleTasks, current.connections);
      const addedCount = connections.length - current.connections.length;
      if (!addedCount) return current;
      nextSaveMessageRef.current = `Saved locally · added ${addedCount} related ${addedCount === 1 ? 'line' : 'lines'}`;
      return { ...current, connections };
    });
  };

  const updateSelectedConnection = (updates) => {
    if (!selectedConnectionId) return;
    setWall((current) => ({
      ...current,
      connections: current.connections.map((connection) =>
        connection.id === selectedConnectionId
          ? { ...connection, ...updates, ...(Object.hasOwn(updates, 'color') ? { managedColor: false, customColor: true } : {}) }
          : connection
      ),
    }));
  };

  const updateSelectedCardColor = (color) => {
    if (selectedCardId === null) return;
    const updatedNotes = notes.map((note) => String(note.id) === String(selectedCardId) ? { ...note, color } : note);
    storageManager.saveStickyNotes(updatedNotes);
    setNotes(updatedNotes);
  };

  const openConnectionPanel = () => {
    if (connectionPanelRef.current) connectionPanelRef.current.open = true;
  };

  const selectConnection = (id) => {
    setSelectedConnectionId(id);
    setSelectedCardId(null);
    openConnectionPanel();
  };

  const selectCard = (id) => {
    setSelectedCardId(id);
    setSelectedConnectionId(null);
    openConnectionPanel();
  };

  const tidyAndCenterBoard = (clearConnections = false) => {
    if (!visibleNotes.length && !visibleTasks.length && !visibleAttachments.length) return;
    const tidyEligibleConnections = wall.connections.filter((connection) => {
      const fromIsInboxTask = (connection.fromType || 'note') === 'task'
        && (tasks.find((task) => String(task.id) === String(connection.from))?.category || 'Inbox') === 'Inbox';
      const toIsInboxTask = (connection.toType || 'note') === 'task'
        && (tasks.find((task) => String(task.id) === String(connection.to))?.category || 'Inbox') === 'Inbox';
      return !fromIsInboxTask && !toIsInboxTask;
    });
    const sourceConnections = clearConnections
      ? []
      : addRelatedWallConnections(visibleNotes, visibleTasks, tidyEligibleConnections);
    const taskNodes = visibleTasks.map((task) => ({ ...task, type: 'task', wallKey: `task:${task.id}` }));
    const attachmentNodes = visibleAttachments.map((attachment) => ({ ...attachment, type: 'attachment' }));
    const layout = tidyWallLayout([...visibleNotes, ...attachmentNodes], { ...wall, connections: sourceConnections }, taskNodes);
    const contentNodes = [
      ...visibleNotes.map((note) => ({ ...note, type: 'note' })),
      ...attachmentNodes,
      ...taskNodes,
    ];
    const contentBounds = contentNodes.reduce((bounds, node) => {
      const isTask = node.type === 'task';
      const position = isTask ? layout.taskPositions[node.id] : layout.positions[node.id];
      if (!position) return bounds;
      const dimensions = isTask
        ? { width: 180, height: 42 }
        : wall.sizes?.[node.id] || (node.type === 'attachment' ? DEFAULT_ATTACHMENT_SIZE : { width: CARD_WIDTH, height: CARD_HEIGHT });
      return {
        left: Math.min(bounds.left, position.x),
        top: Math.min(bounds.top, position.y),
        right: Math.max(bounds.right, position.x + dimensions.width),
        bottom: Math.max(bounds.bottom, position.y + dimensions.height),
      };
    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const safeBounds = Number.isFinite(contentBounds.left) ? contentBounds : { left: 0, top: 0, right: CARD_WIDTH, bottom: CARD_HEIGHT };
    const viewportWidth = boardRef.current?.clientWidth || window.innerWidth;
    const viewportHeight = boardRef.current?.clientHeight || window.innerHeight;
    const offsetX = Math.max(0, (viewportWidth / zoom - (safeBounds.right - safeBounds.left)) / 2 - safeBounds.left);
    const offsetY = Math.max(0, (viewportHeight / zoom - (safeBounds.bottom - safeBounds.top)) / 2 - safeBounds.top);
    const centeredPositions = Object.fromEntries(Object.entries(layout.positions).map(([id, position]) => [
      id,
      { x: position.x + offsetX, y: position.y + offsetY },
    ]));
    const centeredTaskPositions = Object.fromEntries(Object.entries(layout.taskPositions).map(([id, position]) => [
      id,
      { x: position.x + offsetX, y: position.y + offsetY },
    ]));
    const addedLineCount = sourceConnections.length - (clearConnections ? 0 : tidyEligibleConnections.length);
    nextSaveMessageRef.current = clearConnections
      ? 'Board tidied and all lines cleared · saved locally'
      : `Board tidied and saved locally${addedLineCount ? ` · added ${addedLineCount} related ${addedLineCount === 1 ? 'line' : 'lines'}` : ''}`;
    setWall((current) => ({
      ...current,
      positions: { ...current.positions, ...centeredPositions },
      taskPositions: { ...current.taskPositions, ...centeredTaskPositions },
      connections: clearConnections ? [] : layout.connections,
    }));
    setSelectedCardId(null);
    setSelectedConnectionId(null);
    setShowTidyConfirmation(false);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!boardRef.current) return;
      const centerX = (safeBounds.left + offsetX + safeBounds.right + offsetX) / 2;
      const centerY = (safeBounds.top + offsetY + safeBounds.bottom + offsetY) / 2;
      boardRef.current.scrollLeft = Math.max(0, centerX * zoom - boardRef.current.clientWidth / 2);
      boardRef.current.scrollTop = Math.max(0, centerY * zoom - boardRef.current.clientHeight / 2);
    }));
  };

  const saveToDrive = async () => {
    setDriveStatus('Connecting to Google Drive…');
    try {
      const token = await getGoogleToken();
      const data = {
        app: 'Kazedesk',
        type: 'sticky-note-wall',
        version: 1,
        exportedAt: new Date().toISOString(),
        categories,
        notes,
        wall,
      };
      const storedId = localStorage.getItem('kazedesk_note_wall_drive_file_id');
      const fileId = await savePrivateDriveFile(token, data, storedId);
      localStorage.setItem('kazedesk_note_wall_drive_file_id', fileId);
      setDriveStatus('Saved privately to your Google Drive.');
    } catch (error) {
      setDriveStatus(error.message || 'Could not save the wall to Google Drive.');
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('kazedesk-landing-theme', nextTheme);
  };

  return (
    <main className={`note-wall-page landing-theme-${theme}${isPrinting ? ' is-printing' : ''}`}>
      <header className="note-wall-toolbar">
        <div className="note-wall-heading">
          <Link to="/dashboard" aria-label="Back to dashboard"><ArrowLeft size={18} /> Dashboard</Link>
          <div><h1>Sticky note wall</h1><span>{notes.length} notes · {tasks.length} tasks · {wall.attachments?.length || 0} attachments · changes save in this browser</span></div>
        </div>
        <div className="note-wall-export-actions">
          <button type="button" className="note-wall-theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button type="button" onClick={() => exportWallPNG(visibleNotes, wall, visibleTasks, visibleAttachments, attachmentUrls).catch((error) => setDriveStatus(error.message))}><Download size={15} /> PNG</button>
          <button type="button" onClick={() => {
            setPrintScale(Math.min(1, (window.innerWidth - 80) / boardWithTasks.width, (window.innerHeight - 160) / boardWithTasks.height));
            setIsPrinting(true);
          }}><Printer size={15} /> PDF</button>
          <button type="button" onClick={() => exportWallMarkdown(notes, wall.attachments || [])}><FileText size={15} /> Markdown</button>
          <button type="button" onClick={() => exportWallJSON(notes, categories, wall)}><FileJson2 size={15} /> JSON</button>
          <button type="button" onClick={saveToDrive}><Save size={15} /> Save to Drive</button>
        </div>
      </header>

      <section className="note-wall-controls" aria-label="Wall controls">
        <div className="note-wall-toolbar-main">
          <input
            ref={attachmentInputRef}
            className="note-wall-file-input"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/avif,application/pdf,audio/*"
            aria-label="Choose image, PDF, or audio attachment"
            onChange={handleAttachmentSelection}
          />
          <button
            type="button"
            className="note-wall-primary-action"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={isAddingAttachment}
            title={`Add an image, PDF, or audio file (up to ${MAX_WALL_ATTACHMENT_SIZE / 1024 / 1024} MB)`}
          >
            <FilePlus2 size={16} /> {isAddingAttachment ? 'Adding…' : 'Add attachment'}
          </button>
          <span className="note-wall-attachment-status" role="status" aria-live="polite">
            {attachmentStatus || `Images, PDFs, and audio · up to ${MAX_WALL_ATTACHMENT_SIZE / 1024 / 1024} MB`}
          </span>
          <label className="note-wall-group-filter">Group
            <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
              <option value="all">All items</option>
              <optgroup label="Folders">
                {categories.map((category) => <option key={category} value={`folder:${category}`}>{category}</option>)}
              </optgroup>
              <optgroup label="Tags">
                {tags.map((tag) => <option key={tag} value={`tag:${tag}`}>#{tag}</option>)}
              </optgroup>
            </select>
          </label>
          <div className="note-wall-toolbar-divider" />
          <button type="button" className="note-wall-primary-action" onClick={() => setShowTidyConfirmation(true)} disabled={!visibleNotes.length && !visibleTasks.length && !visibleAttachments.length} title="Arrange and center notes, attachments, and tasks">
            <AlignCenter size={16} /> Tidy &amp; center
          </button>
          <button
            type="button"
            className={`note-wall-tool-toggle${hideOrphanTasks ? ' is-active' : ''}`}
            aria-pressed={hideOrphanTasks}
            onClick={() => setHideOrphanTasks((hidden) => !hidden)}
            title="Hide tasks in Inbox or without a custom folder"
          >
            {hideOrphanTasks ? <EyeOff size={15} /> : <Eye size={15} />}
            {hideOrphanTasks ? 'Show orphan tasks' : 'Hide orphan tasks'}
          </button>
          <div className="note-wall-undo-redo" role="toolbar" aria-label="Edit history">
            <button type="button" aria-label="Undo" title="Undo wall change" disabled={!canUndo} onClick={undoWallChange}>
              <Undo2 size={15} /> Undo
            </button>
            <button type="button" aria-label="Redo" title="Redo wall change" disabled={!canRedo} onClick={redoWallChange}>
              <Redo2 size={15} /> Redo
            </button>
          </div>
          {(visibleNotes.length > 0 || visibleTasks.length > 0 || visibleAttachments.length > 0) && <div className="note-wall-board-actions" role="toolbar" aria-label="Board navigation">
            <button type="button" className={panMode ? 'is-active' : ''} aria-pressed={panMode} onClick={() => setPanMode((active) => !active)} title="Move board">
              <Hand size={15} /> Move
            </button>
            <span className="note-wall-toolbar-divider" />
            <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomAt(zoom / 1.15, boardRef.current.clientWidth / 2 + boardRef.current.getBoundingClientRect().left, boardRef.current.clientHeight / 2 + boardRef.current.getBoundingClientRect().top)}>
              <ZoomOut size={15} />
            </button>
            <button type="button" className="note-wall-zoom-level" title="Reset zoom" onClick={() => zoomAt(1, boardRef.current.getBoundingClientRect().left + boardRef.current.clientWidth / 2, boardRef.current.getBoundingClientRect().top + boardRef.current.clientHeight / 2)}>{Math.round(zoom * 100)}%</button>
            <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomAt(zoom * 1.15, boardRef.current.clientWidth / 2 + boardRef.current.getBoundingClientRect().left, boardRef.current.clientHeight / 2 + boardRef.current.getBoundingClientRect().top)}>
              <ZoomIn size={15} />
            </button>
          </div>}
          {(visibleNotes.length > 0 || visibleAttachments.length > 0) && (
            <details className="note-wall-connection-tools" ref={connectionPanelRef}>
              <summary><Link2 size={15} /> Connections{visibleConnections.length ? <span className="note-wall-connection-count">{visibleConnections.length}</span> : null}</summary>
              <div className="note-wall-connection-panel">
                <div className="note-wall-connection-panel-heading">
                  <strong>Connect notes, attachments, and tasks</strong>
                  <span>Same-folder notes use solid lines, shared tags use dotted lines, and task-folder links use dashed lines.</span>
                </div>
                <form className="note-wall-link-form" onSubmit={addConnection}>
                  <select aria-label="Connection start note" value={connectionFrom} onChange={(event) => setConnectionFrom(event.target.value)}>
                    <option value="">From note…</option>
                    {visibleNotes.map((note) => <option key={note.id} value={String(note.id)}>{getWallNoteTitle(note)}</option>)}
                  </select>
                  <select aria-label="Connection end note" value={connectionTo} onChange={(event) => setConnectionTo(event.target.value)}>
                    <option value="">To note…</option>
                    {visibleNotes.map((note) => <option key={note.id} value={String(note.id)}>{getWallNoteTitle(note)}</option>)}
                  </select>
                  <label className="note-wall-color-control">Line color
                    <input aria-label="Connection color" type="color" value={connectionColor} onChange={(event) => setConnectionColor(event.target.value)} />
                  </label>
                  <select aria-label="Connection style" value={connectionStyle} onChange={(event) => setConnectionStyle(event.target.value)}>
                    <option value="solid">Solid line</option>
                    <option value="dotted">Dotted line</option>
                    <option value="dashed">Dashed line</option>
                  </select>
                  <label className="note-wall-inline-option">
                    <input type="checkbox" checked={connectionCurved} onChange={(event) => setConnectionCurved(event.target.checked)} />
                    Curved
                  </label>
                  <select aria-label="Connection start edge" value={connectionFromAnchor} onChange={(event) => setConnectionFromAnchor(event.target.value)}>
                    {CONNECTION_ANCHORS.map((anchor) => <option key={anchor} value={anchor}>Start: {anchor}</option>)}
                  </select>
                  <select aria-label="Connection end edge" value={connectionToAnchor} onChange={(event) => setConnectionToAnchor(event.target.value)}>
                    {CONNECTION_ANCHORS.map((anchor) => <option key={anchor} value={anchor}>End: {anchor}</option>)}
                  </select>
                  <button type="submit" className="note-wall-secondary-action" disabled={visibleNotes.length < 2}><Link2 size={14} /> Add connection</button>
                  <button type="button" className="note-wall-auto-connect" onClick={autoConnectRelated} disabled={!visibleNotes.length || (!visibleTasks.length && visibleNotes.length < 2)} title="Folder links are solid, shared-tag links are dotted, and task-to-note links are dashed. Existing links are kept.">
                    Auto-connect related
                  </button>
                </form>
                {selectedCardId !== null && (
                  <label className="note-wall-selection-control">Card color
                    <input aria-label="Selected card color" type="color" value={selectedCard?.color?.startsWith('#') ? selectedCard.color : NOTE_COLORS[selectedCard?.color] || '#fef08a'} onChange={(event) => updateSelectedCardColor(event.target.value)} />
                  </label>
                )}
                {selectedConnection && (
                  <div className="note-wall-selection-control note-wall-selected-line" role="group" aria-label="Selected connection settings">
                    <strong>Selected line</strong>
                    <input aria-label="Selected line color" type="color" value={selectedConnection.color || '#a5b4fc'} onChange={(event) => updateSelectedConnection({ color: event.target.value })} />
                    <select aria-label="Selected line style" value={selectedConnection.style || 'solid'} onChange={(event) => updateSelectedConnection({ style: event.target.value })}>
                      <option value="solid">Solid</option>
                      <option value="dotted">Dotted</option>
                      <option value="dashed">Dashed</option>
                    </select>
                    <label className="note-wall-inline-option">
                      <input aria-label="Selected line curved" type="checkbox" checked={selectedConnection.curved !== false} onChange={(event) => updateSelectedConnection({ curved: event.target.checked })} />
                      Curved
                    </label>
                    <select aria-label="Selected line start edge" value={selectedConnection.fromAnchor || 'right'} onChange={(event) => updateSelectedConnection({ fromAnchor: event.target.value })}>
                      {CONNECTION_ANCHORS.map((anchor) => <option key={anchor} value={anchor}>Start: {anchor}</option>)}
                    </select>
                    <select aria-label="Selected line end edge" value={selectedConnection.toAnchor || 'left'} onChange={(event) => updateSelectedConnection({ toAnchor: event.target.value })}>
                      {CONNECTION_ANCHORS.map((anchor) => <option key={anchor} value={anchor}>End: {anchor}</option>)}
                    </select>
                    <button type="button" onClick={() => setSelectedConnectionId(null)} aria-label="Deselect line">Done</button>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
        <span className={`note-wall-drive-help${wallSaveStatus.startsWith('Could not') ? ' is-error' : ' is-saved'}`} role="status" aria-live="polite">
          {wallSaveStatus}{driveStatus ? ` · ${driveStatus}` : GOOGLE_DRIVE_CLIENT_ID ? ' · Private Drive save available' : ' · Drive setup optional'} · Attachment files stay in this browser and are not included in exports.
        </span>
      </section>

      {visibleNotes.length === 0 && visibleTasks.length === 0 && visibleAttachments.length === 0 ? (
        <div className="note-wall-empty">
          <StickyNote size={34} />
          <h2>{notes.length ? 'No notes with this tag' : 'Start with your notes'}</h2>
          <p>{notes.length ? 'Choose a different folder or tag group.' : 'Create notes and tags on the dashboard, or add an image, PDF, or audio clip to place it on your wall.'}</p>
          {!notes.length && <button type="button" className="note-wall-primary-action" onClick={() => attachmentInputRef.current?.click()}><FilePlus2 size={16} /> Add attachment</button>}
          <Link to="/dashboard">Go to notes</Link>
        </div>
      ) : (
        <div className={`note-wall-scroll${panMode ? ' is-pan-mode' : ''}`} ref={boardRef} onPointerDown={startPan} style={isPrinting ? { height: boardWithTasks.height * printScale } : undefined}>
          <div className="note-wall-canvas" style={{ width: boardWithTasks.width * zoom, height: boardWithTasks.height * zoom }}>
            <div
              className="note-wall-board"
              aria-label="Draggable note and attachment board"
              style={{ width: boardWithTasks.width, height: boardWithTasks.height, transform: `scale(${zoom})`, '--wall-print-scale': printScale }}
            >
            <svg className="note-wall-connections" role="group" aria-label="Note connections">
              {visibleConnections.map((connection) => {
                const fromType = connection.fromType || 'note';
                const toType = connection.toType || 'note';
                const from = fromType === 'task' ? wall.taskPositions?.[connection.from] || { x: 0, y: 0 } : wall.positions[connection.from] || { x: 0, y: 0 };
                const to = toType === 'task' ? wall.taskPositions?.[connection.to] || { x: 0, y: 0 } : wall.positions[connection.to] || { x: 0, y: 0 };
                const fromSize = fromType === 'task'
                  ? { width: 180, height: 42 }
                  : wall.sizes?.[connection.from] || (fromType === 'attachment' ? DEFAULT_ATTACHMENT_SIZE : { width: CARD_WIDTH, height: CARD_HEIGHT });
                const toSize = toType === 'task'
                  ? { width: 180, height: 42 }
                  : wall.sizes?.[connection.to] || (toType === 'attachment' ? DEFAULT_ATTACHMENT_SIZE : { width: CARD_WIDTH, height: CARD_HEIGHT });
                const start = getAnchorPoint(from, fromSize, connection.fromAnchor || 'right');
                const end = getAnchorPoint(to, toSize, connection.toAnchor || 'left');
                const path = getConnectionPath(start, end, connection.fromAnchor || 'right', connection.toAnchor || 'left', connection.curved !== false);
                const dash = connection.style === 'dotted' ? '2 9' : connection.style === 'dashed' ? '12 8' : undefined;
                return (
                  <g key={connection.id} className={selectedConnectionId === connection.id ? 'is-selected' : ''}>
                    <path className="note-wall-connection-hit-area" d={path} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); selectConnection(connection.id); }} />
                    <path
                      className="note-wall-connection-line"
                      d={path}
                      stroke={connection.color || '#a5b4fc'}
                      strokeDasharray={dash}
                      role="button"
                      tabIndex={0}
                      aria-label={`Select connection from ${getEndpointLabel(fromType, connection.from)} to ${getEndpointLabel(toType, connection.to)}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => { event.stopPropagation(); selectConnection(connection.id); }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectConnection(connection.id);
                        }
                      }}
                    />
                  </g>
                );
              })}
              {connectionPreview && (() => {
                const isTask = connectionPreview.fromType === 'task';
                const from = isTask ? wall.taskPositions?.[connectionPreview.from] || { x: 0, y: 0 } : wall.positions[connectionPreview.from] || { x: 0, y: 0 };
                const dimensions = isTask
                  ? { width: 180, height: 42 }
                  : wall.sizes?.[connectionPreview.from] || (connectionPreview.fromType === 'attachment' ? DEFAULT_ATTACHMENT_SIZE : { width: CARD_WIDTH, height: CARD_HEIGHT });
                const start = getAnchorPoint(from, dimensions, connectionPreview.anchor);
                return <path d={`M ${start.x} ${start.y} L ${connectionPreview.x} ${connectionPreview.y}`} stroke={connectionColor} strokeWidth="3" strokeDasharray="5 6" />;
              })()}
            </svg>
            {visibleNotes.map((note) => {
              const position = wall.positions[note.id] || { x: 30, y: 30 };
              const dimensions = wall.sizes?.[note.id] || { width: CARD_WIDTH, height: CARD_HEIGHT };
              return (
                <article
                  key={note.id}
                  className={`note-wall-card${String(selectedCardId) === String(note.id) ? ' is-selected' : ''}`}
                  data-note-id={String(note.id)}
                  data-node-id={String(note.id)}
                  data-node-type="note"
                  aria-label={`Select ${getWallNoteTitle(note)} card to change its color`}
                  tabIndex={0}
                  onClick={(event) => {
                    if (!event.target.closest('button')) {
                      selectCard(note.id);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      selectCard(note.id);
                    }
                  }}
                  style={{ left: position.x, top: position.y, width: dimensions.width, height: dimensions.height, backgroundColor: NOTE_COLORS[note.color] || note.color || NOTE_COLORS.yellow }}
                >
                  <button
                    type="button"
                    className="note-wall-drag-handle"
                    aria-label={`Move ${getWallNoteTitle(note)}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      const point = getBoardPoint(event);
                      gestureRef.current = { type: 'move-node', nodeType: 'note', id: note.id, offsetX: point.x - position.x, offsetY: point.y - position.y };
                    }}
                  >
                    <span aria-hidden="true">⠿</span> Drag note
                  </button>
                  <button type="button" className="note-wall-open" onClick={() => { selectCard(note.id); setSelectedNote(note); }}><strong>{getWallNoteTitle(note)}</strong><Eye size={14} /></button>
                  <p>{note.text || ''}</p>
                  <div className="note-wall-card-meta">
                    <span>{note.category || 'Inbox'}</span>
                    {(note.tags || []).map((tag) => <span key={tag}>#{tag}</span>)}
                  </div>
                  {wall.connections.filter((connection) => ((connection.fromType || 'note') === 'note' && String(connection.from) === String(note.id)) || ((connection.toType || 'note') === 'note' && String(connection.to) === String(note.id))).map((connection) => (
                    <button
                      key={connection.id}
                      type="button"
                      className="note-wall-unlink"
                      aria-label="Remove connection"
                      title="Remove connection"
                      onClick={() => setWall((current) => ({ ...current, connections: current.connections.filter((item) => item.id !== connection.id) }))}
                    ><Unlink size={13} /></button>
                  ))}
                  {CONNECTION_ANCHORS.map((anchor) => (
                    <button
                      key={anchor}
                      type="button"
                      className={`note-wall-connect-handle is-${anchor}`}
                      aria-label={`Drag from ${anchor} edge of ${getWallNoteTitle(note)} to connect`}
                      title={`Drag from ${anchor} edge to connect`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        gestureRef.current = { type: 'connect', nodeType: 'note', id: note.id, anchor };
                        setConnectionPreview({ from: note.id, fromType: 'note', anchor, ...getBoardPoint(event) });
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    className="note-wall-resize-handle"
                    aria-label={`Resize ${getWallNoteTitle(note)}`}
                    title="Resize note"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const point = getBoardPoint(event);
                      gestureRef.current = { type: 'resize', id: note.id, startX: point.x, startY: point.y, width: dimensions.width, height: dimensions.height };
                    }}
                  />
                </article>
              );
            })}
            {visibleAttachments.map((attachment) => {
              const position = wall.positions[attachment.id] || { x: 30, y: 30 };
              const dimensions = wall.sizes?.[attachment.id] || DEFAULT_ATTACHMENT_SIZE;
              const url = attachmentUrls[attachment.id];
              return (
                <article
                  key={`attachment:${attachment.id}`}
                  className="note-wall-attachment"
                  data-node-id={String(attachment.id)}
                  data-node-type="attachment"
                  aria-label={`${attachment.mediaType} attachment: ${attachment.name}`}
                  style={{ left: position.x, top: position.y, width: dimensions.width, height: dimensions.height }}
                >
                  <button
                    type="button"
                    className="note-wall-attachment-move"
                    aria-label={`Move attachment ${attachment.name}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const point = getBoardPoint(event);
                      gestureRef.current = { type: 'move-node', nodeType: 'attachment', id: attachment.id, offsetX: point.x - position.x, offsetY: point.y - position.y };
                    }}
                  >
                    <span aria-hidden="true">⠿</span>
                    <span className="note-wall-attachment-name">{attachment.name}</span>
                  </button>
                  <button
                    type="button"
                    className="note-wall-attachment-remove"
                    aria-label={`Remove attachment ${attachment.name}`}
                    title="Remove attachment"
                    onClick={() => removeAttachment(attachment)}
                  ><Trash2 size={14} /></button>
                  <div className="note-wall-attachment-preview">
                    {attachmentErrors[attachment.id] ? (
                      <p role="alert">{attachmentErrors[attachment.id]}</p>
                    ) : !url ? (
                      <p role="status">Loading preview…</p>
                    ) : attachment.mediaType === 'image' ? (
                      <img src={url} alt={attachment.name} draggable="false" />
                    ) : attachment.mediaType === 'pdf' ? (
                      <iframe src={url} title={`PDF preview: ${attachment.name}`} />
                    ) : (
                      <audio src={url} controls preload="metadata" aria-label={`Play ${attachment.name}`}>
                        Your browser does not support audio playback.
                      </audio>
                    )}
                  </div>
                  {CONNECTION_ANCHORS.map((anchor) => (
                    <button
                      key={anchor}
                      type="button"
                      className={`note-wall-connect-handle is-${anchor}`}
                      aria-label={`Drag from ${anchor} edge of ${attachment.name} to connect`}
                      title={`Drag from ${anchor} edge to connect`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        gestureRef.current = { type: 'connect', nodeType: 'attachment', id: attachment.id, anchor };
                        setConnectionPreview({ from: attachment.id, fromType: 'attachment', anchor, ...getBoardPoint(event) });
                      }}
                    />
                  ))}
                  {wall.connections.filter((connection) =>
                    (connection.fromType === 'attachment' && String(connection.from) === String(attachment.id))
                    || (connection.toType === 'attachment' && String(connection.to) === String(attachment.id))).map((connection) => (
                    <button
                      key={connection.id}
                      type="button"
                      className="note-wall-unlink"
                      aria-label="Remove connection"
                      title="Remove connection"
                      onClick={() => setWall((current) => ({ ...current, connections: current.connections.filter((item) => item.id !== connection.id) }))}
                    ><Unlink size={13} /></button>
                  ))}
                  <button
                    type="button"
                    className="note-wall-resize-handle"
                    aria-label={`Resize attachment ${attachment.name}`}
                    title="Resize attachment"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const point = getBoardPoint(event);
                      gestureRef.current = { type: 'resize', id: attachment.id, startX: point.x, startY: point.y, width: dimensions.width, height: dimensions.height };
                    }}
                  />
                </article>
              );
            })}
            {visibleTasks.map((task) => {
              const position = wall.taskPositions?.[task.id] || { x: 900, y: 42 };
              const category = task.category || 'Inbox';
              const folderColor = getWallRelationColor(`folder:${category}`);
              const priority = String(task.priority || 'medium');
              return (
                <article
                  key={`task:${task.id}`}
                  className="note-wall-task"
                  data-node-id={String(task.id)}
                  data-node-type="task"
                  style={{ left: position.x, top: position.y, '--task-folder-color': folderColor }}
                  tabIndex={0}
                  aria-label={`Task ${task.title || 'Untitled task'} in ${category}`}
                >
                  <button
                    type="button"
                    className="note-wall-task-move"
                    aria-label={`Move task ${task.title || 'Untitled task'}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const point = getBoardPoint(event);
                      gestureRef.current = { type: 'move-node', nodeType: 'task', id: task.id, offsetX: point.x - position.x, offsetY: point.y - position.y };
                    }}
                  >
                    <span className="note-wall-task-marker" aria-hidden="true" />
                    <span>Task · {category}</span>
                  </button>
                  <div className="note-wall-task-details" role="tooltip">
                    <strong>{task.title || 'Untitled task'}</strong>
                    <span>Status: {task.completed ? 'Complete' : 'Open'}</span>
                    <span>Time: {formatTaskReminder(task.reminder)}</span>
                    <span>Priority: {priority.charAt(0).toUpperCase() + priority.slice(1)}</span>
                  </div>
                  <button
                    type="button"
                    className="note-wall-task-connect"
                    aria-label={`Connect task ${task.title || 'Untitled task'} to a note`}
                    title="Drag to a note to connect"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      gestureRef.current = { type: 'connect', nodeType: 'task', id: task.id, anchor: 'right' };
                      setConnectionPreview({ from: task.id, fromType: 'task', anchor: 'right', ...getBoardPoint(event) });
                    }}
                  />
                </article>
              );
            })}
            </div>
          </div>
        </div>
      )}
      {selectedNote && (
        <div className="note-wall-modal-backdrop" role="presentation" onClick={() => setSelectedNote(null)}>
          <section className="note-wall-modal" role="dialog" aria-modal="true" aria-labelledby="note-wall-modal-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-modal-close" aria-label="Close note" onClick={() => setSelectedNote(null)}><X size={17} /></button>
            <h2 id="note-wall-modal-title">{getWallNoteTitle(selectedNote)}</h2>
            <p>{getNotePlainText(selectedNote) || 'This note has no text.'}</p>
            <div className="note-wall-card-meta"><span>{selectedNote.category || 'Inbox'}</span>{(selectedNote.tags || []).map((tag) => <span key={tag}>#{tag}</span>)}</div>
          </section>
        </div>
      )}
      {showTidyConfirmation && (
        <div className="note-wall-modal-backdrop" role="presentation" onClick={() => setShowTidyConfirmation(false)}>
          <section className="note-wall-modal note-wall-tidy-dialog" role="dialog" aria-modal="true" aria-labelledby="note-wall-tidy-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-modal-close" aria-label="Cancel tidy" onClick={() => setShowTidyConfirmation(false)}><X size={17} /></button>
            <h2 id="note-wall-tidy-title">Tidy the board?</h2>
            <p>Tidy spaces and centers the visible cards, smooths their lines, and adds missing same-folder, shared-tag, and custom-folder task links. Inbox tasks are never connected by tidy. Choose whether to keep other existing lines or clear every line. Changes save locally.</p>
            <div className="note-wall-tidy-actions">
              <button type="button" className="note-wall-secondary-action" onClick={() => tidyAndCenterBoard(false)}>Keep lines &amp; tidy</button>
              <button type="button" className="note-wall-clear-tidy" onClick={() => tidyAndCenterBoard(true)}>Clear lines &amp; tidy</button>
              <button type="button" className="note-wall-cancel-tidy" onClick={() => setShowTidyConfirmation(false)}>Cancel</button>
            </div>
          </section>
        </div>
      )}
      {pendingDeleteAttachment && (
        <div className="note-wall-modal-backdrop" role="presentation" onClick={() => setPendingDeleteAttachment(null)}>
          <section className="note-wall-modal note-wall-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="note-wall-delete-title" aria-describedby="note-wall-delete-description" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-modal-close" aria-label="Cancel attachment deletion" onClick={() => setPendingDeleteAttachment(null)}><X size={17} /></button>
            <h2 id="note-wall-delete-title">Remove attachment?</h2>
            <p id="note-wall-delete-description">Remove “{pendingDeleteAttachment.name}” from this wall? You can undo this action. The file stays in this browser while it remains available in undo history.</p>
            <div className="note-wall-tidy-actions">
              <button type="button" className="note-wall-delete-confirm" onClick={confirmRemoveAttachment}>Remove attachment</button>
              <button type="button" className="note-wall-cancel-tidy" onClick={() => setPendingDeleteAttachment(null)}>Cancel</button>
            </div>
          </section>
        </div>
      )}
      {notes.length > 0 && <footer className="note-wall-footer">{visibleNotes.length} notes · {visibleTasks.length} tasks shown · folder links are solid, tag links dotted, and task links dashed · Ctrl+scroll to zoom · Shift+scroll to move sideways</footer>}
    </main>
  );
}
