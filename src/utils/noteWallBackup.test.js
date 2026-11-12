import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { createNoteWallBackupArchive, parseNoteWallBackupArchive } from './noteWallBackup';

const { getWallAttachment } = vi.hoisted(() => ({ getWallAttachment: vi.fn() }));

vi.mock('./noteWallMedia', async (importOriginal) => ({
  ...(await importOriginal()),
  getWallAttachment,
}));

const exportedAt = new Date('2026-11-12T14:28:59.576Z');

describe('note wall backup archives', () => {
  it('creates a dated workspace JSON within the expected folder structure', async () => {
    const backup = await createNoteWallBackupArchive({
      notes: [{ id: 'note-1', title: 'Plan' }],
      categories: ['Inbox'],
      tasks: [{ id: 'task-1', title: 'Review' }],
      wall: { positions: { 'note-1': { x: 10, y: 20 } } },
      exportedAt,
    });
    const files = unzipSync(new Uint8Array(await backup.blob.arrayBuffer()));
    const data = JSON.parse(strFromU8(files[backup.jsonPath]));

    expect(backup.filename).toBe('Kazedesk-backup-2026-11-12_14-28-59-576Z.zip');
    expect(backup.jsonPath).toBe('Kazedesk/Workspace/workspace-2026-11-12_14-28-59-576Z.json');
    expect(Object.keys(files)).toContain('Kazedesk/Workspace/');
    expect(data).toMatchObject({
      app: 'Kazedesk',
      type: 'sticky-note-wall',
      context: 'workspace',
      exportedAt: exportedAt.toISOString(),
      notes: [{ id: 'note-1', title: 'Plan' }],
      categories: ['Inbox'],
      tasks: [{ id: 'task-1', title: 'Review' }],
    });
  });

  it('keeps board names within safe, distinct folder paths', async () => {
    const backup = await createNoteWallBackupArchive({
      boardId: 'board-12345678',
      boardName: '../Project/Alpha',
      exportedAt,
    });
    const files = unzipSync(new Uint8Array(await backup.blob.arrayBuffer()));

    expect(backup.jsonPath).toBe('Kazedesk/Boards/Project-Alpha--12345678/board-2026-11-12_14-28-59-576Z.json');
    expect(backup.jsonPath).not.toContain('..');
    expect(backup.jsonPath).not.toContain('\\');
    expect(Object.keys(files)).toContain('Kazedesk/Boards/');
    expect(JSON.parse(strFromU8(files[backup.jsonPath]))).toMatchObject({
      context: 'board',
      boardId: 'board-12345678',
      boardName: '../Project/Alpha',
    });
  });

  it('includes voice recording bytes in the archive and restores them from its manifest', async () => {
    const voiceBytes = 'recorded voice data';
    getWallAttachment.mockResolvedValue(new Blob([voiceBytes], { type: 'audio/webm' }));
    const backup = await createNoteWallBackupArchive({
      boardId: 'board-voice',
      boardName: 'Voice notes',
      wall: {
        attachments: [{
          id: 'voice-id',
          name: 'Voice memo',
          mimeType: 'audio/webm',
          mediaType: 'audio',
        }],
      },
      exportedAt,
    });

    expect(backup.mediaCount).toBe(1);
    const restored = parseNoteWallBackupArchive(new Uint8Array(await backup.blob.arrayBuffer()));
    expect(restored.data.wall.attachments).toHaveLength(1);
    expect(restored.mediaFiles).toMatchObject([{
      id: 'voice-id',
      name: 'Voice memo',
      mimeType: 'audio/webm',
      size: voiceBytes.length,
    }]);
    expect(strFromU8(new Uint8Array(await restored.mediaFiles[0].blob.arrayBuffer()))).toBe(voiceBytes);
  });
});
