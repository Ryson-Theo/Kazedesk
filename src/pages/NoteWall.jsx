import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlignCenter, ArrowLeft, CheckCircle2, ChevronDown, Circle, Download, Ellipsis, Eye, EyeOff, FileJson2, FilePlus2, FileText, Globe2, GripVertical, Hand, Link2, MessageCircle, Mic, Moon, Pause, Pencil, Pin, Play, Plus, Printer, Redo2, Save, Send, Square, StickyNote, Sun, Trash2, Undo2, Unlink, X, ZoomIn, ZoomOut } from 'lucide-react';
import MarkdownContent from '../components/MarkdownContent';
import { storageManager } from '../utils/localStorage';
import { exportWallJSON, exportWallMarkdown, exportWallPNG, getNotePlainText, getWallNoteTitle } from '../utils/noteWallExports';
import { tidyWallLayout } from '../utils/noteWallLayout';
import { addRelatedWallConnections, getWallRelationColor } from '../utils/noteWallRelations';
import { recolorIntersectingConnections } from '../utils/noteWallIntersections';
import { getWallAttachment, MAX_WALL_ATTACHMENT_SIZE, pruneWallAttachments, saveWallAttachment, validateWallAttachment } from '../utils/noteWallMedia';
import { createWebClipperBookmarklet, decodeWebClipPayload, fetchWebClipMetadata, normalizeWebClip } from '../utils/noteWallWebClipper';
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
const DEFAULT_AUDIO_SIZE = { width: 360, height: 108 };
const DEFAULT_WEB_CLIP_SIZE = { width: 320, height: 260 };
const DEFAULT_BOARD_TASK_CATEGORIES = ['Inbox'];

function formatAudioTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function getAudioWaveform(waveform) {
  if (Array.isArray(waveform) && waveform.length) {
    return waveform.slice(0, 32).map((peak) => Math.max(12, Math.min(100, Number(peak) || 12)));
  }
  return Array(32).fill(12);
}

function compressAudioWaveform(samples) {
  if (!samples.length) return [];
  return Array.from({ length: 32 }, (_, index) => {
    const start = Math.floor(index * samples.length / 32);
    const end = Math.max(start + 1, Math.floor((index + 1) * samples.length / 32));
    const peak = samples.slice(start, end).reduce((value, sample) => Math.max(value, sample), 0);
    return Math.max(12, Math.min(100, Math.round(peak / 0.25 * 100)));
  });
}

function WallAudioPlayer({ attachment, url, initialDuration = attachment.duration || 0 }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [playbackError, setPlaybackError] = useState('');
  const speeds = [1, 1.25, 1.5, 2];
  const waveform = useMemo(() => getAudioWaveform(attachment.waveform), [attachment.waveform]);
  const progress = duration ? Math.min(currentTime / duration, 1) : 0;

  const togglePlayback = async (event) => {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaybackError('');
      } catch {
        setPlaybackError('Playback could not start. Try again.');
      }
    } else {
      audio.pause();
    }
  };

  const changeSpeed = (event) => {
    event.stopPropagation();
    const nextIndex = (speedIndex + 1) % speeds.length;
    setSpeedIndex(nextIndex);
    if (audioRef.current) audioRef.current.playbackRate = speeds[nextIndex];
  };

  const seek = (event) => {
    event.stopPropagation();
    if (audioRef.current && duration) audioRef.current.currentTime = Number(event.target.value);
  };

  return (
    <div className="note-wall-audio-player" role="group" aria-label={`${attachment.name} audio player`} onPointerDown={(event) => event.stopPropagation()}>
      <audio
        ref={audioRef}
        className="note-wall-audio-element"
        src={url}
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
        onLoadedMetadata={(event) => {
          if (Number.isFinite(event.currentTarget.duration) && event.currentTarget.duration > 0) setDuration(event.currentTarget.duration);
        }}
        onDurationChange={(event) => {
          if (Number.isFinite(event.currentTarget.duration) && event.currentTarget.duration > 0) setDuration(event.currentTarget.duration);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
      />
      <button
        type="button"
        className="note-wall-audio-play"
        aria-label={`${isPlaying ? 'Pause' : 'Play'} ${attachment.name}`}
        title={isPlaying ? 'Pause' : 'Play'}
        onClick={togglePlayback}
      >
        {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
      </button>
      <div className={`note-wall-audio-wave${isPlaying ? ' is-playing' : ''}`} aria-hidden="true">
        {waveform.map((height, index) => (
          <span key={index} className={index / waveform.length < progress ? 'is-played' : ''} style={{ height: `${height}%`, '--wave-index': index }} />
        ))}
        <input
          type="range"
          className="note-wall-audio-seek"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration)}
          disabled={!duration}
          aria-label={`Seek ${attachment.name}`}
          aria-valuetext={`${formatAudioTime(currentTime)} of ${formatAudioTime(duration)}`}
          onChange={seek}
        />
      </div>
      <span className="note-wall-audio-time">
        {formatAudioTime(currentTime)}<span aria-hidden="true"> / </span>{formatAudioTime(duration)}
      </span>
      <button
        type="button"
        className="note-wall-audio-speed"
        aria-label={`Playback speed (${speeds[speedIndex]}×)`}
        title="Change playback speed"
        onClick={changeSpeed}
      >{speeds[speedIndex]}×</button>
      {playbackError && <span className="note-wall-audio-error" role="alert">{playbackError}</span>}
    </div>
  );
}

function getCompactWebClipSize(clip) {
  const labelLength = Math.max(clip.title?.length || 0, clip.siteName?.length || 0);
  return { width: Math.max(190, Math.min(260, 100 + labelLength * 6)), height: 68 };
}

function getPinnedLinkWidth(label) {
  return Math.max(190, Math.min(280, 110 + String(label || '').length * 7));
}

function getMarkdownLinks(source) {
  const markdownPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
  const found = [];
  const ranges = [];
  let match;
  while ((match = markdownPattern.exec(source))) {
    found.push({ label: match[1].trim(), url: match[2] });
    ranges.push([match.index, markdownPattern.lastIndex]);
  }
  const plainText = source.split('');
  ranges.forEach(([start, end]) => {
    for (let index = start; index < end; index += 1) plainText[index] = ' ';
  });
  const plainUrlPattern = /https?:\/\/[^\s<>]+/gi;
  while ((match = plainUrlPattern.exec(plainText.join('')))) {
    found.push({ label: match[0].replace(/[.,!?;:)\]]+$/, ''), url: match[0].replace(/[.,!?;:)\]]+$/, '') });
  }
  const uniqueLinks = new Map(found.map((link) => {
    try {
      const normalized = normalizeWebClip({ url: link.url });
      return [normalized.url, {
        ...link,
        label: link.label === link.url ? new URL(normalized.url).hostname.replace(/^www\./, '') : link.label,
        url: normalized.url,
      }];
    } catch {
      return [link.url, null];
    }
  }));
  return [...uniqueLinks.values()].filter(Boolean);
}

function syncPinnedMarkdownLinks(note, text, wall) {
  const existingLinks = new Map((note.pinnedLinks || []).map((link) => [link.url, link]));
  return getMarkdownLinks(text).map((link, index) => {
    const existing = existingLinks.get(link.url);
    if (existing) return existing;
    const offset = getAttachedLinkOffset(note, index, wall);
    return {
      id: crypto.randomUUID(),
      ...link,
      anchorOffset: {
        x: offset.x,
        y: offset.y,
      },
    };
  });
}

function replaceMarkdownLink(source, oldUrl, newUrl, label) {
  const escapeLabel = (value) => value.replaceAll('\\', '\\\\').replaceAll(']', '\\]');
  const normalizeUrl = (value) => {
    try {
      return normalizeWebClip({ url: value }).url;
    } catch {
      return '';
    }
  };
  const updatedLabel = escapeLabel(label);
  const replaceUrl = (value) => {
    const punctuation = value.match(/[.,!?;:)\]]+$/)?.[0] || '';
    const candidate = value.slice(0, value.length - punctuation.length);
    return normalizeUrl(candidate) === oldUrl ? `${newUrl}${punctuation}` : value;
  };
  const withUpdatedMarkdown = source.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, (original, _existingLabel, url) => (
    normalizeUrl(url) === oldUrl ? `[${updatedLabel}](${newUrl})` : original
  ));
  return withUpdatedMarkdown.replace(/https?:\/\/[^\s<>]+/gi, replaceUrl);
}

function getAttachedLinkOffset(note, stackIndex, wall) {
  const notePosition = wall.positions[note.id] || { x: 30, y: 30 };
  const noteSize = wall.sizes?.[note.id] || { width: CARD_WIDTH, height: CARD_HEIGHT };
  const attachedCount = (wall.webClips || []).filter((clip) => String(clip.attachedTo) === String(note.id)).length
    + (note.pinnedLinks || []).length;
  return {
    x: noteSize.width - 22 + (attachedCount + stackIndex) * 10,
    y: noteSize.height - 16 + (attachedCount + stackIndex) * 12,
    notePosition,
  };
}

function NoteActionsMenu({ noteTitle, onEdit, onDelete, className = '' }) {
  const runAction = (event, action) => {
    event.stopPropagation();
    event.currentTarget.closest('details')?.removeAttribute('open');
    action();
  };

  return (
    <details className={`note-wall-note-actions-menu ${className}`} onClick={(event) => event.stopPropagation()}>
      <summary role="button" aria-label={`More actions for ${noteTitle}`} title="More actions">
        <Ellipsis size={17} />
      </summary>
      <div className="note-wall-note-actions-menu-list" role="menu" aria-label={`Actions for ${noteTitle}`}>
        <button type="button" role="menuitem" onClick={(event) => runAction(event, onEdit)}><Pencil size={14} /> Edit note</button>
        <button type="button" role="menuitem" className="is-destructive" onClick={(event) => runAction(event, onDelete)}><Trash2 size={14} /> Delete note</button>
      </div>
    </details>
  );
}

function getNextAttachmentPosition(wall, notes, tasks, newSize = DEFAULT_ATTACHMENT_SIZE) {
  const occupied = [
    ...notes.map((note) => ({
      position: wall.positions[note.id] || { x: 30, y: 30 },
      size: wall.sizes?.[note.id] || { width: CARD_WIDTH, height: CARD_HEIGHT },
    })),
    ...(wall.attachments || []).map((attachment) => ({
      position: wall.positions[attachment.id] || { x: 30, y: 30 },
      size: wall.sizes?.[attachment.id] || (attachment.mediaType === 'audio' ? DEFAULT_AUDIO_SIZE : DEFAULT_ATTACHMENT_SIZE),
    })),
    ...(wall.webClips || []).map((clip) => ({
      position: wall.positions[clip.id] || { x: 30, y: 30 },
      size: wall.sizes?.[clip.id] || DEFAULT_WEB_CLIP_SIZE,
    })),
    ...tasks.map((task) => ({ position: wall.taskPositions?.[task.id] || { x: 900, y: 42 }, size: { width: 180, height: 42 } })),
  ];
  let index = occupied.length;
  let candidate;
  do {
    candidate = { x: 38 + (index % 3) * 330, y: 42 + Math.floor(index / 3) * 275 };
    index += 1;
  } while (occupied.some(({ position, size }) =>
    candidate.x < position.x + size.width + 24 && candidate.x + newSize.width + 24 > position.x
    && candidate.y < position.y + size.height + 24 && candidate.y + newSize.height + 24 > position.y));
  return candidate;
}

function withoutWallAttachment(wall, id) {
  const positions = { ...wall.positions };
  const sizes = { ...wall.sizes };
  const comments = { ...(wall.comments || {}) };
  delete positions[id];
  delete sizes[id];
  delete comments[`attachment:${id}`];
  return {
    ...wall,
    attachments: (wall.attachments || []).filter((item) => item.id !== id),
    positions,
    sizes,
    comments,
    connections: wall.connections.filter((connection) =>
      !((connection.fromType === 'attachment' && connection.from === id)
        || (connection.toType === 'attachment' && connection.to === id))),
  };
}

function withoutWallWebClip(wall, id) {
  const positions = { ...wall.positions };
  const sizes = { ...wall.sizes };
  const comments = { ...(wall.comments || {}) };
  delete positions[id];
  delete sizes[id];
  delete comments[`webclip:${id}`];
  return {
    ...wall,
    webClips: (wall.webClips || []).filter((item) => String(item.id) !== String(id)),
    positions,
    sizes,
    comments,
    connections: wall.connections.filter((connection) =>
      !((connection.fromType === 'webclip' && String(connection.from) === String(id))
        || (connection.toType === 'webclip' && String(connection.to) === String(id)))),
  };
}

