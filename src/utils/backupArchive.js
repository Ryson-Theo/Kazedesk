import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { getWallAttachment, MAX_WALL_ATTACHMENT_SIZE, validateWallAttachmentMetadata } from './noteWallMedia';

async function pushBlob(zipFile, blob) {
  if (typeof blob.stream === 'function') {
    const reader = blob.stream().getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          zipFile.push(new Uint8Array(0), true);
          break;
        }
        zipFile.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }
  zipFile.push(new Uint8Array(await blob.arrayBuffer()), true);
}

export async function createBackupArchive({ filename, jsonPath, data, attachments = [], directories = [], mediaDirectory }) {
  const mediaFiles = [];
  const uniqueAttachments = new Map();
  attachments.forEach((attachment) => {
    if (attachment?.id === undefined || attachment?.id === null) {
      throw new Error('A wall attachment is missing its ID.');
    }
    uniqueAttachments.set(String(attachment.id), attachment);
  });

  const entries = [
    { path: 'Kazedesk/', directory: true },
    ...directories.map((path) => ({ path: `${path.replace(/\/+$/, '')}/`, directory: true })),
  ];

  for (const [index, [id, attachment]] of [...uniqueAttachments.entries()].entries()) {
    const blob = await getWallAttachment(attachment.id);
    if (blob.size > MAX_WALL_ATTACHMENT_SIZE) {
      throw new Error(`Files must be 50 MB or smaller. "${attachment.name || 'Attachment'}" is too large.`);
    }
    const mimeType = attachment.mimeType || blob.type;
    validateWallAttachmentMetadata({ name: attachment.name, type: mimeType, size: blob.size });
    const path = `${mediaDirectory}/attachment-${String(index + 1).padStart(4, '0')}.bin`;
    mediaFiles.push({
      id,
      path,
      name: attachment.name,
      mimeType,
      size: blob.size,
    });
    entries.push({ path, blob });
  }

  entries.splice(1, 0, { path: jsonPath, data: strToU8(JSON.stringify({ ...data, media: mediaFiles }, null, 2)), compressed: true });

  let resolveArchive;
  let rejectArchive;
  const archivePromise = new Promise((resolve, reject) => {
    resolveArchive = resolve;
    rejectArchive = reject;
  });
  const chunks = [];
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      rejectArchive(error);
      return;
    }
    if (chunk?.length) chunks.push(chunk);
    if (final) resolveArchive(new Blob(chunks, { type: 'application/zip' }));
  });

  try {
    for (const entry of entries) {
      if (entry.directory) {
        const zipFile = new ZipPassThrough(entry.path);
        zip.add(zipFile);
        zipFile.push(new Uint8Array(0), true);
      } else if (entry.compressed) {
        const zipFile = new ZipDeflate(entry.path, { level: 6 });
        zip.add(zipFile);
        zipFile.push(entry.data, true);
      } else {
        const zipFile = new ZipPassThrough(entry.path);
        zip.add(zipFile);
        await pushBlob(zipFile, entry.blob);
      }
    }
    zip.end();
  } catch (error) {
    zip.terminate();
    rejectArchive(error);
  }

  return { blob: await archivePromise, filename, jsonPath, mediaCount: mediaFiles.length };
}

