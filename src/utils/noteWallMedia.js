const DATABASE_NAME = 'kazedesk-note-wall-media';
const DATABASE_VERSION = 1;
const STORE_NAME = 'attachments';
export const MAX_WALL_ATTACHMENT_SIZE = 50 * 1024 * 1024;

const MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  mp4: 'audio/mp4',
  webm: 'audio/webm',
};

const ALLOWED_MIME_TYPES = new Set(Object.values(MIME_TYPES));
const DB_ERROR = 'Attachment storage is unavailable in this browser.';
let databasePromise;

export function validateWallAttachment(file) {
  if (!file || typeof file.name !== 'string' || typeof file.size !== 'number') {
    throw new Error('Choose a valid image, PDF, or audio file.');
  }
  if (file.size > MAX_WALL_ATTACHMENT_SIZE) {
    throw new Error(`Files must be 50 MB or smaller. "${file.name}" is too large.`);
  }
  const extension = file.name.split('.').pop()?.toLowerCase();
  const inferredType = MIME_TYPES[extension];
  const mimeType = file.type || inferredType;
  if (!inferredType || !ALLOWED_MIME_TYPES.has(mimeType) || (file.type && file.type !== inferredType)) {
    throw new Error('Supported files: JPG, PNG, GIF, WebP, AVIF, PDF, MP3, WAV, OGG, M4A, AAC, FLAC, and WebM audio.');
  }
  return {
    mimeType,
    mediaType: mimeType.startsWith('image/') ? 'image' : mimeType === 'application/pdf' ? 'pdf' : 'audio',
  };
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error(DB_ERROR));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = undefined;
        };
        resolve(database);
      };
      request.onerror = () => reject(request.error || new Error(DB_ERROR));
      request.onblocked = () => reject(new Error('Attachment storage is blocked by another open tab. Close other Kazedesk tabs and try again.'));
    }).catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

async function transact(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let result;
    if (request) {
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error(DB_ERROR));
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error(DB_ERROR));
    transaction.onabort = () => reject(transaction.error || new Error(DB_ERROR));
  });
}

export function saveWallAttachment(id, file) {
  return transact('readwrite', (store) => store.put({ id, blob: file }));
}

export async function getWallAttachment(id) {
  const record = await transact('readonly', (store) => store.get(id));
  if (!record?.blob) throw new Error('This attachment is missing from browser storage. Remove it and upload it again.');
  return record.blob;
}

export function deleteWallAttachment(id) {
  return transact('readwrite', (store) => store.delete(id));
}

export async function pruneWallAttachments(getRetainedIds) {
  const records = await transact('readonly', (store) => store.getAll());
  const activeIds = new Set(getRetainedIds().map(String));
  const orphanIds = records.filter((record) => !activeIds.has(String(record.id))).map((record) => record.id);
  if (!orphanIds.length) return;
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const retainedIds = new Set(getRetainedIds().map(String));
    orphanIds.filter((id) => !retainedIds.has(String(id))).forEach((id) => store.delete(id));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error(DB_ERROR));
    transaction.onabort = () => reject(transaction.error || new Error(DB_ERROR));
  });
}
