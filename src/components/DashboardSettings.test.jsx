import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardSettings from './DashboardSettings';
import { createDashboardBackupJSON } from '../utils/dashboardBackup';
import { STORAGE_KEYS, storageManager } from '../utils/localStorage';

describe('DashboardSettings JSON backups', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exports and imports dashboard JSON only', async () => {
    const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const createObjectURL = vi.fn(() => 'blob:dashboard-json');
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });

    try {
      localStorage.setItem(STORAGE_KEYS.WEATHER_LOCATION, 'Tokyo');
      render(<DashboardSettings config={{}} />);
      fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
      expect(screen.getByRole('button', { name: 'Export Dashboard JSON' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Import Dashboard JSON' })).toBeInTheDocument();

      const fileInput = document.querySelector('input[type="file"][accept=".json,application/json"]');
      expect(fileInput).not.toBeNull();
      expect(fileInput.accept).toBe('.json,application/json');

      fireEvent.click(screen.getByRole('button', { name: 'Export Dashboard JSON' }));
      await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
      const exported = JSON.parse(await createObjectURL.mock.calls[0][0].text());
      expect(exported).toMatchObject({
        app: 'Kazedesk',
        type: 'complete-dashboard-backup',
        version: 2,
        storage: { [STORAGE_KEYS.WEATHER_LOCATION]: 'Tokyo' },
      });
      expect(anchorClick).toHaveBeenCalledOnce();

      const importedStorage = storageManager.getBackupStorageSnapshot();
      importedStorage[STORAGE_KEYS.WEATHER_LOCATION] = 'Osaka';
      const backup = createDashboardBackupJSON({ storage: importedStorage });
      const backupFile = new File([backup.blob], backup.filename, { type: 'application/json' });
      fireEvent.change(fileInput, { target: { files: [backupFile] } });

      await waitFor(() => expect(storageManager.getWeatherLocation()).toBe('Osaka'));
      expect(confirm).toHaveBeenCalledOnce();
    } finally {
      if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
      else delete URL.createObjectURL;
      anchorClick.mockRestore();
      confirm.mockRestore();
    }
  });
});
