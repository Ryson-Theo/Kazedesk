import { describe, expect, it } from 'vitest';
import { createDashboardBackupJSON, parseDashboardBackupJSON } from './dashboardBackup';
import { STORAGE_KEYS, storageManager } from './localStorage';

describe('dashboard JSON backups', () => {
  it('exports and restores all dashboard text data without embedding media files', async () => {
    localStorage.clear();
    const storage = storageManager.getBackupStorageSnapshot();
    storage[STORAGE_KEYS.DASHBOARD_CONFIG] = JSON.stringify({ backgroundType: 'gradient' });
    storage[STORAGE_KEYS.WEATHER_LOCATION] = 'Kolkata';
    storage[STORAGE_KEYS.STICKY_NOTES] = JSON.stringify([{ id: 'note-main', title: 'Main note' }]);
    storage[STORAGE_KEYS.NOTE_WALL] = JSON.stringify({
      attachments: [{ id: 'voice-id', name: 'voice-note.webm', mimeType: 'audio/webm', mediaType: 'audio' }],
      positions: { 'voice-id': { x: 10, y: 20 } },
    });

    const exported = createDashboardBackupJSON({ storage, exportedAt: new Date('2026-11-12T14:28:59.576Z') });
    const backup = parseDashboardBackupJSON(await exported.blob.text());

    expect(exported.filename).toMatch(/^Kazedesk-dashboard-backup-.*\.json$/);
    expect(backup.storage).toEqual(storage);
    expect(backup.storage[STORAGE_KEYS.DASHBOARD_CONFIG]).toContain('gradient');
    expect(backup.storage[STORAGE_KEYS.WEATHER_LOCATION]).toBe('Kolkata');
    expect(backup.storage[STORAGE_KEYS.NOTE_WALL]).toContain('voice-id');
    expect(backup).not.toHaveProperty('media');
    expect(backup).not.toHaveProperty('mediaFiles');
  });

  it('rejects invalid dashboard JSON backups', () => {
    expect(() => parseDashboardBackupJSON('not json')).toThrow('The dashboard backup JSON is invalid.');
    expect(() => parseDashboardBackupJSON({ app: 'Other', type: 'complete-dashboard-backup', version: 2 }))
      .toThrow('This is not a supported Kazedesk dashboard JSON backup.');
  });
});
