import { useEffect, useRef, useState } from 'react';
import {
  Settings,
  DownloadCloud,
  RotateCcw,
  X,
  Video,
  CloudSun,
  Palette,
  LayoutGrid,
  Trash2,
  Check,
  Plus,
  UploadCloud
} from 'lucide-react';
import { storageManager, getDefaultDashboardConfig } from '../utils/localStorage';
import '../styles/DashboardSettings.css';

const CARD_STYLES = ['glass', 'transparent', 'outline'];
const CARD_BORDERS = ['rounded', 'rectangle'];

function extractPlaylistId(value) {
  if (!value) return '';
  const trimmed = value.trim();
  const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/i) || trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]+)/i);
  if (match?.[1]) return match[1];
  if (/^[A-Za-z0-9_-]{16,65}$/.test(trimmed)) return trimmed;
  return '';
}

export default function DashboardSettings({ config, onConfigChange, onResetLayout }) {
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('background'); // Available sections: background, weather, YouTube, and appearance.
  const importFileRef = useRef(null);
  
  const [localConfig, setLocalConfig] = useState(() => ({
    ...getDefaultDashboardConfig(),
    ...(config || {})
  }));

  // Restore weather settings from the legacy widget preference.
  const [weatherCity, setWeatherCity] = useState(() => {
    try {
      const saved = localStorage.getItem('weather-widget');
      return saved ? JSON.parse(saved).city || 'Tokyo' : 'Tokyo';
    } catch {
      return 'Tokyo';
    }
  });

  const [weatherTimezone, setWeatherTimezone] = useState(() => {
    try {
      const saved = localStorage.getItem('weather-widget');
      return saved ? JSON.parse(saved).timezone || 'Asia/Tokyo' : 'Asia/Tokyo';
    } catch {
      return 'Asia/Tokyo';
    }
  });

  const [weatherHour12, setWeatherHour12] = useState(() => {
    try {
      const saved = localStorage.getItem('weather-widget');
      return saved ? JSON.parse(saved).hour12 ?? true : true;
    } catch {
      return true;
    }
  });

  // Initialize playlist controls from the persisted playlist selection.
  const [playlistName, setPlaylistName] = useState('');
  const [playlistLink, setPlaylistLink] = useState('');
  const [savedPlaylists, setSavedPlaylists] = useState(() => storageManager?.getYouTubePlaylists?.() || []);
  const [activePlaylistId, setActivePlaylistId] = useState(() => storageManager?.getCurrentYouTubePlaylist?.() || '');

  useEffect(() => {
    if (config) {
      const nextConfig = { ...getDefaultDashboardConfig(), ...config };
      setLocalConfig((previous) => {
        const keys = Object.keys(nextConfig);
        return keys.length === Object.keys(previous).length
          && keys.every((key) => Object.is(previous[key], nextConfig[key]))
          ? previous
          : nextConfig;
      });
    }
  }, [config]);

  useEffect(() => {
    if (showSettings) {
      setSavedPlaylists(storageManager?.getYouTubePlaylists?.() || []);
      setActivePlaylistId(storageManager?.getCurrentYouTubePlaylist?.() || '');
    }
  }, [showSettings]);

  // Let keyboard users dismiss the settings dialog with Escape.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setShowSettings(false);
    };

    if (showSettings) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettings]);

  const updateConfig = (updates) => {
    const next = { ...localConfig, ...updates };
    setLocalConfig(next);
    onConfigChange?.(next);
  };

  const handleSaveWeather = () => {
    try {
      const payload = { city: weatherCity, timezone: weatherTimezone, hour12: weatherHour12 };
      localStorage.setItem('weather-widget', JSON.stringify(payload));
      window.dispatchEvent(new Event('weather-settings-updated'));
    } catch (e) {
      console.error('Failed to save weather settings:', e);
    }
  };

  const handleSavePlaylist = (e) => {
    e?.preventDefault();
    const trimmed = playlistLink.trim();
    if (!trimmed) return;
    const playlistId = extractPlaylistId(trimmed);
    if (!playlistId) return;

    const saved = storageManager?.getYouTubePlaylists?.() || [];
    const next = [
      ...(saved || []).filter((item) => item.playlistId !== playlistId),
      {
        id: Date.now(),
        url: trimmed,
        playlistId,
        name: playlistName.trim() || `Playlist ${saved?.length + 1 || 1}`,
      },
    ];

    storageManager?.saveYouTubePlaylists?.(next);
    storageManager?.saveCurrentYouTubePlaylist?.(playlistId);
    setSavedPlaylists(next);
    setActivePlaylistId(playlistId);
    setPlaylistName('');
    setPlaylistLink('');
    window.dispatchEvent(new Event('youtube-playlist-updated'));
  };

  const handleSelectPlaylist = (playlistId) => {
    storageManager?.saveCurrentYouTubePlaylist?.(playlistId);
    setActivePlaylistId(playlistId);
    window.dispatchEvent(new Event('youtube-playlist-updated'));
  };

  const handleDeletePlaylist = (playlistId) => {
    const next = savedPlaylists.filter((item) => item.playlistId !== playlistId);
    storageManager?.saveYouTubePlaylists?.(next);
    if (activePlaylistId === playlistId) {
      const fallback = next[0]?.playlistId || '';
      storageManager?.saveCurrentYouTubePlaylist?.(fallback);
      setActivePlaylistId(fallback);
    }
    setSavedPlaylists(next);
    window.dispatchEvent(new Event('youtube-playlist-updated'));
  };

  const handleExport = () => {
    try {
      const config = storageManager?.getDashboardConfig?.() || {};
      const legacyBackground = localStorage.getItem('dashboard-bg');
      let weatherSettings = null;
      try {
        weatherSettings = JSON.parse(localStorage.getItem('weather-widget') || 'null');
      } catch {
        weatherSettings = null;
      }
      const allData = {
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        config: legacyBackground && !config.backgroundImage ? { ...config, backgroundImage: legacyBackground } : config,
        cardsLayout: storageManager?.getCardsLayout?.() || {},
        notes: storageManager?.getStickyNotes?.() || [],
        tasks: storageManager?.getTasks?.() || [],
        pomodoroConfig: storageManager?.getPomodoroConfig?.() || {},
        youtubePlaylists: storageManager?.getYouTubePlaylists?.() || [],
        currentYouTubePlaylist: storageManager?.getCurrentYouTubePlaylist?.() || '',
        weatherSettings,
        analyticsEvents: storageManager?.getAnalyticsEvents?.() || [],
      };

      const dataStr = JSON.stringify(allData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dashboard-backup-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  const handleImportBackup = (file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error('Backup must be a JSON object.');
        }
        if (data?.config && typeof data.config === 'object' && !Array.isArray(data.config)) {
          const importedConfig = {
            ...getDefaultDashboardConfig(),
            ...data.config,
          };
          storageManager?.saveDashboardConfig?.(importedConfig);
          onConfigChange?.(importedConfig);
          if (importedConfig.backgroundImage) {
            localStorage.setItem('dashboard-bg', importedConfig.backgroundImage);
          } else {
            localStorage.removeItem('dashboard-bg');
          }
        }
        if (Array.isArray(data?.notes)) {
          storageManager?.saveStickyNotes?.(data.notes);
        }
        if (Array.isArray(data?.tasks)) {
          storageManager?.saveTasks?.(data.tasks);
        }
        if (data?.cardsLayout && typeof data.cardsLayout === 'object' && !Array.isArray(data.cardsLayout)) {
          storageManager?.saveCardsLayout?.(data.cardsLayout);
        }
        if (data?.pomodoroConfig && typeof data.pomodoroConfig === 'object') {
          storageManager?.savePomodoroConfig?.(data.pomodoroConfig);
        }
        if (Array.isArray(data?.youtubePlaylists)) {
          storageManager?.saveYouTubePlaylists?.(data.youtubePlaylists);
        }
        if (typeof data?.currentYouTubePlaylist === 'string') {
          storageManager?.saveCurrentYouTubePlaylist?.(data.currentYouTubePlaylist);
        } else if (Array.isArray(data?.youtubePlaylists)) {
          storageManager?.saveCurrentYouTubePlaylist?.(data.youtubePlaylists[0]?.playlistId || '');
        }
        if (Object.hasOwn(data, 'weatherSettings')) {
          if (data.weatherSettings && typeof data.weatherSettings === 'object' && !Array.isArray(data.weatherSettings)) {
            localStorage.setItem('weather-widget', JSON.stringify(data.weatherSettings));
          } else {
            localStorage.removeItem('weather-widget');
          }
        }
        if (Array.isArray(data?.analyticsEvents)) {
          storageManager?.saveAnalyticsEvents?.(data.analyticsEvents);
        }
        window.location.reload();
      } catch (error) {
        console.error('Invalid JSON backup file:', error);
        window.alert('Failed to import JSON backup. Please provide a valid dashboard export file.');
      }
    };
    reader.readAsText(file);
  };

  const handleImportClick = () => {
    importFileRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImportBackup(file);
    }
    event.target.value = '';
  };

  const handleClear = () => {
    if (window.confirm('Delete all saved dashboard data?')) {
      storageManager?.clearAllData?.();
      window.location.reload();
    }
  };

  return (
    <>
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="settings-trigger-btn"
        title="Open Settings"
        aria-label="Open Settings"
      >
        <Settings size={20} />
      </button>

      {showSettings && (
        <div
          className="settings-modal-overlay"
          onClick={() => setShowSettings(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="settings-modal"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Dialog title and close control. */}
            <div className="settings-modal-header">
              <div className="settings-header-title">
                <Settings size={18} className="text-sky-400" />
                <h2>Dashboard Settings</h2>
              </div>
              <button
                className="settings-close-btn"
                onClick={() => setShowSettings(false)}
                title="Close Settings"
              >
                <X size={16} />
              </button>
            </div>

            {/* Settings navigation and selected section. */}
            <div className="settings-body">
              <div className="settings-nav">
                <button
                  className={`nav-tab ${activeTab === 'background' ? 'active' : ''}`}
                  onClick={() => setActiveTab('background')}
                >
                  <Palette size={15} />
                  <span>Background</span>
                </button>
                <button
                  className={`nav-tab ${activeTab === 'weather' ? 'active' : ''}`}
                  onClick={() => setActiveTab('weather')}
                >
                  <CloudSun size={15} />
                  <span>Weather & Clock</span>
                </button>
                <button
                  className={`nav-tab ${activeTab === 'youtube' ? 'active' : ''}`}
                  onClick={() => setActiveTab('youtube')}
                >
                  <Video size={15} />
                  <span>YouTube</span>
                </button>
                <button
                  className={`nav-tab ${activeTab === 'appearance' ? 'active' : ''}`}
                  onClick={() => setActiveTab('appearance')}
                >
                  <LayoutGrid size={15} />
                  <span>Appearance</span>
                </button>
              </div>

              {/* Render the selected settings section. */}
              <div className="settings-content">
                {/* Background color, gradient, and image options. */}
                {activeTab === 'background' && (
                  <div className="tab-pane">
                    <label className="settings-label">Background Mode</label>
                    <p className="settings-description">
                      Choose between solid tone, dual-color gradient, or drag image/GIF files directly onto your dashboard workspace.
                    </p>

                    <div className="type-chip-group">
                      <button
                        className={`type-chip ${localConfig.backgroundType === 'solid' ? 'active' : ''}`}
                        onClick={() => updateConfig({ backgroundType: 'solid', backgroundImage: null })}
                      >
                        Solid Color
                      </button>
                      <button
                        className={`type-chip ${localConfig.backgroundType === 'gradient' ? 'active' : ''}`}
                        onClick={() => updateConfig({ backgroundType: 'gradient', backgroundImage: null })}
                      >
                        Gradient
                      </button>
                      <button
                        className={`type-chip ${localConfig.backgroundType === 'image' ? 'active' : ''}`}
                        onClick={() => updateConfig({ backgroundType: 'image' })}
                      >
                        Custom Image
                      </button>
                    </div>

                    {localConfig.backgroundType === 'solid' && (
                      <div className="field-stack">
                        <label className="settings-sub-label">Solid Color</label>
                        <div className="color-picker-wrapper">
                          <input
                            type="color"
                            value={localConfig.bgColor || '#0d1117'}
                            onChange={(event) => updateConfig({ bgColor: event.target.value })}
                          />
                          <span className="color-code">{localConfig.bgColor || '#0d1117'}</span>
                        </div>
                      </div>
                    )}

                    {localConfig.backgroundType === 'gradient' && (
                      <div className="field-stack">
                        <label className="settings-sub-label">Gradient Direction Colors</label>
                        <div className="gradient-row">
                          <div className="color-picker-wrapper">
                            <input
                              type="color"
                              value={localConfig.gradientFrom || '#0d1117'}
                              onChange={(event) => updateConfig({ gradientFrom: event.target.value })}
                            />
                            <span className="color-code">{localConfig.gradientFrom || '#0d1117'}</span>
                          </div>
                          <div className="color-picker-wrapper">
                            <input
                              type="color"
                              value={localConfig.gradientTo || '#161b22'}
                              onChange={(event) => updateConfig({ gradientTo: event.target.value })}
                            />
                            <span className="color-code">{localConfig.gradientTo || '#161b22'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="drag-drop-hint">
                      💡 <span>Pro tip:</span> Drag and drop any image or animated GIF anywhere on screen to automatically replace the background wallpaper.
                    </div>
                  </div>
                )}

                {/* Weather location and clock preferences. */}
                {activeTab === 'weather' && (
                  <div className="tab-pane">
                    <label className="settings-label">Weather & Timezone Configuration</label>
                    <p className="settings-description">
                      Configure location and time display formats for the clock widget.
                    </p>

                    <div className="field-stack">
                      <div className="input-group">
                        <label className="settings-sub-label">City Name</label>
                        <input
                          value={weatherCity}
                          onChange={(event) => setWeatherCity(event.target.value)}
                          placeholder="e.g. Tokyo, Kerala, London"
                        />
                      </div>

                      <div className="input-group">
                        <label className="settings-sub-label">Timezone</label>
                        <select
                          value={weatherTimezone}
                          onChange={(event) => setWeatherTimezone(event.target.value)}
                        >
                          <option value="Asia/Kolkata">Asia / Kolkata</option>
                          <option value="Asia/Tokyo">Asia / Tokyo</option>
                          <option value="Asia/Seoul">Asia / Seoul</option>
                          <option value="Asia/Singapore">Asia / Singapore</option>
                          <option value="Europe/London">Europe / London</option>
                          <option value="Europe/Paris">Europe / Paris</option>
                          <option value="America/New_York">America / New York</option>
                          <option value="America/Los_Angeles">America / Los Angeles</option>
                          <option value="Australia/Sydney">Australia / Sydney</option>
                        </select>
                      </div>

                      <div className="input-group">
                        <label className="settings-sub-label">Time Format</label>
                        <div className="card-style-group">
                          <button
                            className={`style-toggle-btn ${weatherHour12 ? 'active' : ''}`}
                            onClick={() => setWeatherHour12(true)}
                          >
                            12-Hour (AM/PM)
                          </button>
                          <button
                            className={`style-toggle-btn ${!weatherHour12 ? 'active' : ''}`}
                            onClick={() => setWeatherHour12(false)}
                          >
                            24-Hour Format
                          </button>
                        </div>
                      </div>

                      <button className="settings-action-btn secondary" onClick={handleSaveWeather}>
                        <CloudSun size={15} />
                        <span>Save Weather Settings</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Playlist management and playback selection. */}
                {activeTab === 'youtube' && (
                  <div className="tab-pane">
                    <label className="settings-label">YouTube Playlists</label>
                    <p className="settings-description">
                      Add custom playlists or video mixes to sync with your audio widget.
                    </p>

                    <div className="field-stack">
                      <input
                        value={playlistName}
                        onChange={(event) => setPlaylistName(event.target.value)}
                        placeholder="Playlist title (e.g., Lofi Chill Beats)"
                      />
                      <input
                        value={playlistLink}
                        onChange={(event) => setPlaylistLink(event.target.value)}
                        placeholder="https://www.youtube.com/playlist?list=..."
                      />
                      <button className="settings-action-btn secondary" onClick={handleSavePlaylist}>
                        <Plus size={15} />
                        <span>Add Playlist</span>
                      </button>
                    </div>

                    {savedPlaylists?.length > 0 && (
                      <div className="youtube-playlist-list">
                        <label className="settings-sub-label">Saved Playlists</label>
                        {savedPlaylists.map((playlist) => {
                          const isActive = activePlaylistId === playlist.playlistId;
                          return (
                            <div
                              key={playlist.id}
                              className={`playlist-item ${isActive ? 'active' : ''}`}
                            >
                              <button
                                type="button"
                                className="playlist-main"
                                onClick={() => handleSelectPlaylist(playlist.playlistId)}
                              >
                                <div className="playlist-info">
                                  <span className="playlist-name">
                                    {playlist.name || 'Untitled Playlist'}
                                  </span>
                                  <span className="playlist-url">{playlist.url}</span>
                                </div>
                                <span className={`playlist-action ${isActive ? 'active-badge' : ''}`}>
                                  {isActive ? (
                                    <>
                                      <Check size={12} /> Playing
                                    </>
                                  ) : (
                                    'Load'
                                  )}
                                </span>
                              </button>
                              <button
                                type="button"
                                className="playlist-delete"
                                onClick={() => handleDeletePlaylist(playlist.playlistId)}
                                title="Delete Playlist"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Dashboard card style and layout options. */}
                {activeTab === 'appearance' && (
                  <div className="tab-pane">
                    <label className="settings-label">Widget Themes & Borders</label>
                    <p className="settings-description">
                      Customize card glass transparency, border curves, and ambient effects.
                    </p>

                    <div className="field-stack">
                      <div className="input-group">
                        <label className="settings-sub-label">Card Style</label>
                        <div className="card-style-group">
                          {CARD_STYLES.map((style) => (
                            <button
                              key={style}
                              onClick={() => updateConfig({ cardStyle: style })}
                              className={`style-toggle-btn ${localConfig.cardStyle === style ? 'active' : ''}`}
                            >
                              {style}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="input-group">
                        <label className="settings-sub-label">Corner Radius</label>
                        <div className="card-style-group">
                          {CARD_BORDERS.map((style) => (
                            <button
                              key={style}
                              onClick={() => updateConfig({ cardBorder: style })}
                              className={`style-toggle-btn ${localConfig.cardBorder === style ? 'active' : ''}`}
                            >
                              {style}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="input-group">
                        <label className="settings-sub-label">Ambient Audio Strip</label>
                        <div className="card-style-group">
                          <button
                            className={`style-toggle-btn ${localConfig.ambientLightEnabled !== false ? 'active' : ''}`}
                            onClick={() => updateConfig({ ambientLightEnabled: true })}
                          >
                            Enabled
                          </button>
                          <button
                            className={`style-toggle-btn ${localConfig.ambientLightEnabled === false ? 'active' : ''}`}
                            onClick={() => updateConfig({ ambientLightEnabled: false })}
                          >
                            Disabled
                          </button>
                        </div>
                      </div>

                      {localConfig.ambientLightEnabled !== false && (
                        <div className="input-group">
                          <label className="settings-sub-label">Ambient Glow Color</label>
                          <div className="color-picker-wrapper">
                            <input
                              type="color"
                              value={localConfig.ambientLightColor || '#60a5fa'}
                              onChange={(event) => updateConfig({ ambientLightColor: event.target.value })}
                            />
                            <span className="color-code">{localConfig.ambientLightColor || '#60a5fa'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Import, reset, and save actions. */}
            <div className="settings-modal-footer">
              <button onClick={() => { onResetLayout?.(); setShowSettings(false); }} className="settings-action-btn layout">
                <LayoutGrid size={14} />
                <span>Restore default layout</span>
              </button>
              <button onClick={handleExport} className="settings-action-btn export">
                <DownloadCloud size={14} />
                <span>Export Backup</span>
              </button>
              <button onClick={handleImportClick} className="settings-action-btn import">
                <UploadCloud size={14} />
                <span>Import JSON</span>
              </button>
              <button onClick={handleClear} className="settings-action-btn clear">
                <RotateCcw size={14} />
                <span>Reset Cache</span>
              </button>
            </div>
            <input
              type="file"
              ref={importFileRef}
              accept="application/json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        </div>
      )}
    </>
  );
}