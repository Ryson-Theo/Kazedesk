import { validateBackupStorageSnapshot } from './localStorage';

export function createDashboardBackupJSON({ storage, exportedAt = new Date() }) {
  validateBackupStorageSnapshot(storage);
  const date = exportedAt instanceof Date ? exportedAt : new Date(exportedAt);
  if (!Number.isFinite(date.getTime())) throw new Error('The backup date is invalid.');
  const timestamp = date.toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const data = {
    app: 'Kazedesk',
    type: 'complete-dashboard-backup',
    version: 2,
    exportedAt: date.toISOString(),
    storage,
  };
  return {
    blob: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    filename: `Kazedesk-dashboard-backup-${timestamp}.json`,
    data,
  };
}

export function parseDashboardBackupJSON(value) {
  let data;
  try {
    data = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error('The dashboard backup JSON is invalid.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || data.app !== 'Kazedesk' || data.type !== 'complete-dashboard-backup' || data.version !== 2) {
    throw new Error('This is not a supported Kazedesk dashboard JSON backup.');
  }
  validateBackupStorageSnapshot(data.storage);
  return data;
}