function withoutWallBoardNode(wall, type, id) {
  const positions = { ...wall.positions };
  const taskPositions = { ...(wall.taskPositions || {}) };
  const comments = { ...(wall.comments || {}) };
  if (type === 'task') delete taskPositions[id];
  else delete positions[id];
  delete comments[`${type}:${id}`];
  return {
    ...wall,
    webClips: type === 'note'
      ? (wall.webClips || []).map((clip) => {
          if (String(clip.attachedTo) !== String(id)) return clip;
          const { attachedTo: _attachedTo, anchorOffset: _anchorOffset, ...detachedClip } = clip;
          return detachedClip;
        })
      : wall.webClips,
    positions,
    taskPositions,
    comments,
    connections: wall.connections.filter((connection) => {
      const fromType = connection.fromType || 'note';
      const toType = connection.toType || 'note';
      return !((fromType === type && String(connection.from) === String(id))
        || (toType === type && String(connection.to) === String(id)));
    }),
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

export default function NoteWall({ boardId = null }) {
  const initialBoard = useMemo(() => boardId ? storageManager.getNoteWallBoard(boardId) : null, [boardId]);
  const [boardName, setBoardName] = useState(() => initialBoard?.name || 'Sticky note wall');
  const [notes, setNotes] = useState(() => {
    const storedNotes = initialBoard?.notes || storageManager.getStickyNotes();
    if (!boardId) return storedNotes;
    const initialWall = initialBoard?.wall || storageManager.getNoteWall();
    return storedNotes.map((note) => ({
      ...note,
      pinnedLinks: syncPinnedMarkdownLinks(note, note.text || '', initialWall),
    }));
  });
  const [tasks, setTasks] = useState(() => initialBoard?.tasks || storageManager.getTasks());
  const [categories, setCategories] = useState(() => initialBoard?.categories || storageManager.getNoteCategories());
  const [taskCategories, setTaskCategories] = useState(() => initialBoard?.taskCategories || DEFAULT_BOARD_TASK_CATEGORIES);
  const [wall, setWallState] = useState(() => initialBoard?.wall || storageManager.getNoteWall());
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
  const [webClipStatus, setWebClipStatus] = useState('');
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null);
  const [showWebClipperSetup, setShowWebClipperSetup] = useState(false);
  const [showAddLinkDialog, setShowAddLinkDialog] = useState(false);
  const [showBoardNoteDialog, setShowBoardNoteDialog] = useState(false);
  const [showBoardTaskDialog, setShowBoardTaskDialog] = useState(false);
  const [showBoardFolderDialog, setShowBoardFolderDialog] = useState(false);
  const [boardFolderDraft, setBoardFolderDraft] = useState('');
  const [boardFolderError, setBoardFolderError] = useState('');
  const [editingBoardNoteId, setEditingBoardNoteId] = useState(null);
  const [boardNoteDraft, setBoardNoteDraft] = useState({ title: '', text: '', tags: '', category: 'Inbox', markdown: true });
  const [noteEditorTab, setNoteEditorTab] = useState('write');
  const [newNoteFolderName, setNewNoteFolderName] = useState('');
  const [newNoteFolderError, setNewNoteFolderError] = useState('');
  const [isCreatingNoteFolder, setIsCreatingNoteFolder] = useState(false);
  const [boardTaskDraft, setBoardTaskDraft] = useState({ title: '', priority: 'medium', category: 'Inbox' });
  const [webClipUrl, setWebClipUrl] = useState('');
  const [webClipTitle, setWebClipTitle] = useState('');
  const [webClipError, setWebClipError] = useState('');
  const [isFetchingWebClipMetadata, setIsFetchingWebClipMetadata] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [linkDraft, setLinkDraft] = useState({ url: '', label: '' });
  const [threadNode, setThreadNode] = useState(null);
  const [threadDraft, setThreadDraft] = useState('');
  const [attachmentUrls, setAttachmentUrls] = useState({});
  const [attachmentErrors, setAttachmentErrors] = useState({});
  const [isAddingAttachment, setIsAddingAttachment] = useState(false);
  const [isStartingVoiceNote, setIsStartingVoiceNote] = useState(false);
  const [isRecordingVoiceNote, setIsRecordingVoiceNote] = useState(false);
  const [showVoiceNoteDialog, setShowVoiceNoteDialog] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState(null);
  const [voiceLiveWaveform, setVoiceLiveWaveform] = useState([]);
  const [voiceElapsedTime, setVoiceElapsedTime] = useState(0);
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
  const voiceRecorderRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceAudioContextRef = useRef(null);
  const voiceWaveformTimerRef = useRef(null);
  const voiceElapsedTimerRef = useRef(null);
  const voiceWaveformSamplesRef = useRef([]);
  const voiceRecordingStartedAtRef = useRef(0);
  const voiceDraftUrlRef = useRef('');
  const voiceDiscardRef = useRef(false);
  const voiceChunksRef = useRef([]);
  const voiceRecordingSizeRef = useRef(0);
  const voiceRecordingErrorRef = useRef('');
  const connectionPanelRef = useRef(null);
  const gestureRef = useRef(null);
  const nextSaveMessageRef = useRef('');
  const wallHistoryRef = useRef({ past: [], future: [], timer: null });
  const wallRef = useRef(wall);
  const bookmarkletRef = useRef(null);
  const webClipperBookmarklet = useMemo(
    () => createWebClipperBookmarklet(`${window.location.origin}${window.location.pathname}`),
    [],
  );

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

  useEffect(() => () => {
    const recorder = voiceRecorderRef.current;
    if (recorder?.state === 'recording') {
      voiceDiscardRef.current = true;
      recorder.stop();
    }
    if (voiceWaveformTimerRef.current !== null) window.clearInterval(voiceWaveformTimerRef.current);
    if (voiceElapsedTimerRef.current !== null) window.clearInterval(voiceElapsedTimerRef.current);
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (voiceAudioContextRef.current?.state !== 'closed') voiceAudioContextRef.current?.close();
    if (voiceDraftUrlRef.current) URL.revokeObjectURL(voiceDraftUrlRef.current);
  }, []);

  useEffect(() => {
    pruneWallAttachments(() => [
      ...storageManager.getNoteWall().attachments,
      ...storageManager.getNoteWallBoards().flatMap((board) => board.wall.attachments),
      ...(wallRef.current.attachments || []),
    ].map((attachment) => attachment.id))
      .catch((error) => setAttachmentStatus(error.message || 'Could not clean up removed attachments.'));
  }, []);

  useLayoutEffect(() => {
    localStorage.setItem('kazedesk_note_wall_visited', 'true');
    window.dispatchEvent(new Event('kazedesk-note-wall-visited'));
  }, []);

  useEffect(() => {
    if (boardId) return undefined;
    const syncNotes = (event) => {
      if (event.key === 'kazedesk_sticky_notes') setNotes(storageManager.getStickyNotes());
      if (event.key === 'kazedesk_tasks') setTasks(storageManager.getTasks());
    };
    window.addEventListener('storage', syncNotes);
    return () => window.removeEventListener('storage', syncNotes);
  }, [boardId]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const payload = url.searchParams.get('kazedesk_clip');
    if (!payload) return;
    url.searchParams.delete('kazedesk_clip');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    try {
      const metadata = decodeWebClipPayload(payload);
      const clip = { id: crypto.randomUUID(), ...metadata, clippedAt: new Date().toISOString(), category: 'Inbox' };
      const clipSize = getCompactWebClipSize(clip);
      setWall((current) => ({
        ...current,
        webClips: [...(current.webClips || []), clip],
        positions: { ...current.positions, [clip.id]: getNextAttachmentPosition(current, notes, tasks, clipSize) },
        sizes: { ...current.sizes, [clip.id]: clipSize },
      }));
      setWebClipStatus(`Saved “${clip.title}” to the wall.`);
    } catch (error) {
      setWebClipStatus(error.message || 'Could not import this web clip.');
    }
  }, [notes, tasks]);

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
          && !(previous.attachments || []).some((attachment) => String(attachment.id) === String(id))
          && !(previous.webClips || []).some((clip) => String(clip.id) === String(id))) {
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
            : type === 'webclip'
              ? (previous.webClips || []).some((clip) => String(clip.id) === String(id))
              : notes.some((note) => String(note.id) === String(id));
      };
      const connections = previous.connections.filter((connection) => hasEndpoint(connection, 'from') && hasEndpoint(connection, 'to'));
      if (connections.length !== previous.connections.length) changed = true;
      return changed ? { ...previous, positions, taskPositions, connections } : previous;
    }, false);
  }, [notes, tasks]);

  useEffect(() => {
    try {
      if (boardId) {
        const updatedBoard = storageManager.saveNoteWallBoard(boardId, { wall, notes, tasks, categories, taskCategories });
        setBoardName(updatedBoard.name);
      } else {
        storageManager.saveNoteWall(wall);
      }
      setWallSaveStatus(nextSaveMessageRef.current || 'Changes saved locally');
      nextSaveMessageRef.current = '';
    } catch (error) {
      setWallSaveStatus(`Could not save locally: ${error.message || 'browser storage is unavailable'}`);
      nextSaveMessageRef.current = '';
    }
  }, [boardId, categories, notes, taskCategories, tasks, wall]);

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
    const sizes = { ...wall.sizes };
    let hasLegacyAudioSize = false;
    (wall.attachments || []).forEach((attachment) => {
      const size = sizes[attachment.id];
      if (attachment.mediaType === 'audio' && size?.width === DEFAULT_ATTACHMENT_SIZE.width && size?.height === DEFAULT_ATTACHMENT_SIZE.height) {
        sizes[attachment.id] = DEFAULT_AUDIO_SIZE;
        hasLegacyAudioSize = true;
      }
    });
    if (hasLegacyAudioSize) setWall((current) => ({ ...current, sizes }), false);
  }, [wall]);

  useEffect(() => {
    const connections = recolorIntersectingConnections(
      wall.connections,
      notes,
      tasks,
      wall,
      theme,
      wall.attachments || [],
      wall.webClips || [],
    );
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
  const visibleWebClips = useMemo(
    () => (wall.webClips || []).filter((clip) =>
      groupFilter === 'all'
      || groupFilter === 'folder:Inbox'
      || (clip.attachedTo && visibleNotes.some((note) => String(note.id) === String(clip.attachedTo)))),
    [groupFilter, visibleNotes, wall.webClips],
  );
  const visibleEndpoint = (connection, side) => {
    const type = connection[`${side}Type`] || 'note';
    const id = String(connection[side]);
    return type === 'task'
      ? visibleTasks.some((task) => String(task.id) === id)
      : type === 'attachment'
        ? visibleAttachments.some((attachment) => String(attachment.id) === id)
        : type === 'webclip'
          ? visibleWebClips.some((clip) => String(clip.id) === id)
          : visibleNotes.some((note) => String(note.id) === id);
  };
  const visibleConnections = wall.connections.filter((connection) => visibleEndpoint(connection, 'from') && visibleEndpoint(connection, 'to'));
  const selectedConnection = wall.connections.find((connection) => connection.id === selectedConnectionId);
  const selectedCard = notes.find((note) => String(note.id) === String(selectedCardId));
  const boardSize = [...visibleNotes, ...visibleAttachments, ...visibleWebClips].reduce((size, note) => {
    const position = wall.positions[note.id] || { x: 30, y: 30 };
    const dimensions = wall.sizes?.[note.id]
      || (note.mediaType === 'audio' ? DEFAULT_AUDIO_SIZE : note.mediaType ? DEFAULT_ATTACHMENT_SIZE : note.url ? DEFAULT_WEB_CLIP_SIZE : { width: CARD_WIDTH, height: CARD_HEIGHT });
    return {
      width: Math.max(size.width, position.x + dimensions.width + 100),
      height: Math.max(size.height, position.y + dimensions.height + 100),
    };
  }, { width: 1800, height: 1200 });
  const boardWithTasks = visibleTasks.reduce((size, task) => {
    const position = wall.taskPositions?.[task.id] || { x: 900, y: 42 };
    return { width: Math.max(size.width, position.x + 190), height: Math.max(size.height, position.y + 90) };
  }, boardSize);

  const addAttachmentFile = async (file, metadata = {}) => {
    setIsAddingAttachment(true);
    setAttachmentStatus(`Adding ${file.name}…`);
    try {
      const { mimeType, mediaType } = validateWallAttachment(file);
      const id = crypto.randomUUID();
      await saveWallAttachment(id, file);
      const attachment = {
        id,
        name: file.name,
        mimeType,
        mediaType,
        size: file.size,
        category: 'Inbox',
        ...(mediaType === 'audio' && metadata.duration ? { duration: metadata.duration } : {}),
        ...(mediaType === 'audio' && metadata.waveform?.length ? { waveform: metadata.waveform } : {}),
      };
      const attachmentSize = mediaType === 'audio' ? DEFAULT_AUDIO_SIZE : DEFAULT_ATTACHMENT_SIZE;
      setWall((current) => ({
        ...current,
        attachments: [...(current.attachments || []), attachment],
        positions: { ...current.positions, [id]: getNextAttachmentPosition(current, notes, tasks, attachmentSize) },
        sizes: { ...current.sizes, [id]: attachmentSize },
      }));
      setAttachmentStatus(`${file.name} added to the wall.`);
      return true;
    } catch (error) {
      setAttachmentStatus(error.message || 'Could not add this attachment.');
      return false;
    } finally {
      setIsAddingAttachment(false);
    }
  };

  const handleAttachmentSelection = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await addAttachmentFile(file);
  };

  const startVoiceNote = async () => {
    if (isAddingAttachment || isStartingVoiceNote || isRecordingVoiceNote) return;
    setShowVoiceNoteDialog(true);
    setVoiceDraft(null);
    setVoiceLiveWaveform([]);
    setVoiceElapsedTime(0);
    setAttachmentStatus('');
    voiceDiscardRef.current = false;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAttachmentStatus('Voice recording is not supported in this browser.');
      return;
    }

    setIsStartingVoiceNote(true);
    setAttachmentStatus('Waiting for microphone permission…');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (voiceDiscardRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];
      voiceRecordingSizeRef.current = 0;
      voiceWaveformSamplesRef.current = [];
      voiceRecordingErrorRef.current = '';
      setVoiceLiveWaveform([]);
      setVoiceElapsedTime(0);
      const AudioContextConstructor = window.AudioContext;
      if (AudioContextConstructor) {
        try {
          const audioContext = new AudioContextConstructor();
          voiceAudioContextRef.current = audioContext;
          await audioContext.resume();
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 2048;
          audioContext.createMediaStreamSource(stream).connect(analyser);
          const samples = new Float32Array(analyser.fftSize);
          const captureWaveformSample = () => {
            analyser.getFloatTimeDomainData(samples);
            const amplitude = Math.sqrt(samples.reduce((sum, sample) => sum + sample ** 2, 0) / samples.length);
            voiceWaveformSamplesRef.current.push(amplitude);
            const recentSamples = voiceWaveformSamplesRef.current.slice(-32);
            setVoiceLiveWaveform(recentSamples.map((sample) => Math.max(12, Math.min(100, Math.round(sample / 0.25 * 100)))));
          };
          captureWaveformSample();
          voiceWaveformTimerRef.current = window.setInterval(captureWaveformSample, 50);
        } catch {
          if (voiceAudioContextRef.current?.state !== 'closed') await voiceAudioContextRef.current?.close();
          voiceAudioContextRef.current = null;
        }
      }
      const formats = [
        { recorderType: 'audio/webm;codecs=opus', mimeType: 'audio/webm', extension: 'webm' },
        { recorderType: 'audio/ogg;codecs=opus', mimeType: 'audio/ogg', extension: 'ogg' },
        { recorderType: 'audio/mp4', mimeType: 'audio/mp4', extension: 'm4a' },
      ];
      const format = formats.find(({ recorderType }) => MediaRecorder.isTypeSupported?.(recorderType));
      const recorder = new MediaRecorder(stream, format ? { mimeType: format.recorderType } : undefined);
      voiceRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        voiceRecordingSizeRef.current += event.data.size;
        if (voiceRecordingSizeRef.current > MAX_WALL_ATTACHMENT_SIZE) {
          voiceRecordingErrorRef.current = `Voice note exceeded ${MAX_WALL_ATTACHMENT_SIZE / 1024 / 1024} MB and was not saved.`;
          if (recorder.state === 'recording') recorder.stop();
          return;
        }
        voiceChunksRef.current.push(event.data);
      };
      recorder.onerror = (event) => {
        voiceRecordingErrorRef.current = event.error?.message || 'The browser could not record audio.';
        setAttachmentStatus(`Voice recording failed: ${voiceRecordingErrorRef.current}`);
        if (recorder.state === 'recording') recorder.stop();
      };
      recorder.onstop = async () => {
        if (voiceWaveformTimerRef.current !== null) window.clearInterval(voiceWaveformTimerRef.current);
        voiceWaveformTimerRef.current = null;
        if (voiceElapsedTimerRef.current !== null) window.clearInterval(voiceElapsedTimerRef.current);
        voiceElapsedTimerRef.current = null;
        const waveformSamples = voiceWaveformSamplesRef.current;
        voiceWaveformSamplesRef.current = [];
        if (voiceAudioContextRef.current?.state !== 'closed') await voiceAudioContextRef.current?.close();
        voiceAudioContextRef.current = null;
        voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
        voiceRecorderRef.current = null;
        setIsRecordingVoiceNote(false);
        const recordingDuration = Math.max(1, Math.round((performance.now() - voiceRecordingStartedAtRef.current) / 1000));
        setVoiceElapsedTime(recordingDuration);
        if (voiceDiscardRef.current) {
          voiceDiscardRef.current = false;
          voiceChunksRef.current = [];
          setShowVoiceNoteDialog(false);
          setVoiceDraft(null);
          setVoiceLiveWaveform([]);
          return;
        }
        const recordingError = voiceRecordingErrorRef.current;
        voiceRecordingErrorRef.current = '';
        if (recordingError) {
          setAttachmentStatus(recordingError);
          return;
        }
        if (!voiceChunksRef.current.length) {
          setAttachmentStatus('No audio was captured. Check microphone access and try again.');
          return;
        }

        const mimeType = (recorder.mimeType || format?.mimeType || '').split(';')[0].toLowerCase();
        const extensionByMimeType = {
          'audio/aac': 'aac',
          'audio/flac': 'flac',
          'audio/mpeg': 'mp3',
          'audio/mp4': 'm4a',
          'audio/ogg': 'ogg',
          'audio/wav': 'wav',
          'audio/webm': 'webm',
        };
        const extension = extensionByMimeType[mimeType];
        if (!extension) {
          setAttachmentStatus('The browser recorded an unsupported audio format. Try another browser.');
          return;
        }
        const file = new File(voiceChunksRef.current, `voice-note-${Date.now()}.${extension}`, { type: mimeType });
        voiceChunksRef.current = [];
        const waveform = compressAudioWaveform(waveformSamples);
        const previewUrl = URL.createObjectURL(file);
        voiceDraftUrlRef.current = previewUrl;
        setVoiceDraft({ file, waveform, url: previewUrl, duration: recordingDuration });
        setVoiceLiveWaveform([]);
      };
      recorder.start(1000);
      voiceRecordingStartedAtRef.current = performance.now();
      voiceElapsedTimerRef.current = window.setInterval(() => {
        setVoiceElapsedTime(Math.floor((performance.now() - voiceRecordingStartedAtRef.current) / 1000));
      }, 100);
      setIsRecordingVoiceNote(true);
      setAttachmentStatus('');
    } catch (error) {
      if (voiceWaveformTimerRef.current !== null) window.clearInterval(voiceWaveformTimerRef.current);
      voiceWaveformTimerRef.current = null;
      if (voiceElapsedTimerRef.current !== null) window.clearInterval(voiceElapsedTimerRef.current);
      voiceElapsedTimerRef.current = null;
      if (voiceAudioContextRef.current?.state !== 'closed') await voiceAudioContextRef.current?.close();
      voiceAudioContextRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
      voiceRecorderRef.current = null;
      setAttachmentStatus(`Could not start voice recording: ${error.message || 'microphone access was denied.'}`);
    } finally {
      setIsStartingVoiceNote(false);
    }
  };

  const stopVoiceNote = () => {
    const recorder = voiceRecorderRef.current;
    if (recorder?.state !== 'recording') return;
    recorder.stop();
  };

  const discardVoiceNote = () => {
    voiceDiscardRef.current = true;
    if (voiceRecorderRef.current?.state === 'recording') {
      voiceRecorderRef.current.stop();
    } else {
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
      if (voiceWaveformTimerRef.current !== null) window.clearInterval(voiceWaveformTimerRef.current);
      voiceWaveformTimerRef.current = null;
      if (voiceElapsedTimerRef.current !== null) window.clearInterval(voiceElapsedTimerRef.current);
      voiceElapsedTimerRef.current = null;
      setIsStartingVoiceNote(false);
      setShowVoiceNoteDialog(false);
      setVoiceDraft(null);
      setVoiceLiveWaveform([]);
      setAttachmentStatus('');
      if (voiceDraftUrlRef.current) URL.revokeObjectURL(voiceDraftUrlRef.current);
      voiceDraftUrlRef.current = '';
    }
  };

  const addVoiceNoteToBoard = async () => {
    if (!voiceDraft || isAddingAttachment) return;
    const saved = await addAttachmentFile(voiceDraft.file, {
      duration: voiceDraft.duration,
      waveform: voiceDraft.waveform,
    });
    if (!saved) return;
    setShowVoiceNoteDialog(false);
    setVoiceDraft(null);
    setVoiceLiveWaveform([]);
    if (voiceDraftUrlRef.current) URL.revokeObjectURL(voiceDraftUrlRef.current);
    voiceDraftUrlRef.current = '';
  };

  const confirmRemoveAttachment = () => {
    if (!pendingDeleteItem) return;
    const item = pendingDeleteItem;
    window.clearTimeout(wallHistoryRef.current.timer);
    wallHistoryRef.current.timer = null;
    if (item.type === 'markdownLink') {
      setNotes((current) => current.map((note) => String(note.id) === String(item.noteId)
        ? { ...note, pinnedLinks: (note.pinnedLinks || []).filter((link) => String(link.id) !== String(item.id)) }
        : note));
    } else if (item.type === 'note') {
      setNotes((current) => current.filter((note) => String(note.id) !== String(item.id)));
      setWall((current) => withoutWallBoardNode(current, item.type, item.id), false);
    } else if (item.type === 'task') {
      setTasks((current) => current.filter((task) => String(task.id) !== String(item.id)));
      setWall((current) => withoutWallBoardNode(current, item.type, item.id), false);
    } else if (item.type === 'webclip') {
      setWall((current) => withoutWallWebClip(current, item.id));
    } else if (item.type === 'attachment') {
      setWall((current) => withoutWallAttachment(current, item.id));
    } else {
      throw new Error(`Unsupported item type for deletion: ${item.type}`);
    }
    setPendingDeleteItem(null);
    if (item.type === 'markdownLink') {
      setWebClipStatus(`“${item.title}” removed from its note.`);
    } else if (item.type === 'webclip') {
      setWebClipStatus(`“${item.title}” removed from the wall. Use Undo to restore it.`);
    } else if (item.type === 'attachment') {
      setAttachmentStatus(`${item.name} removed from the wall. Use Undo to restore it.`);
    } else {
      setWallSaveStatus(`${item.type === 'note' ? 'Note' : 'Task'} removed from this board.`);
    }
  };

  const getEndpointLabel = (type, id) => {
    if (type === 'task') return tasks.find((task) => String(task.id) === String(id))?.title || 'task';
    if (type === 'attachment') return wall.attachments?.find((item) => String(item.id) === String(id))?.name || 'attachment';
    if (type === 'webclip') return wall.webClips?.find((item) => String(item.id) === String(id))?.title || 'web clip';
    return getWallNoteTitle(notes.find((note) => String(note.id) === String(id)) || {});
  };

  const openCommentThread = (type, id, title) => {
    setThreadNode({ type, id: String(id), title });
    setThreadDraft('');
  };

  const closeCommentThread = () => {
    setThreadNode(null);
    setThreadDraft('');
  };

  const addThreadComment = (event) => {
    event.preventDefault();
    const text = threadDraft.trim();
    if (!threadNode || !text) return;
    const key = `${threadNode.type}:${threadNode.id}`;
    setWall((current) => ({
      ...current,
      comments: {
        ...(current.comments || {}),
        [key]: [...(current.comments?.[key] || []), {
          id: crypto.randomUUID(),
          author: 'You',
          text,
          createdAt: new Date().toISOString(),
        }],
      },
    }));
    setThreadDraft('');
  };

  const copyWebClipperBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(webClipperBookmarklet);
      setWebClipStatus('Clipper copied. Add it as a browser bookmark, then click it on any article.');
    } catch (error) {
      bookmarkletRef.current?.focus();
      bookmarkletRef.current?.select();
      setWebClipStatus(`Clipboard access failed: ${error.message || 'copy the selected bookmarklet text manually.'}`);
    }
  };

  const addWebClip = async (event) => {
    event.preventDefault();
    let metadata;
    try {
      metadata = normalizeWebClip({ url: webClipUrl, title: webClipTitle });
    } catch (error) {
      setWebClipError(error.message || 'Could not add this link.');
      return;
    }
    setIsFetchingWebClipMetadata(true);
    setWebClipError('');
    let metadataWarning = '';
    let metadataAvailable = false;
    try {
      const fetchedMetadata = await fetchWebClipMetadata(metadata.url);
      metadataAvailable = fetchedMetadata.metadataAvailable;
      metadata = normalizeWebClip({
        ...fetchedMetadata,
        title: webClipTitle.trim() || fetchedMetadata.title,
      });
    } catch (error) {
      metadataWarning = error.message || 'The page metadata could not be read.';
    } finally {
      setIsFetchingWebClipMetadata(false);
    }
    const compact = !metadataAvailable;
    const clip = { id: crypto.randomUUID(), ...metadata, compact, clippedAt: new Date().toISOString(), category: 'Inbox' };
    const clipSize = getCompactWebClipSize(clip);
    setWall((current) => ({
      ...current,
      webClips: [...(current.webClips || []), clip],
      positions: { ...current.positions, [clip.id]: getNextAttachmentPosition(current, notes, tasks, clipSize) },
      sizes: { ...current.sizes, [clip.id]: clipSize },
    }));
    setWebClipUrl('');
    setWebClipTitle('');
    setShowAddLinkDialog(false);
    const metadataStatus = metadataWarning
      ? ` Page metadata unavailable: ${metadataWarning} You can use the Web clipper bookmarklet instead.`
      : metadata.image && metadata.author
        ? ' Thumbnail and author loaded.'
        : metadata.image
          ? ' Thumbnail loaded; the page did not provide an author.'
          : metadata.author
            ? ' Author loaded; the page did not provide a thumbnail.'
            : ' This page did not provide a thumbnail or author.';
    setWebClipStatus(`Pinned “${clip.title}” to the wall.${metadataStatus}`);
  };

  const pinWebClipToNote = (clipId, noteId) => {
    const note = notes.find((item) => String(item.id) === String(noteId));
    if (!note) return;
    setWall((current) => {
      const clip = current.webClips.find((item) => String(item.id) === String(clipId));
      if (!clip || String(clip.attachedTo) === String(noteId)) return current;
      const offset = getAttachedLinkOffset(note, 0, current);
      return {
        ...current,
        webClips: current.webClips.map((item) => String(item.id) === String(clipId)
          ? { ...item, attachedTo: String(noteId), anchorOffset: { x: offset.x, y: offset.y } }
          : item),
        positions: { ...current.positions, [clipId]: { x: offset.notePosition.x + offset.x, y: offset.notePosition.y + offset.y } },
      };
    });
  };

  const unpinWebClip = (clipId) => {
    setWall((current) => ({
      ...current,
      webClips: current.webClips.map((clip) => {
        if (String(clip.id) !== String(clipId)) return clip;
        const { attachedTo: _attachedTo, anchorOffset: _anchorOffset, ...detachedClip } = clip;
        return detachedClip;
      }),
    }));
  };

  const openLinkEditor = (type, item, noteId) => {
    setEditingLink({ type, id: item.id, noteId });
    setLinkDraft({ url: item.url, label: item.label || item.title || '' });
    setWebClipError('');
  };

  const saveLinkEdit = async (event) => {
    event.preventDefault();
    let normalized;
    try {
      normalized = normalizeWebClip({ url: linkDraft.url, title: linkDraft.label });
    } catch (error) {
      setWebClipError(error.message || 'Enter a valid web link.');
      return;
    }

    if (editingLink.type === 'markdownLink') {
      const updatedLink = { url: normalized.url, label: linkDraft.label.trim() || new URL(normalized.url).hostname };
      const updateNoteLink = (note) => {
        if (String(note.id) !== String(editingLink.noteId)) return note;
        const oldLink = note.pinnedLinks?.find((link) => String(link.id) === String(editingLink.id));
        if (!oldLink) return note;
        const text = replaceMarkdownLink(note.text || '', oldLink.url, updatedLink.url, updatedLink.label);
        const pinnedLinks = (note.pinnedLinks || []).map((link) => String(link.id) === String(editingLink.id)
          ? { ...link, ...updatedLink }
          : link);
        return { ...note, text, pinnedLinks };
      };
      setNotes((current) => current.map(updateNoteLink));
      setSelectedNote((current) => current ? updateNoteLink(current) : current);
      setEditingLink(null);
      return;
    }

    const currentClip = wallRef.current.webClips.find((clip) => String(clip.id) === String(editingLink.id));
    if (!currentClip) {
      setWebClipError('This link is no longer on the wall.');
      return;
    }
    let updatedClip = { ...currentClip, title: linkDraft.label.trim() || currentClip.title };
    if (normalized.url !== currentClip.url) {
      updatedClip = {
        ...currentClip,
        ...normalized,
        id: currentClip.id,
        title: linkDraft.label.trim() || normalized.title,
        category: currentClip.category,
        clippedAt: currentClip.clippedAt,
        compact: true,
      };
      setIsFetchingWebClipMetadata(true);
      try {
        const metadata = await fetchWebClipMetadata(normalized.url);
        const normalizedMetadata = normalizeWebClip({
          ...metadata,
          url: normalized.url,
          title: linkDraft.label.trim() || metadata.title,
        });
        updatedClip = {
          ...currentClip,
          ...normalizedMetadata,
          compact: !metadata.metadataAvailable,
        };
      } catch (error) {
        setWebClipStatus(`Link updated, but metadata could not be loaded: ${error.message || 'the site blocked access.'}`);
      } finally {
        setIsFetchingWebClipMetadata(false);
      }
    }
    const clipSize = getCompactWebClipSize(updatedClip);
    setWall((current) => ({
      ...current,
      webClips: current.webClips.map((clip) => String(clip.id) === String(updatedClip.id) ? updatedClip : clip),
      sizes: { ...current.sizes, [updatedClip.id]: clipSize },
    }));
    setEditingLink(null);
  };

  const togglePinnedMarkdownLink = (noteId, link) => {
    const note = notes.find((item) => String(item.id) === String(noteId));
    if (!note) return;
    const pinnedLinks = note.pinnedLinks || [];
    const nextPinnedLinks = pinnedLinks.some((item) => item.url === link.url)
      ? pinnedLinks.filter((item) => item.url !== link.url)
      : (() => {
          const offset = getAttachedLinkOffset(note, 0, wall);
          return [...pinnedLinks, {
            id: crypto.randomUUID(),
            url: link.url,
            label: link.label,
            anchorOffset: { x: offset.x, y: offset.y },
          }];
        })();
    setNotes((current) => current.map((item) => String(item.id) === String(noteId)
      ? { ...item, pinnedLinks: nextPinnedLinks }
      : item));
    setSelectedNote((current) => current && String(current.id) === String(noteId)
      ? { ...current, pinnedLinks: nextPinnedLinks }
      : current);
  };

  const openBoardNoteEditor = (note = null) => {
    setEditingBoardNoteId(note?.id ?? null);
    setBoardNoteDraft({
      title: note?.title || '',
      text: note?.text || '',
      tags: (note?.tags || []).join(', '),
      category: note?.category || 'Inbox',
      markdown: note?.markdown !== false,
    });
    setNoteEditorTab('write');
    setNewNoteFolderName('');
    setNewNoteFolderError('');
    setIsCreatingNoteFolder(false);
    setShowBoardNoteDialog(true);
  };

  const saveBoardNote = (event) => {
    event.preventDefault();
    if (!boardId) return;
    const text = boardNoteDraft.text.trim();
    const firstLine = text.split(/\r?\n/).find((line) => line.trim())?.trim() || '';
    const title = boardNoteDraft.title.trim() || (boardNoteDraft.markdown ? firstLine.replace(/^#{1,6}\s*/, '') : firstLine) || 'Untitled note';
    const tags = [...new Set(boardNoteDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean))];
    if (editingBoardNoteId !== null) {
      setNotes((current) => current.map((note) => {
        if (String(note.id) !== String(editingBoardNoteId)) return note;
        const updatedNote = { ...note, title, text, tags, category: boardNoteDraft.category, markdown: boardNoteDraft.markdown };
        return {
          ...updatedNote,
          pinnedLinks: boardNoteDraft.markdown ? syncPinnedMarkdownLinks(updatedNote, text, wallRef.current) : [],
        };
      }));
    } else {
      const note = { id: crypto.randomUUID(), title, text, tags, category: boardNoteDraft.category, color: 'yellow', markdown: boardNoteDraft.markdown };
      const newNote = {
        ...note,
        pinnedLinks: boardNoteDraft.markdown ? syncPinnedMarkdownLinks(note, text, wallRef.current) : [],
      };
      setNotes((current) => [...current, newNote]);
      setWall((current) => ({
        ...current,
        positions: { ...current.positions, [note.id]: getNextAttachmentPosition(current, notes, tasks, { width: CARD_WIDTH, height: CARD_HEIGHT }) },
        sizes: { ...current.sizes, [note.id]: { width: CARD_WIDTH, height: CARD_HEIGHT } },
      }));
    }
    setShowBoardNoteDialog(false);
    setEditingBoardNoteId(null);
    setBoardNoteDraft({ title: '', text: '', tags: '', category: 'Inbox', markdown: true });
  };

  const createFolderFromNoteEditor = () => {
    const name = newNoteFolderName.trim();
    if (!name) {
      setNewNoteFolderError('Enter a folder name first.');
      return;
    }
    if ([...new Set([...categories, ...taskCategories])].some((category) => category.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setNewNoteFolderError('This folder already exists on the board.');
      return;
    }
    setCategories((current) => [...current, name]);
    setTaskCategories((current) => [...current, name]);
    setBoardNoteDraft((current) => ({ ...current, category: name }));
    setNewNoteFolderName('');
    setNewNoteFolderError('');
    setIsCreatingNoteFolder(false);
  };

  const addBoardFolder = (event) => {
    event.preventDefault();
    const name = boardFolderDraft.trim();
    if (!boardId || !name) return;
    if ([...new Set([...categories, ...taskCategories])].some((category) => category.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setBoardFolderError('A folder with this name already exists.');
      return;
    }
    setCategories((current) => [...current, name]);
    setTaskCategories((current) => [...current, name]);
    setBoardFolderDraft('');
    setBoardFolderError('');
    setShowBoardFolderDialog(false);
  };

  const addBoardTask = (event) => {
    event.preventDefault();
    if (!boardId || !boardTaskDraft.title.trim()) return;
    const task = {
      id: crypto.randomUUID(),
      title: boardTaskDraft.title.trim(),
      category: boardTaskDraft.category,
      priority: boardTaskDraft.priority,
      completed: false,
      reminder: null,
      createdAt: new Date().toISOString(),
    };
    setTasks((current) => [...current, task]);
    setWall((current) => ({
      ...current,
      taskPositions: {
        ...current.taskPositions,
        [task.id]: getNextAttachmentPosition(current, notes, tasks, { width: 220, height: 42 }),
      },
    }));
    setBoardTaskDraft({ title: '', priority: 'medium', category: 'Inbox' });
    setShowBoardTaskDialog(false);
  };

  const toggleBoardTask = (taskId) => {
    if (!boardId) return;
    setTasks((current) => current.map((task) => String(task.id) === String(taskId)
      ? { ...task, completed: !task.completed }
      : task));
  };

  const renderCommentButton = (type, id, title) => {
    const count = wall.comments?.[`${type}:${id}`]?.length || 0;
    return (
      <button
        type="button"
        className="note-wall-comments-trigger"
        aria-label={`Open comments for ${title} (${count})`}
        title={count ? `${count} ${count === 1 ? 'comment' : 'comments'}` : 'Open comments'}
        onClick={() => openCommentThread(type, id, title)}
      >
        <MessageCircle size={13} />
        {count > 0 && <span>{count}</span>}
      </button>
    );
  };

  const renderWebClipCard = (clip, attachedNote = null) => {
    const attached = Boolean(attachedNote);
    const storedPosition = wall.positions[clip.id] || { x: 30, y: 30 };
    const offset = attached
      ? clip.anchorOffset || getAttachedLinkOffset(attachedNote, 0, wall)
      : null;
    const compactSize = getCompactWebClipSize(clip);
    const style = attached
      ? { left: offset.x, top: offset.y, '--note-wall-clip-width': `${compactSize.width}px`, '--note-wall-clip-height': `${compactSize.height}px` }
      : { left: storedPosition.x, top: storedPosition.y, '--note-wall-clip-width': `${compactSize.width}px`, '--note-wall-clip-height': `${compactSize.height}px` };
    const host = new URL(clip.url).hostname.replace(/^www\./, '');

    return (
      <article
        key={`webclip:${clip.id}`}
        className={`note-wall-webclip is-compact${attached ? ' is-attached' : ''}`}
        data-node-id={String(clip.id)}
        data-node-type="webclip"
        aria-label={`Web clip: ${clip.title}`}
        style={style}
      >
        <div className="note-wall-webclip-toolbar">
          <button
            type="button"
            className="note-wall-webclip-move"
            aria-label={`Move web clip ${clip.title}`}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const point = getBoardPoint(event);
              gestureRef.current = { type: 'move-node', nodeType: 'webclip', id: clip.id, offsetX: point.x - storedPosition.x, offsetY: point.y - storedPosition.y };
            }}
          >
            <GripVertical size={15} aria-hidden="true" />
          </button>
          <span className="note-wall-webclip-kind">{attached ? 'PINNED' : 'WEB CLIP'}</span>
          <details className="note-wall-webclip-pin-menu" onClick={(event) => event.stopPropagation()}>
            <summary role="button" aria-label={`${attached ? 'Move or unpin' : 'Pin'} ${clip.title} ${attached ? 'from note' : 'to a note'}`} title={attached ? 'Move or unpin from note' : 'Pin to a note'}>
              <Pin size={14} fill={attached ? 'currentColor' : 'none'} />
            </summary>
            <div className="note-wall-webclip-pin-options">
              {attached && <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); unpinWebClip(clip.id); }}>Unpin from note</button>}
              {notes.filter((note) => String(note.id) !== String(clip.attachedTo)).map((note) => (
                <button key={note.id} type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); pinWebClipToNote(clip.id, note.id); }}>
                  Pin to {getWallNoteTitle(note)}
                </button>
              ))}
              {!notes.length && <span>Add a note before pinning this link.</span>}
            </div>
          </details>
          <details className="note-wall-link-actions-menu" onClick={(event) => event.stopPropagation()}>
            <summary role="button" aria-label={`More actions for link ${clip.title}`} title="More link actions"><Ellipsis size={17} /></summary>
            <div className="note-wall-webclip-pin-options">
              <button type="button" onClick={(event) => {
                event.currentTarget.closest('details')?.removeAttribute('open');
                openLinkEditor('webclip', clip);
              }}><Pencil size={13} /> Edit link</button>
              <button type="button" className="is-destructive" onClick={(event) => {
                event.currentTarget.closest('details')?.removeAttribute('open');
                setPendingDeleteItem({ ...clip, type: 'webclip' });
              }}><Trash2 size={13} /> Delete link</button>
            </div>
          </details>
          {renderCommentButton('webclip', clip.id, clip.title)}
        </div>
        <a className="note-wall-webclip-title" href={clip.url} target="_blank" rel="noopener noreferrer">{clip.title}</a>
        {(clip.siteName || host).toLocaleLowerCase() !== (clip.title || '').toLocaleLowerCase() && (
          <span className="note-wall-webclip-site-name"><Globe2 size={11} aria-hidden="true" />{clip.siteName || host}</span>
        )}
        <div className="note-wall-webclip-preview">
          <strong className="note-wall-webclip-preview-title">{clip.title}</strong>
          {clip.image && <img className="note-wall-webclip-image" src={clip.image} alt="" loading="lazy" />}
          {clip.description && <p className="note-wall-webclip-description">{clip.description}</p>}
          <div className="note-wall-webclip-meta">
            {clip.author && <span>{clip.author}</span>}
            {clip.publishedAt && <span>{clip.publishedAt}</span>}
            <a href={clip.url} target="_blank" rel="noopener noreferrer" title={clip.url}>{host}</a>
          </div>
        </div>
        {CONNECTION_ANCHORS.map((anchor) => (
          <button
            key={anchor}
            type="button"
            className={`note-wall-connect-handle is-${anchor}`}
            aria-label={`Drag from ${anchor} edge of ${clip.title} to connect`}
            title={`Drag from ${anchor} edge to connect`}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              gestureRef.current = { type: 'connect', nodeType: 'webclip', id: clip.id, anchor };
              setConnectionPreview({ from: clip.id, fromType: 'webclip', anchor, ...getBoardPoint(event) });
            }}
          />
        ))}
        {wall.connections.filter((connection) =>
          (connection.fromType === 'webclip' && String(connection.from) === String(clip.id))
          || (connection.toType === 'webclip' && String(connection.to) === String(clip.id))).map((connection) => (
          <button
            key={connection.id}
            type="button"
            className="note-wall-unlink"
            aria-label="Remove connection"
            title="Remove connection"
            onClick={() => setWall((current) => ({ ...current, connections: current.connections.filter((item) => item.id !== connection.id) }))}
          ><Unlink size={13} /></button>
        ))}
      </article>
    );
  };

  const threadComments = threadNode
    ? wall.comments?.[`${threadNode.type}:${threadNode.id}`] || []
    : [];

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

  useEffect(() => {
    if (!threadNode) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeCommentThread();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [threadNode]);

  useEffect(() => {
    const closeLinkMenus = (event) => {
      const currentMenu = event.target instanceof Element
        ? event.target.closest('.note-wall-webclip-pin-menu, .note-wall-link-actions-menu')
        : null;
      boardRef.current?.querySelectorAll('.note-wall-webclip-pin-menu[open], .note-wall-link-actions-menu[open]').forEach((menu) => {
        if (menu !== currentMenu) menu.removeAttribute('open');
      });
    };
    const closeMenusOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      boardRef.current?.querySelectorAll('.note-wall-webclip-pin-menu[open], .note-wall-link-actions-menu[open]').forEach((menu) => menu.removeAttribute('open'));
    };
    document.addEventListener('pointerdown', closeLinkMenus);
    document.addEventListener('keydown', closeMenusOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeLinkMenus);
      document.removeEventListener('keydown', closeMenusOnEscape);
    };
  }, []);

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
        } else if (gesture.nodeType === 'markdownLink') {
          const notePosition = wall.positions[gesture.noteId] || { x: 30, y: 30 };
          setNotes((current) => current.map((note) => String(note.id) === String(gesture.noteId)
            ? {
                ...note,
                pinnedLinks: (note.pinnedLinks || []).map((link) => String(link.id) === String(gesture.id)
                  ? {
                      ...link,
                      anchorOffset: {
                        x: Math.max(0, nextPosition.x - notePosition.x),
                        y: Math.max(0, nextPosition.y - notePosition.y),
                      },
                    }
                  : link),
              }
            : note));
        } else {
          setWall((current) => {
            const previousPosition = current.positions[gesture.id] || { x: 30, y: 30 };
            const deltaX = nextPosition.x - previousPosition.x;
            const deltaY = nextPosition.y - previousPosition.y;
            const positions = { ...current.positions, [gesture.id]: nextPosition };
            let webClips = current.webClips;
            if (gesture.nodeType === 'note') {
              webClips
                .filter((clip) => String(clip.attachedTo) === String(gesture.id))
                .forEach((clip) => {
                  const clipPosition = positions[clip.id] || { x: previousPosition.x + (clip.anchorOffset?.x || 0), y: previousPosition.y + (clip.anchorOffset?.y || 0) };
                  positions[clip.id] = { x: clipPosition.x + deltaX, y: clipPosition.y + deltaY };
                });
            }
            if (gesture.nodeType === 'webclip') {
              const clip = current.webClips.find((item) => String(item.id) === String(gesture.id));
              if (clip?.attachedTo) {
                const notePosition = current.positions[clip.attachedTo] || { x: 30, y: 30 };
                webClips = current.webClips.map((item) => String(item.id) === String(gesture.id)
                  ? { ...item, anchorOffset: { x: nextPosition.x - notePosition.x, y: nextPosition.y - notePosition.y } }
                  : item);
              }
            }
            return { ...current, positions, webClips };
          });
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
            : wall.sizes?.[to] || (toType === 'attachment'
              ? DEFAULT_ATTACHMENT_SIZE
              : toType === 'webclip' ? DEFAULT_WEB_CLIP_SIZE : { width: CARD_WIDTH, height: CARD_HEIGHT });
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
    if (!panMode || event.target.closest('.note-wall-card, .note-wall-attachment, .note-wall-webclip, .note-wall-task') || event.target.closest('button')) return;
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
    if (!pendingDeleteItem) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setPendingDeleteItem(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [pendingDeleteItem]);

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
    if (boardId) storageManager.saveNoteWallBoard(boardId, { notes: updatedNotes });
    else storageManager.saveStickyNotes(updatedNotes);
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
    if (!visibleNotes.length && !visibleTasks.length && !visibleAttachments.length && !visibleWebClips.length) return;
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
    const webClipNodes = visibleWebClips.filter((clip) => !clip.attachedTo).map((clip) => ({ ...clip, type: 'webclip' }));
    const layout = tidyWallLayout([...visibleNotes, ...attachmentNodes, ...webClipNodes], { ...wall, connections: sourceConnections }, taskNodes);
    const contentNodes = [
      ...visibleNotes.map((note) => ({ ...note, type: 'note' })),
      ...attachmentNodes,
      ...webClipNodes,
      ...taskNodes,
    ];
    const contentBounds = contentNodes.reduce((bounds, node) => {
      const isTask = node.type === 'task';
      const position = isTask ? layout.taskPositions[node.id] : layout.positions[node.id];
      if (!position) return bounds;
      const dimensions = isTask
        ? { width: 180, height: 42 }
        : wall.sizes?.[node.id] || (node.type === 'attachment'
          ? DEFAULT_ATTACHMENT_SIZE
          : node.type === 'webclip' ? DEFAULT_WEB_CLIP_SIZE : { width: CARD_WIDTH, height: CARD_HEIGHT });
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
      positions: {
        ...current.positions,
        ...centeredPositions,
        ...Object.fromEntries(current.webClips
          .filter((clip) => clip.attachedTo)
          .map((clip) => {
            const notePosition = centeredPositions[clip.attachedTo] || current.positions[clip.attachedTo] || { x: 30, y: 30 };
            const offset = clip.anchorOffset || { x: 0, y: 0 };
            return [clip.id, { x: notePosition.x + offset.x, y: notePosition.y + offset.y }];
          })),
      },
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
        ...(boardId ? { boardName } : {}),
        categories,
        notes,
        tasks,
        wall,
      };
      const driveFileKey = boardId ? `kazedesk_note_wall_drive_file_id_${boardId}` : 'kazedesk_note_wall_drive_file_id';
      const storedId = localStorage.getItem(driveFileKey);
      const fileId = await savePrivateDriveFile(token, data, storedId);
      localStorage.setItem(driveFileKey, fileId);
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

  const closeToolbarMenu = (event) => {
    event.currentTarget.closest('details')?.removeAttribute('open');
  };

  const positionConnectionPanel = useCallback(() => {
    const details = connectionPanelRef.current;
    const panel = details?.querySelector('.note-wall-connection-panel');
    const summary = details?.querySelector('summary');
    if (!details?.open || !panel || !summary) return;

    const viewportPadding = 16;
    const panelWidth = Math.min(760, window.innerWidth - viewportPadding * 2);
    const panelHeight = Math.min(panel.scrollHeight, window.innerHeight - viewportPadding * 2);
    const summaryBounds = summary.getBoundingClientRect();
    const left = Math.min(
      Math.max(viewportPadding, summaryBounds.left),
      window.innerWidth - panelWidth - viewportPadding,
    );
    const top = Math.max(
      viewportPadding,
      Math.min(summaryBounds.bottom + 8, window.innerHeight - panelHeight - viewportPadding),
    );

    Object.assign(panel.style, {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${panelWidth}px`,
      maxHeight: `${window.innerHeight - top - viewportPadding}px`,
    });
  }, []);

  const saveStatusLabel = wallSaveStatus === 'Changes save automatically in this browser'
    ? 'Changes saved locally'
    : wallSaveStatus;

  useEffect(() => {
    window.addEventListener('resize', positionConnectionPanel);
    return () => window.removeEventListener('resize', positionConnectionPanel);
  }, [positionConnectionPanel]);

  return (
    <main className={`note-wall-page landing-theme-${theme}${isPrinting ? ' is-printing' : ''}`}>
      <header className="note-wall-toolbar">
        <div className="note-wall-heading">
          <Link to={boardId ? '/wall/boards' : '/dashboard'} aria-label={boardId ? 'Back to boards' : 'Back to dashboard'} title={boardId ? 'Back to boards' : 'Back to dashboard'}><ArrowLeft size={17} /></Link>
          <div className="note-wall-heading-copy">
            <h1>{boardId ? boardName : 'Sticky note wall'}</h1>
            <div className="note-wall-heading-meta" aria-label="Board contents">
              <span title={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`} aria-label={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}><StickyNote size={12} />{notes.length}</span>
              <span title={`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`} aria-label={`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}><CheckCircle2 size={12} />{tasks.length}</span>
              <span title={`${wall.attachments?.length || 0} ${wall.attachments?.length === 1 ? 'attachment' : 'attachments'}`} aria-label={`${wall.attachments?.length || 0} ${wall.attachments?.length === 1 ? 'attachment' : 'attachments'}`}><FilePlus2 size={12} />{wall.attachments?.length || 0}</span>
              <span title={`${wall.webClips?.length || 0} ${wall.webClips?.length === 1 ? 'link' : 'links'}`} aria-label={`${wall.webClips?.length || 0} ${wall.webClips?.length === 1 ? 'link' : 'links'}`}><Link2 size={12} />{wall.webClips?.length || 0}</span>
              <span
                className={`note-wall-save-indicator${wallSaveStatus.startsWith('Could not') ? ' is-error' : ''}`}
                role="status"
                aria-live="polite"
                aria-label={saveStatusLabel}
                title={`${wallSaveStatus}${driveStatus ? ` · ${driveStatus}` : GOOGLE_DRIVE_CLIENT_ID ? ' · Private Drive save available' : ' · Drive setup optional'} · Attachment files stay in this browser and are not included in exports.`}
                data-tooltip={saveStatusLabel}
              >
                {wallSaveStatus.startsWith('Could not')
                  ? <><X size={14} /><span className="note-wall-visually-hidden">{wallSaveStatus}</span></>
                  : <><CheckCircle2 size={14} /><span className="note-wall-visually-hidden">{saveStatusLabel}</span></>}
              </span>
            </div>
          </div>
        </div>
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
            <details className="note-wall-toolbar-menu note-wall-add-menu">
              <summary><Plus size={15} /> Add items <ChevronDown size={13} /></summary>
              <div className="note-wall-toolbar-menu-panel">
                {boardId && <>
                  <button type="button" onClick={(event) => { closeToolbarMenu(event); openBoardNoteEditor(); }}><StickyNote size={15} /> Add note</button>
                  <button type="button" onClick={(event) => { closeToolbarMenu(event); setShowBoardTaskDialog(true); }}><CheckCircle2 size={15} /> Add task</button>
                  <button type="button" onClick={(event) => { closeToolbarMenu(event); setBoardFolderError(''); setShowBoardFolderDialog(true); }}><Plus size={15} /> New folder</button>
                </>}
                <button type="button" disabled={isAddingAttachment} title={`Add an image, PDF, or audio file (up to ${MAX_WALL_ATTACHMENT_SIZE / 1024 / 1024} MB)`} onClick={(event) => { closeToolbarMenu(event); attachmentInputRef.current?.click(); }}>
                  <FilePlus2 size={15} /> {isAddingAttachment ? 'Adding…' : 'Add attachment'}
                </button>
                <button type="button" disabled={isAddingAttachment || isStartingVoiceNote || isRecordingVoiceNote} onClick={(event) => { closeToolbarMenu(event); startVoiceNote(); }}>
                  <Mic size={15} /> {isStartingVoiceNote ? 'Requesting microphone…' : 'Record voice note'}
                </button>
                <button type="button" onClick={(event) => { closeToolbarMenu(event); setWebClipError(''); setShowAddLinkDialog(true); }}>
                  <Link2 size={15} /> Add link
                </button>
                <button type="button" title="Set up the browser bookmarklet to clip pages with their metadata" onClick={(event) => { closeToolbarMenu(event); setShowWebClipperSetup(true); }}>
                  <Globe2 size={15} /> Web clipper
                </button>
              </div>
            </details>
            <span className="note-wall-attachment-status" role="status" aria-live="polite">
              {webClipStatus || attachmentStatus}
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
            <button type="button" className="note-wall-primary-action" aria-label="Tidy & center" onClick={() => setShowTidyConfirmation(true)} disabled={!visibleNotes.length && !visibleTasks.length && !visibleAttachments.length && !visibleWebClips.length} title="Arrange and center notes, attachments, web clips, and tasks">
              <AlignCenter size={16} /> Tidy
            </button>
            <button
              type="button"
              className={`note-wall-tool-toggle${hideOrphanTasks ? ' is-active' : ''}`}
              aria-pressed={hideOrphanTasks}
              onClick={() => setHideOrphanTasks((hidden) => !hidden)}
              title="Hide tasks in Inbox or without a custom folder"
            >
              {hideOrphanTasks ? <EyeOff size={15} /> : <Eye size={15} />}
              <span>{hideOrphanTasks ? 'Show orphan tasks' : 'Hide orphan tasks'}</span>
            </button>
            <div className="note-wall-undo-redo" role="toolbar" aria-label="Edit history">
              <button type="button" aria-label="Undo" title="Undo wall change" disabled={!canUndo} onClick={undoWallChange}>
                <Undo2 size={15} /> Undo
              </button>
              <button type="button" aria-label="Redo" title="Redo wall change" disabled={!canRedo} onClick={redoWallChange}>
                <Redo2 size={15} /> Redo
              </button>
            </div>
            {(visibleNotes.length > 0 || visibleTasks.length > 0 || visibleAttachments.length > 0 || visibleWebClips.length > 0) && <div className="note-wall-board-actions" role="toolbar" aria-label="Board navigation">
              <button type="button" className={panMode ? 'is-active' : ''} aria-pressed={panMode} onClick={() => setPanMode((active) => !active)} title="Move board">
                <Hand size={15} /><span>Move</span>
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
            {(visibleNotes.length > 0 || visibleAttachments.length > 0 || visibleWebClips.length > 0) && (
              <details className="note-wall-connection-tools" ref={connectionPanelRef} onToggle={positionConnectionPanel}>
                <summary aria-label="Connections"><Link2 size={15} /> Connections{visibleConnections.length ? <span className="note-wall-connection-count">{visibleConnections.length}</span> : null}<ChevronDown size={13} /></summary>
                <div className="note-wall-connection-panel">
                  <div className="note-wall-connection-panel-heading">
                    <strong>Create a new connection</strong>
                    <span>Link notes and related items. Folder links are solid, shared tags dotted, and task links dashed.</span>
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
        </section>
        <div className="note-wall-export-actions">
          <button type="button" className="note-wall-theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <details className="note-wall-toolbar-menu note-wall-export-menu">
            <summary aria-label="Export and backup"><Download size={15} /> Export <ChevronDown size={13} /></summary>
            <div className="note-wall-toolbar-menu-panel">
              <button type="button" onClick={(event) => { closeToolbarMenu(event); exportWallPNG(visibleNotes, wall, visibleTasks, visibleAttachments, attachmentUrls, visibleWebClips).catch((error) => setDriveStatus(error.message)); }}><Download size={15} /> Export PNG</button>
              <button type="button" onClick={(event) => {
                closeToolbarMenu(event);
                setPrintScale(Math.min(1, (window.innerWidth - 80) / boardWithTasks.width, (window.innerHeight - 160) / boardWithTasks.height));
                setIsPrinting(true);
              }}><Printer size={15} /> Print / PDF</button>
              <button type="button" onClick={(event) => { closeToolbarMenu(event); exportWallMarkdown(notes, wall.attachments || [], wall.webClips || [], tasks); }}><FileText size={15} /> Export Markdown</button>
              <button type="button" onClick={(event) => { closeToolbarMenu(event); exportWallJSON(notes, categories, wall, tasks, boardId ? boardName : ''); }}><FileJson2 size={15} /> Export JSON</button>
              <button type="button" onClick={(event) => { closeToolbarMenu(event); saveToDrive(); }}><Save size={15} /> Save to Drive</button>
            </div>
          </details>
        </div>
      </header>

      {visibleNotes.length === 0 && visibleTasks.length === 0 && visibleAttachments.length === 0 && visibleWebClips.length === 0 ? (
        <div className="note-wall-empty">
          <StickyNote size={34} />
          <h2>{notes.length || tasks.length ? 'No items in this view' : boardId ? 'Start your new board' : 'Start with your notes'}</h2>
          <p>{notes.length || tasks.length
            ? 'Choose a different folder or tag group.'
            : boardId
              ? 'Add notes, tasks, files, or web links to this independent board.'
              : 'Create notes and tags on the dashboard, or add an image, PDF, or audio clip to place it on your wall.'}</p>
          {boardId ? (
            <div className="note-wall-empty-board-actions">
              <button type="button" className="note-wall-primary-action" onClick={() => openBoardNoteEditor()}><Plus size={16} /> Add note</button>
              <button type="button" className="note-wall-secondary-action" onClick={() => setShowBoardTaskDialog(true)}><Plus size={16} /> Add task</button>
              <button type="button" className="note-wall-secondary-action" onClick={() => setShowBoardFolderDialog(true)}><Plus size={16} /> New folder</button>
              <button type="button" className="note-wall-secondary-action" onClick={() => setShowAddLinkDialog(true)}><Link2 size={16} /> Add link</button>
              <button type="button" className="note-wall-secondary-action" onClick={() => attachmentInputRef.current?.click()}><FilePlus2 size={16} /> Add attachment</button>
            </div>
          ) : !notes.length && <button type="button" className="note-wall-primary-action" onClick={() => attachmentInputRef.current?.click()}><FilePlus2 size={16} /> Add attachment</button>}
          <Link to={boardId ? '/wall/boards' : '/dashboard'}>{boardId ? 'Back to boards' : 'Go to notes'}</Link>
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
                  : wall.sizes?.[connection.from] || (fromType === 'attachment'
                    ? DEFAULT_ATTACHMENT_SIZE
                    : fromType === 'webclip' ? DEFAULT_WEB_CLIP_SIZE : { width: CARD_WIDTH, height: CARD_HEIGHT });
                const toSize = toType === 'task'
                  ? { width: 180, height: 42 }
                  : wall.sizes?.[connection.to] || (toType === 'attachment'
                    ? DEFAULT_ATTACHMENT_SIZE
                    : toType === 'webclip' ? DEFAULT_WEB_CLIP_SIZE : { width: CARD_WIDTH, height: CARD_HEIGHT });
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
                  : wall.sizes?.[connectionPreview.from] || (connectionPreview.fromType === 'attachment'
                    ? DEFAULT_ATTACHMENT_SIZE
                    : connectionPreview.fromType === 'webclip' ? DEFAULT_WEB_CLIP_SIZE : { width: CARD_WIDTH, height: CARD_HEIGHT });
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
                  className={`note-wall-card${boardId ? ' is-standalone' : ''}${String(selectedCardId) === String(note.id) ? ' is-selected' : ''}`}
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
                  onDoubleClick={(event) => {
                    if (event.target.closest('button, details, a')) return;
                    selectCard(note.id);
                    setSelectedNote(note);
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
                  {renderCommentButton('note', note.id, getWallNoteTitle(note))}
                  {boardId && <NoteActionsMenu
                    noteTitle={getWallNoteTitle(note)}
                    onEdit={() => openBoardNoteEditor(note)}
                    onDelete={() => setPendingDeleteItem({ id: note.id, title: getWallNoteTitle(note), type: 'note' })}
                  />}
                  {boardId && note.markdown !== false
                    ? <div className="note-wall-note-preview"><MarkdownContent
                        source={note.text || ''}
                        compactLinks
                        pinnedLinks={note.pinnedLinks || []}
                        onPinLink={boardId ? (link) => togglePinnedMarkdownLink(note.id, link) : undefined}
                      /></div>
                    : <p>{note.text || ''}</p>}
                  <div className="note-wall-card-meta">
                    <span>{note.category || 'Inbox'}</span>
                    {(note.tags || []).map((tag) => <span key={tag}>#{tag}</span>)}
                  </div>
                  {visibleWebClips
                    .filter((clip) => String(clip.attachedTo) === String(note.id))
                    .map((clip) => renderWebClipCard(clip, note))}
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
            {boardId && visibleNotes.flatMap((note) => (note.pinnedLinks || []).map((link) => {
              const offset = link.anchorOffset || getAttachedLinkOffset(note, 0, wall);
              const notePosition = wall.positions[note.id] || { x: 30, y: 30 };
              const linkLabel = link.label || link.url;
              const safeLabel = linkLabel.replaceAll('[', '\\[').replaceAll(']', '\\]');
              const markdownUrl = link.url.replaceAll(')', '%29');
              return (
                <article
                  key={`pinned-markdown-link:${link.id}`}
                  className="note-wall-pinned-markdown-link"
                  aria-label={`Pinned note link: ${linkLabel}`}
                  data-note-id={String(note.id)}
                  style={{
                    left: notePosition.x + offset.x,
                    top: notePosition.y + offset.y,
                    '--note-wall-link-width': `${getPinnedLinkWidth(linkLabel)}px`,
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="note-wall-pinned-markdown-link-toolbar">
                    <button
                      type="button"
                      className="note-wall-pinned-markdown-link-move"
                      aria-label={`Move pinned link ${linkLabel}`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const point = getBoardPoint(event);
                        gestureRef.current = {
                          type: 'move-node',
                          nodeType: 'markdownLink',
                          id: link.id,
                          noteId: note.id,
                          offsetX: point.x - notePosition.x - offset.x,
                          offsetY: point.y - notePosition.y - offset.y,
                        };
                      }}
                    >⠿</button>
                    <button
                      type="button"
                      className="note-wall-pinned-markdown-link-unpin"
                      aria-label={`Unpin ${linkLabel} from note`}
                      title="Unpin link"
                      onClick={() => togglePinnedMarkdownLink(note.id, link)}
                    ><Pin size={13} fill="currentColor" /></button>
                    <details className="note-wall-link-actions-menu note-wall-pinned-link-actions-menu" onClick={(event) => event.stopPropagation()}>
                      <summary role="button" aria-label={`More actions for link ${linkLabel}`} title="More link actions"><Ellipsis size={16} /></summary>
                      <div className="note-wall-webclip-pin-options">
                        <button type="button" onClick={(event) => {
                          event.currentTarget.closest('details')?.removeAttribute('open');
                          openLinkEditor('markdownLink', link, note.id);
                        }}><Pencil size={13} /> Edit link</button>
                        <button type="button" className="is-destructive" onClick={(event) => {
                          event.currentTarget.closest('details')?.removeAttribute('open');
                          setPendingDeleteItem({ id: link.id, noteId: note.id, title: linkLabel, type: 'markdownLink' });
                        }}><Trash2 size={13} /> Delete link</button>
                      </div>
                    </details>
                  </div>
                  <MarkdownContent compactLinks source={`[${safeLabel}](${markdownUrl})`} />
                </article>
              );
            }))}
            {visibleAttachments.map((attachment) => {
              const position = wall.positions[attachment.id] || { x: 30, y: 30 };
              const dimensions = wall.sizes?.[attachment.id] || (attachment.mediaType === 'audio' ? DEFAULT_AUDIO_SIZE : DEFAULT_ATTACHMENT_SIZE);
              const url = attachmentUrls[attachment.id];
              return (
                <article
                  key={`attachment:${attachment.id}`}
                  className={`note-wall-attachment${attachment.mediaType === 'audio' ? ' is-audio' : ''}`}
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
                    onClick={() => setPendingDeleteItem({ ...attachment, type: 'attachment' })}
                  ><Trash2 size={14} /></button>
                  {renderCommentButton('attachment', attachment.id, attachment.name)}
                  <div className="note-wall-attachment-preview">
                    {attachmentErrors[attachment.id] ? (
                      <p role="alert">{attachmentErrors[attachment.id]}</p>
                    ) : !url ? (
                      <p role="status">Loading preview…</p>
                    ) : attachment.mediaType === 'image' ? (
                      <img src={url} alt={attachment.name} draggable="false" />
                    ) : attachment.mediaType === 'pdf' ? (
                      <iframe src={url} title={`PDF preview: ${attachment.name}`} />
                    ) : <WallAudioPlayer attachment={attachment} url={url} />}
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
            {visibleWebClips.filter((clip) => !clip.attachedTo).map((clip) => renderWebClipCard(clip))}
            {visibleTasks.map((task) => {
              const position = wall.taskPositions?.[task.id] || { x: 900, y: 42 };
              const category = task.category || 'Inbox';
              const folderColor = getWallRelationColor(`folder:${category}`);
              const priority = String(task.priority || 'medium');
              return (
                <article
                  key={`task:${task.id}`}
                  className={`note-wall-task${boardId ? ' is-standalone' : ''}`}
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
                  {renderCommentButton('task', task.id, task.title || 'Untitled task')}
                  {boardId && (
                    <>
                      <button
                        type="button"
                        className="note-wall-board-task-toggle"
                        aria-label={task.completed ? `Mark task ${task.title} open` : `Mark task ${task.title} complete`}
                        title={task.completed ? 'Mark open' : 'Mark complete'}
                        onClick={() => toggleBoardTask(task.id)}
                      >{task.completed ? <CheckCircle2 size={15} /> : <Circle size={15} />}</button>
                      <button
                        type="button"
                        className="note-wall-board-task-remove"
                        aria-label={`Delete task ${task.title}`}
                        title="Delete task"
                        onClick={() => setPendingDeleteItem({ id: task.id, title: task.title, type: 'task' })}
                      ><Trash2 size={13} /></button>
                    </>
                  )}
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
      {threadNode && (
        <div className="note-wall-modal-backdrop" role="presentation" onClick={closeCommentThread}>
          <section className="note-wall-modal note-wall-thread-dialog" role="dialog" aria-modal="true" aria-labelledby="note-wall-thread-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-modal-close" aria-label="Close comments" onClick={closeCommentThread}><X size={17} /></button>
            <h2 id="note-wall-thread-title">Discussion · {threadNode.title}</h2>
            <div className="note-wall-thread-list" role="log" aria-label={`Comments on ${threadNode.title}`} aria-live="polite">
              {threadComments.length ? threadComments.map((comment) => {
                const timestamp = new Date(comment.createdAt);
                return (
                  <article className="note-wall-thread-comment" key={comment.id}>
                    <div className="note-wall-thread-comment-meta">
                      <strong>{comment.author || 'You'}</strong>
                      <time dateTime={comment.createdAt}>{Number.isNaN(timestamp.getTime()) ? '' : timestamp.toLocaleString()}</time>
                    </div>
                    <p>{comment.text}</p>
                  </article>
                );
              }) : <p className="note-wall-thread-empty">No comments yet. Start the discussion here.</p>}
            </div>
            <form className="note-wall-thread-form" onSubmit={addThreadComment}>
              <label htmlFor="note-wall-thread-draft">Add a comment</label>
              <textarea
                id="note-wall-thread-draft"
                value={threadDraft}
                onChange={(event) => setThreadDraft(event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Write a comment…"
              />
              <div className="note-wall-thread-form-footer">
                <span>{threadDraft.length}/2000</span>
                <button type="submit" className="note-wall-secondary-action" disabled={!threadDraft.trim()}>
                  <Send size={14} /> Post comment
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {showVoiceNoteDialog && (
        <div className="note-wall-modal-backdrop note-wall-voice-backdrop" role="presentation" onClick={discardVoiceNote}>
          <section className="note-wall-modal note-wall-voice-dialog" role="dialog" aria-modal="true" aria-labelledby="note-wall-voice-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-modal-close" aria-label="Discard voice note" onClick={discardVoiceNote}><X size={17} /></button>
            <div className={`note-wall-voice-orb${isRecordingVoiceNote ? ' is-recording' : ''}${voiceDraft ? ' has-preview' : ''}`} aria-hidden="true">
              <Mic size={27} />
            </div>
            <h2 id="note-wall-voice-title">{voiceDraft ? 'Listen before saving' : isRecordingVoiceNote ? 'Recording your voice note' : 'Voice note'}</h2>
            {isRecordingVoiceNote ? (
              <>
                <p className="note-wall-voice-hint">Your note is only saved to the board when you choose Add to board.</p>
                <div className="note-wall-voice-live-wave" role="img" aria-label="Live microphone waveform">
                  {Array.from({ length: 32 }, (_, index) => {
                    const sourceIndex = index - (32 - voiceLiveWaveform.length);
                    return sourceIndex < 0 ? 12 : voiceLiveWaveform[sourceIndex];
                  }).map((height, index) => (
                    <span key={index} style={{ height: `${height}%`, '--wave-index': index }} />
                  ))}
                </div>
                <p className="note-wall-voice-timer" aria-label={`Recording time ${formatAudioTime(voiceElapsedTime)}`}>{formatAudioTime(voiceElapsedTime)}</p>
              </>
            ) : voiceDraft ? (
              <>
                <p className="note-wall-voice-hint">Play it back, then keep it or discard it before it reaches your board.</p>
                <WallAudioPlayer
                  attachment={{ name: voiceDraft.file.name, waveform: voiceDraft.waveform, duration: voiceDraft.duration }}
                  url={voiceDraft.url}
                  initialDuration={voiceDraft.duration}
                />
                <span className="note-wall-voice-file-size">{(voiceDraft.file.size / 1024).toFixed(0)} KB · saved only after you add it</span>
              </>
            ) : isStartingVoiceNote ? (
              <p className="note-wall-voice-hint" role="status">Waiting for microphone permission…</p>
            ) : attachmentStatus ? (
              <p className="note-wall-voice-error" role="alert">{attachmentStatus}</p>
            ) : (
              <p className="note-wall-voice-hint">Allow microphone access to start recording.</p>
            )}
            <div className="note-wall-voice-actions">
              {isRecordingVoiceNote ? (
                <>
                  <button type="button" className="note-wall-voice-discard" onClick={discardVoiceNote}><Trash2 size={15} /> Discard</button>
                  <button type="button" className="note-wall-voice-stop" onClick={stopVoiceNote}><Square size={14} fill="currentColor" /> Stop recording</button>
                </>
              ) : voiceDraft ? (
                <>
                  <button type="button" className="note-wall-voice-discard" onClick={discardVoiceNote}><Trash2 size={15} /> Delete recording</button>
                  <button type="button" className="note-wall-voice-save" disabled={isAddingAttachment} onClick={addVoiceNoteToBoard}>
                    <Plus size={15} /> {isAddingAttachment ? 'Adding to board…' : 'Add to board'}
                  </button>
                </>
              ) : isStartingVoiceNote ? (
                <button type="button" className="note-wall-voice-discard" onClick={discardVoiceNote}>Cancel</button>
              ) : (
                <>
                  <button type="button" className="note-wall-voice-discard" onClick={discardVoiceNote}>Close</button>
                  <button type="button" className="note-wall-voice-save" onClick={startVoiceNote}><Mic size={15} /> Try again</button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
      {showWebClipperSetup && (
        <div className="note-wall-modal-backdrop" role="presentation" onClick={() => setShowWebClipperSetup(false)}>
          <section className="note-wall-modal note-wall-webclipper-dialog" role="dialog" aria-modal="true" aria-labelledby="note-wall-webclipper-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-modal-close" aria-label="Close web clipper setup" onClick={() => setShowWebClipperSetup(false)}><X size={17} /></button>
            <h2 id="note-wall-webclipper-title">Save pages to your wall</h2>
            <p>The bookmarklet reads the current page’s title, canonical URL, description, site, author, publication date, and preview image, then opens a web clip node on this wall. Metadata goes directly to this Kazedesk site; no third-party extraction service is used.</p>
            <ol className="note-wall-webclipper-steps">
              <li>Copy the bookmarklet below.</li>
              <li>Create a browser bookmark and paste the copied text into its URL field.</li>
              <li>On any page you want to save, click that bookmark. Return here to find its node.</li>
            </ol>
            <label className="note-wall-webclipper-code-label" htmlFor="note-wall-webclipper-code">Bookmarklet code</label>
            <textarea
              ref={bookmarkletRef}
              id="note-wall-webclipper-code"
              className="note-wall-webclipper-code"
              readOnly
              value={webClipperBookmarklet}
              onFocus={(event) => event.target.select()}
              rows={4}
            />
            <div className="note-wall-webclipper-actions">
              <button type="button" className="note-wall-secondary-action" onClick={copyWebClipperBookmarklet}>Copy bookmarklet</button>
              <button type="button" className="note-wall-cancel-tidy" onClick={() => setShowWebClipperSetup(false)}>Done</button>
            </div>
            <p className="note-wall-webclipper-note">Use the bookmarklet only on pages you trust. Captured metadata is stored with this wall in this browser.</p>
          </section>
        </div>
      )}
      {showAddLinkDialog && (
        <div className="note-wall-modal-backdrop" role="presentation" onClick={() => setShowAddLinkDialog(false)}>
          <section className="note-wall-modal note-wall-add-link-dialog" role="dialog" aria-modal="true" aria-labelledby="note-wall-add-link-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-modal-close" aria-label="Close add link" onClick={() => setShowAddLinkDialog(false)}><X size={17} /></button>
            <h2 id="note-wall-add-link-title">Pin a link to the wall</h2>
            <p>Add a page URL as a movable card. Kazedesk will try to load its thumbnail and author; some sites block browser access to page metadata. You can drag the card beside a note and connect it on the board.</p>
            <form className="note-wall-add-link-form" onSubmit={addWebClip}>
              <label htmlFor="note-wall-add-link-url">Page URL</label>
              <input
                id="note-wall-add-link-url"
                type="url"
                required
                autoFocus
                value={webClipUrl}
                onChange={(event) => setWebClipUrl(event.target.value)}
                placeholder="https://example.com/article"
              />
              <label htmlFor="note-wall-add-link-title-input">Title <span>(optional)</span></label>
              <input
                id="note-wall-add-link-title-input"
                type="text"
                maxLength={240}
                value={webClipTitle}
                onChange={(event) => setWebClipTitle(event.target.value)}
                placeholder="Defaults to the website name"
              />
              {webClipError && <p className="note-wall-add-link-error" role="alert">{webClipError}</p>}
              <div className="note-wall-add-link-actions">
                <button type="submit" className="note-wall-secondary-action" disabled={isFetchingWebClipMetadata}>
                  <Link2 size={14} /> {isFetchingWebClipMetadata ? 'Loading page…' : 'Pin link'}
                </button>
                <button type="button" className="note-wall-cancel-tidy" disabled={isFetchingWebClipMetadata} onClick={() => setShowAddLinkDialog(false)}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {editingLink && (
        <div className="note-wall-modal-backdrop" role="presentation" onClick={() => setEditingLink(null)}>
          <section className="note-wall-modal note-wall-add-link-dialog" role="dialog" aria-modal="true" aria-labelledby="note-wall-edit-link-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-modal-close" aria-label="Close link editor" onClick={() => setEditingLink(null)}><X size={17} /></button>
            <h2 id="note-wall-edit-link-title">Edit link</h2>
            <p>Update the link card title or destination.</p>
            <form className="note-wall-add-link-form" onSubmit={saveLinkEdit}>
              <label htmlFor="note-wall-edit-link-url">Page URL</label>
              <input
                id="note-wall-edit-link-url"
                type="url"
                required
                autoFocus
                value={linkDraft.url}
                onChange={(event) => setLinkDraft((current) => ({ ...current, url: event.target.value }))}
              />
              <label htmlFor="note-wall-edit-link-label">Title <span>(optional)</span></label>
              <input
                id="note-wall-edit-link-label"
                type="text"
                maxLength={240}
                value={linkDraft.label}
                onChange={(event) => setLinkDraft((current) => ({ ...current, label: event.target.value }))}
              />
              {webClipError && <p className="note-wall-add-link-error" role="alert">{webClipError}</p>}
              <div className="note-wall-add-link-actions">
                <button type="submit" className="note-wall-secondary-action" disabled={isFetchingWebClipMetadata}>
                  <Save size={14} /> {isFetchingWebClipMetadata ? 'Loading page…' : 'Save link'}
                </button>
                <button type="button" className="note-wall-cancel-tidy" disabled={isFetchingWebClipMetadata} onClick={() => setEditingLink(null)}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {selectedNote && (
        <div className="note-wall-modal-backdrop" role="presentation" onClick={() => setSelectedNote(null)}>
          <section className="note-wall-modal" role="dialog" aria-modal="true" aria-labelledby="note-wall-modal-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-modal-close" aria-label="Close note" onClick={() => setSelectedNote(null)}><X size={17} /></button>
            <header className="note-wall-note-view-header">
              <h2 id="note-wall-modal-title">{getWallNoteTitle(selectedNote)}</h2>
              {boardId && <NoteActionsMenu
                noteTitle={getWallNoteTitle(selectedNote)}
                className="is-in-note-view"
                onEdit={() => { setSelectedNote(null); openBoardNoteEditor(selectedNote); }}
                onDelete={() => {
                  setSelectedNote(null);
                  setPendingDeleteItem({ id: selectedNote.id, title: getWallNoteTitle(selectedNote), type: 'note' });
                }}
              />}
            </header>
            {boardId && selectedNote.markdown !== false
              ? <MarkdownContent
                  source={selectedNote.text || 'This note has no text.'}
                  pinnedLinks={selectedNote.pinnedLinks || []}
                  onPinLink={boardId ? (link) => togglePinnedMarkdownLink(selectedNote.id, link) : undefined}
                />
              : <p>{getNotePlainText(selectedNote) || 'This note has no text.'}</p>}
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
      {pendingDeleteItem && (
        <div className="note-wall-modal-backdrop" role="presentation" onClick={() => setPendingDeleteItem(null)}>
          <section className="note-wall-modal note-wall-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="note-wall-delete-title" aria-describedby="note-wall-delete-description" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-modal-close" aria-label={`Cancel ${pendingDeleteItem.type} deletion`} onClick={() => setPendingDeleteItem(null)}><X size={17} /></button>
            <h2 id="note-wall-delete-title">
              {pendingDeleteItem.type === 'markdownLink'
                ? 'Delete link?'
                : pendingDeleteItem.type === 'note' || pendingDeleteItem.type === 'task'
                ? `Delete ${pendingDeleteItem.type}?`
                : `Remove ${pendingDeleteItem.type === 'webclip' ? 'web clip' : 'attachment'}?`}
            </h2>
            <p id="note-wall-delete-description">
              {pendingDeleteItem.type === 'markdownLink'
                ? `Delete “${pendingDeleteItem.title}” from this note? This cannot be undone.`
                : pendingDeleteItem.type === 'note' || pendingDeleteItem.type === 'task'
                ? `Delete “${pendingDeleteItem.title}” from this board? This cannot be undone.`
                : `Remove “${pendingDeleteItem.type === 'webclip' ? pendingDeleteItem.title : pendingDeleteItem.name}” from this wall? You can undo this action.`}
              {pendingDeleteItem.type === 'attachment' && ' The file stays in this browser while it remains available in undo history.'}
            </p>
            <div className="note-wall-tidy-actions">
              <button type="button" className="note-wall-delete-confirm" onClick={confirmRemoveAttachment}>
                {pendingDeleteItem.type === 'note' || pendingDeleteItem.type === 'task' || pendingDeleteItem.type === 'markdownLink' ? 'Delete' : 'Remove'} {pendingDeleteItem.type === 'webclip' ? 'web clip' : pendingDeleteItem.type === 'markdownLink' ? 'link' : pendingDeleteItem.type}
              </button>
              <button type="button" className="note-wall-cancel-tidy" onClick={() => setPendingDeleteItem(null)}>Cancel</button>
            </div>
          </section>
        </div>
      )}
      {showBoardNoteDialog && (
        <div className="note-wall-modal-backdrop" role="presentation" onClick={() => setShowBoardNoteDialog(false)}>
          <section className="note-wall-modal note-wall-board-item-dialog note-wall-board-note-dialog" role="dialog" aria-modal="true" aria-labelledby="board-note-dialog-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-modal-close" aria-label="Close note editor" onClick={() => setShowBoardNoteDialog(false)}><X size={17} /></button>
            <header className="note-wall-board-note-header">
              <span>{editingBoardNoteId === null ? 'BOARD NOTE' : 'EDITING NOTE'}</span>
              <h2 id="board-note-dialog-title">{editingBoardNoteId === null ? 'Capture an idea' : 'Refine your note'}</h2>
              <p>A quiet space for your thoughts, research, and plans.</p>
            </header>
            <form className="note-wall-add-link-form note-wall-board-note-form" onSubmit={saveBoardNote}>
              <div className="note-wall-board-note-canvas">
                <input
                  id="board-note-title"
                  aria-label="Title"
                  autoFocus
                  value={boardNoteDraft.title}
                  maxLength={240}
                  onChange={(event) => setBoardNoteDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Give your note a title"
                />
                <div className="note-wall-board-note-editor-heading">
                  <span>YOUR NOTE</span>
                  <div className="note-wall-board-note-tabs" role="tablist" aria-label="Note editor view">
                    <button type="button" role="tab" aria-selected={noteEditorTab === 'write'} className={noteEditorTab === 'write' ? 'is-active' : ''} onClick={() => setNoteEditorTab('write')}>Write</button>
                    <button type="button" role="tab" aria-selected={noteEditorTab === 'preview'} className={noteEditorTab === 'preview' ? 'is-active' : ''} onClick={() => setNoteEditorTab('preview')}>Preview</button>
                  </div>
                </div>
                {noteEditorTab === 'write'
                  ? <textarea id="board-note-text" aria-label="Note" rows={9} value={boardNoteDraft.text} onChange={(event) => setBoardNoteDraft((current) => ({ ...current, text: event.target.value }))} placeholder={'Start writing…\n\nYou can use Markdown for headings, lists, links, and more.'} />
                  : <div className="note-wall-board-note-preview" role="tabpanel" aria-label="Markdown preview">
                    {boardNoteDraft.text.trim()
                      ? <MarkdownContent source={boardNoteDraft.text} />
                      : <p className="note-wall-board-note-preview-empty">Your formatted note preview will appear here.</p>}
                  </div>}
                <p className="note-wall-board-note-hint">Markdown supported · headings, tables, images, checklists, and more</p>
              </div>
              <details className="note-wall-board-note-details">
                <summary>Organize note <span>Optional</span></summary>
                <div className="note-wall-board-note-details-grid">
                  <div>
                    <label htmlFor="board-note-folder">Folder</label>
                    <select id="board-note-folder" value={boardNoteDraft.category} onChange={(event) => setBoardNoteDraft((current) => ({ ...current, category: event.target.value }))}>
                      {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                    {!isCreatingNoteFolder
                      ? <button type="button" className="note-wall-board-note-create-folder-toggle" onClick={() => setIsCreatingNoteFolder(true)}>+ New folder</button>
                      : <div className="note-wall-board-note-folder-create">
                        <input aria-label="New folder name for note" autoFocus maxLength={80} value={newNoteFolderName} onChange={(event) => { setNewNoteFolderName(event.target.value); setNewNoteFolderError(''); }} placeholder="Folder name" />
                        <button type="button" className="note-wall-board-note-create-folder-submit" onClick={createFolderFromNoteEditor}>Add</button>
                      </div>}
                    {newNoteFolderError && <p className="note-wall-add-link-error" role="alert">{newNoteFolderError}</p>}
                  </div>
                  <div>
                    <label htmlFor="board-note-tags">Tags <span>Separate with commas</span></label>
                    <input id="board-note-tags" value={boardNoteDraft.tags} maxLength={500} onChange={(event) => setBoardNoteDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="research, ideas" />
                  </div>
                </div>
              </details>
              <div className="note-wall-board-note-actions">
                <button type="button" className="note-wall-board-note-cancel" onClick={() => setShowBoardNoteDialog(false)}>Cancel</button>
                <button type="submit" className="note-wall-board-note-save">{editingBoardNoteId === null ? 'Create note' : 'Save changes'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {showBoardTaskDialog && (
        <div className="note-wall-modal-backdrop" role="presentation" onClick={() => setShowBoardTaskDialog(false)}>
          <section className="note-wall-modal note-wall-board-item-dialog" role="dialog" aria-modal="true" aria-labelledby="board-task-dialog-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-modal-close" aria-label="Close task editor" onClick={() => setShowBoardTaskDialog(false)}><X size={17} /></button>
            <h2 id="board-task-dialog-title">Add a task</h2>
            <form className="note-wall-add-link-form" onSubmit={addBoardTask}>
              <label htmlFor="board-task-title">Task</label>
              <input id="board-task-title" autoFocus required maxLength={240} value={boardTaskDraft.title} onChange={(event) => setBoardTaskDraft((current) => ({ ...current, title: event.target.value }))} placeholder="What needs doing?" />
              <label htmlFor="board-task-priority">Priority</label>
              <select id="board-task-priority" value={boardTaskDraft.priority} onChange={(event) => setBoardTaskDraft((current) => ({ ...current, priority: event.target.value }))}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <label htmlFor="board-task-folder">Folder</label>
              <select id="board-task-folder" value={boardTaskDraft.category} onChange={(event) => setBoardTaskDraft((current) => ({ ...current, category: event.target.value }))}>
                {taskCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <div className="note-wall-add-link-actions">
                <button type="submit" className="note-wall-secondary-action">Add task</button>
                <button type="button" className="note-wall-cancel-tidy" onClick={() => setShowBoardTaskDialog(false)}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {showBoardFolderDialog && (
        <div className="note-wall-modal-backdrop" role="presentation" onClick={() => setShowBoardFolderDialog(false)}>
          <section className="note-wall-modal note-wall-board-item-dialog" role="dialog" aria-modal="true" aria-labelledby="board-folder-dialog-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="note-wall-modal-close" aria-label="Close folder editor" onClick={() => setShowBoardFolderDialog(false)}><X size={17} /></button>
            <h2 id="board-folder-dialog-title">Create a folder</h2>
            <p>Folders are stored on this board and can organize its notes and tasks.</p>
            <form className="note-wall-add-link-form" onSubmit={addBoardFolder}>
              <label htmlFor="board-folder-name">Folder name</label>
              <input id="board-folder-name" autoFocus maxLength={80} required value={boardFolderDraft} onChange={(event) => setBoardFolderDraft(event.target.value)} placeholder="e.g. Reading list" />
              {boardFolderError && <p className="note-wall-add-link-error" role="alert">{boardFolderError}</p>}
              <div className="note-wall-add-link-actions">
                <button type="submit" className="note-wall-secondary-action">Create folder</button>
                <button type="button" className="note-wall-cancel-tidy" onClick={() => setShowBoardFolderDialog(false)}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {(notes.length > 0 || (wall.webClips || []).length > 0) && <footer className="note-wall-footer">{visibleNotes.length} notes · {visibleTasks.length} tasks · {visibleWebClips.length} web clips shown · folder links are solid, tag links dotted, and task links dashed · Ctrl+scroll to zoom · Shift+scroll to move sideways</footer>}
    </main>
  );
}
