import { createBackupArchive, parseBackupArchive, validateAttachmentManifest } from './backupArchive';

function formatBackupTimestamp(date) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)}_${iso.slice(11, 19).replaceAll(':', '-')}-${iso.slice(20, 23)}Z`;
}

function getBoardFolderName(boardName, boardId) {
  const normalizedName = Array.from(String(boardName || 'Board').normalize('NFKC'), (character) => {
    const codePoint = character.codePointAt(0);
    return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f) ? '-' : character;
  }).join('');
  const name = normalizedName
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. -]+|[. ]+$/g, '')
    .slice(0, 80)
    .replace(/[. ]+$/g, '') || 'Board';
  const safeName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)
    ? `_${name}`
    : name;
  const shortId = String(boardId).replace(/[^a-zA-Z0-9_-]/g, '').slice(-8) || 'board';
  return `${safeName}--${shortId}`;
}

export async function createNoteWallBackupArchive({
  notes = [],
  categories = [],
  wall = {},
  tasks = [],
  taskCategories = ['Inbox'],
  boardId = null,
  boardName = '',
  exportedAt = new Date(),
}) {
  const date = exportedAt instanceof Date ? exportedAt : new Date(exportedAt);
  if (!Number.isFinite(date.getTime())) throw new Error('The backup date is invalid.');

  const isBoard = Boolean(boardId);
  const timestamp = formatBackupTimestamp(date);
  const directory = isBoard
    ? `Kazedesk/Boards/${getBoardFolderName(boardName, boardId)}/`
    : 'Kazedesk/Workspace/';
  const jsonPath = `${directory}${isBoard ? 'board' : 'workspace'}-${timestamp}.json`;
  const mediaDirectory = `${directory}Media-${timestamp}`;
  const data = {
    app: 'Kazedesk',
    type: 'sticky-note-wall',
    context: isBoard ? 'board' : 'workspace',
    version: 2,
    exportedAt: date.toISOString(),
    ...(isBoard ? { boardId, boardName } : {}),
    categories,
    notes,
    tasks,
    taskCategories,
    wall,
  };

  return createBackupArchive({
    filename: `Kazedesk-backup-${timestamp}.zip`,
    jsonPath,
    mediaDirectory,
    directories: isBoard ? ['Kazedesk/Boards', directory] : [directory],
    attachments: wall.attachments || [],
    data,
  });
}

export function parseNoteWallBackupJSON(value) {
  let data;
  try {
    data = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error('The Kazedesk wall JSON is invalid.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || data.app !== 'Kazedesk' || data.type !== 'sticky-note-wall' || ![1, 2].includes(data.version)) {
    throw new Error('This is not a supported Kazedesk wall JSON export.');
  }
  const context = data.context || (data.boardId || data.boardName ? 'board' : 'workspace');
  if (!['workspace', 'board'].includes(context)
    || !Array.isArray(data.notes) || !Array.isArray(data.categories) || !Array.isArray(data.tasks)
    || !data.wall || typeof data.wall !== 'object' || Array.isArray(data.wall)) {
    throw new Error('The Kazedesk wall JSON data is incomplete or invalid.');
  }
  return {
    ...data,
    context,
    taskCategories: Array.isArray(data.taskCategories) ? data.taskCategories : ['Inbox'],
  };
}

export function parseNoteWallBackupArchive(bytes) {
  const backup = parseBackupArchive(bytes);
  const { data, mediaFiles } = backup;
  if (data.app !== 'Kazedesk' || data.type !== 'sticky-note-wall'
    || ![1, 2].includes(data.version) || !['workspace', 'board'].includes(data.context)) {
    throw new Error('This ZIP is not a supported Kazedesk wall or board backup.');
  }
  if (!data.wall || typeof data.wall !== 'object' || Array.isArray(data.wall)) {
    throw new Error('The Kazedesk backup wall data is invalid.');
  }
  if (data.version === 1 && (data.wall.attachments || []).length) {
    throw new Error('This older backup contains attachment references but not the media files. Use the original browser data to create a complete backup.');
  }
  validateAttachmentManifest([data.wall], mediaFiles);
  return backup;
}