export function parseBackupArchive(bytes) {
  let files;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('This ZIP file could not be opened.');
  }

  const paths = Object.keys(files);
  if (paths.some((path) => path.includes('\\') || path.split('/').includes('..') || !path.startsWith('Kazedesk/'))) {
    throw new Error('This ZIP contains an invalid Kazedesk backup path.');
  }
  const jsonPaths = paths.filter((path) => path.endsWith('.json'));
  if (jsonPaths.length !== 1) throw new Error('This ZIP must contain exactly one Kazedesk backup JSON file.');

  let data;
  try {
    data = JSON.parse(strFromU8(files[jsonPaths[0]]));
  } catch {
    throw new Error('The Kazedesk backup JSON is invalid.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The Kazedesk backup data is invalid.');
  }

  const manifest = data.media === undefined ? [] : data.media;
  if (!Array.isArray(manifest)) throw new Error('The Kazedesk backup media manifest is invalid.');
  const mediaIds = new Set();
  const mediaPaths = new Set();
  const mediaFiles = manifest.map((media) => {
    if (!media || typeof media.id !== 'string' || typeof media.name !== 'string'
      || typeof media.mimeType !== 'string' || !Number.isInteger(media.size) || media.size < 0
      || typeof media.path !== 'string' || !/^Kazedesk\/.+\/Media-[^/]+\/attachment-\d+\.bin$/.test(media.path)) {
      throw new Error('The Kazedesk backup media manifest contains an invalid entry.');
    }
    if (mediaIds.has(media.id) || mediaPaths.has(media.path)) {
      throw new Error('The Kazedesk backup contains duplicate media entries.');
    }
    mediaIds.add(media.id);
    mediaPaths.add(media.path);
    const content = files[media.path];
    if (!content || content.length !== media.size) {
      throw new Error(`The backup file for "${media.name}" is missing or incomplete.`);
    }
    if (media.size > MAX_WALL_ATTACHMENT_SIZE) {
      throw new Error(`Files must be 50 MB or smaller. "${media.name}" is too large.`);
    }
    validateWallAttachmentMetadata({ name: media.name, type: media.mimeType, size: media.size });
    return {
      id: media.id,
      name: media.name,
      mimeType: media.mimeType,
      size: media.size,
      blob: new Blob([content], { type: media.mimeType }),
    };
  });

  if (paths.some((path) => /\/Media-[^/]+\/attachment-\d+\.bin$/.test(path) && !mediaPaths.has(path))) {
    throw new Error('The Kazedesk backup contains unlisted media files.');
  }
  return { data, mediaFiles };
}

export function validateAttachmentManifest(walls, mediaFiles) {
  const expectedIds = new Set(walls.flatMap((wall) => (wall?.attachments || []).map((attachment) => String(attachment.id))));
  const actualIds = new Set(mediaFiles.map((media) => String(media.id)));
  if (expectedIds.size !== actualIds.size || [...expectedIds].some((id) => !actualIds.has(id))) {
    throw new Error('This backup is missing one or more attachment files. It cannot restore all media.');
  }
}

export function createAttachmentIdMap(walls, idFactory = () => crypto.randomUUID()) {
  const ids = new Set(walls.flatMap((wall) => (wall?.attachments || []).map((attachment) => String(attachment.id))));
  return new Map([...ids].map((id) => [id, idFactory()]));
}

export function remapWallAttachmentIds(wall, idMap) {
  const getId = (id) => idMap.get(String(id)) || id;
  const remapKeys = (source = {}) => Object.fromEntries(
    Object.entries(source).map(([id, value]) => [getId(id), value]),
  );
  return {
    ...wall,
    attachments: (wall.attachments || []).map((attachment) => ({ ...attachment, id: getId(attachment.id) })),
    positions: remapKeys(wall.positions),
    sizes: remapKeys(wall.sizes),
    comments: remapKeys(wall.comments),
    connections: (wall.connections || []).map((connection) => ({
      ...connection,
      ...(connection.fromType === 'attachment' ? { from: getId(connection.from) } : {}),
      ...(connection.toType === 'attachment' ? { to: getId(connection.to) } : {}),
    })),
  };
}

export function remapBackupMediaFiles(mediaFiles, idMap) {
  return mediaFiles.map((media) => ({ ...media, id: idMap.get(String(media.id)) || media.id }));
}

export async function loadReferencedWallAttachments(wall, idMap) {
  return Promise.all((wall.attachments || []).map(async (attachment) => ({
    id: idMap.get(String(attachment.id)) || attachment.id,
    blob: await getWallAttachment(attachment.id),
  })));
}
