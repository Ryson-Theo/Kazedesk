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
  UploadCloud,
  ImagePlus
} from 'lucide-react';
import { storageManager, getDefaultDashboardConfig } from '../utils/localStorage';
import { readBackgroundImage } from '../utils/backgroundImage';
import SelectDropdown from './SelectDropdown';
import '../styles/DashboardSettings.css';

const CARD_STYLES = [
  { value: 'glass', label: 'Tinted Glass' },
  { value: 'transparent', label: 'Blur Glass' },
  { value: 'outline', label: 'Outline' },
];
const CARD_BORDERS = ['rounded', 'rectangle'];

function extractPlaylistId(value) {
  if (!value) return '';
  const trimmed = value.trim();
  const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
  if (match?.[1]) return match[1];
  if (/^[A-Za-z0-9_-]{16,65}$/.test(trimmed)) return trimmed;
  return '';
}

export default function DashboardSettings({ config, onConfigChange, onResetLayout }) {
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('background'); // Available sections: background, weather, YouTube, and appearance.
  const importFileRef = useRef(null);
  const backgroundFileRef = useRef(null);
  const [backgroundImageError, setBackgroundImageError] = useState('');
  const [readingBackgroundImage, setReadingBackgroundImage] = useState(false);
  
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
  const [playlistError, setPlaylistError] = useState('');
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

  useEffect(() => {
    const openYouTubeSettings = () => {
      setActiveTab('youtube');
      setShowSettings(true);
    };

    window.addEventListener('open-youtube-settings', openYouTubeSettings);
    return () => window.removeEventListener('open-youtube-settings', openYouTubeSettings);
  }, []);

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
    onConfigChange?.(next);
    setLocalConfig(next);
  };

  const handleBackgroundImageChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setReadingBackgroundImage(true);
    setBackgroundImageError('');
    try {
      const backgroundImage = await readBackgroundImage(file);
      updateConfig({ backgroundType: 'image', backgroundImage });
    } catch (error) {
      setBackgroundImageError(error instanceof Error ? error.message : 'The image could not be applied.');
    } finally {
      setReadingBackgroundImage(false);
    }
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
    if (!trimmed) {
      setPlaylistError('Paste a public YouTube playlist link to continue.');
      return;
    }
    const playlistId = extractPlaylistId(trimmed);
    if (!playlistId) {
      setPlaylistError('That link does not include a playlist ID. Use a public playlist URL with list= in it.');
      return;
    }

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
    setPlaylistError('');
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
        schemaVersion: 3,
        exportedAt: new Date().toISOString(),
        config: legacyBackground && !config.backgroundImage ? { ...config, backgroundImage: legacyBackground } : config,
        cardsLayout: storageManager?.getCardsLayout?.() || {},
        notes: storageManager?.getStickyNotes?.() || [],
        noteCategories: storageManager?.getNoteCategories?.() || ['Inbox'],
        tasks: storageManager?.getTasks?.() || [],
        taskCategories: storageManager?.getTaskCategories?.() || ['Inbox'],
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
        if (Array.isArray(data?.noteCategories)) {
          storageManager?.saveNoteCategories?.(data.noteCategories);
        }
        if (Array.isArray(data?.tasks)) {
          storageManager?.saveTasks?.(data.tasks);
        }
        if (Array.isArray(data?.taskCategories)) {
          storageManager?.saveTaskCategories?.(data.taskCategories);
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
                <Settings size={18} />
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
                      Choose a solid tone, gradient, or custom image. On mobile, select an image from your device; on desktop, you can also drag one onto the dashboard.
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

                    {localConfig.backgroundType === 'image' && (
                      <div className="background-image-picker">
                        <input
                          ref={backgroundFileRef}
                          className="background-image-input"
                          type="file"
                          accept=".gif,.png,.jpg,.jpeg,.webp,image/gif,image/png,image/jpeg,image/webp"
                          onChange={handleBackgroundImageChange}
                          aria-label="Choose a background image"
                        />
                        <button
                          type="button"
                          className="settings-action-btn background-image-button"
                          onClick={() => backgroundFileRef.current?.click()}
                          disabled={readingBackgroundImage}
                        >
                          <ImagePlus size={16} />
                          <span>{readingBackgroundImage ? 'Checking image…' : 'Choose image or GIF'}</span>
                        </button>
                        <p className="settings-description background-image-help">
                          GIF, PNG, JPEG, or WebP · up to 2 MB. SVG and other file types are blocked.
                        </p>
                        {localConfig.backgroundImage && (
                          <p className="background-image-selected" role="status">A custom background is selected.</p>
                        )}
                        {backgroundImageError && (
                          <p className="settings-validation-message" role="alert">{backgroundImageError}</p>
                        )}
                      </div>
                    )}

                    {localConfig.backgroundType === 'solid' && (
                      <div className="field-stack">
                        <label className="settings-sub-label">Solid Color</label>
                        <div className="color-picker-wrapper">
                          <input
                            type="color"
                            value={localConfig.bgColor || '#0b0e0d'}
                            onChange={(event) => updateConfig({ bgColor: event.target.value })}
                          />
                          <span className="color-code">{localConfig.bgColor || '#0b0e0d'}</span>
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
                              value={localConfig.gradientFrom || '#0b0e0d'}
                              onChange={(event) => updateConfig({ gradientFrom: event.target.value })}
                            />
                            <span className="color-code">{localConfig.gradientFrom || '#0b0e0d'}</span>
                          </div>
                          <div className="color-picker-wrapper">
                            <input
                              type="color"
                              value={localConfig.gradientTo || '#111614'}
                              onChange={(event) => updateConfig({ gradientTo: event.target.value })}
                            />
                            <span className="color-code">{localConfig.gradientTo || '#111614'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="drag-drop-hint">
                      <span>Desktop tip:</span> You can also drag an image or GIF onto the dashboard to set it as the background.
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
                        <SelectDropdown
                          label="Timezone"
                          value={weatherTimezone}
                          onChange={setWeatherTimezone}
                          className="ui-select--full"
                          options={[
                            { value: 'Asia/Kolkata', label: 'Asia / Kolkata' },
                            { value: 'Asia/Tokyo', label: 'Asia / Tokyo' },
                            { value: 'Asia/Seoul', label: 'Asia / Seoul' },
                            { value: 'Asia/Singapore', label: 'Asia / Singapore' },
                            { value: 'Europe/London', label: 'Europe / London' },
                            { value: 'Europe/Paris', label: 'Europe / Paris' },
                            { value: 'America/New_York', label: 'America / New York' },
                            { value: 'America/Los_Angeles', label: 'America / Los Angeles' },
                            { value: 'Australia/Sydney', label: 'Australia / Sydney' },
                          ]}
                        />
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

                      <div className="input-group">
                        <label className="settings-sub-label" id="weather-animation-label">Sky Animation</label>
                        <p className="settings-description">
                          Move the sun, moon, and current weather across the sky using the selected timezone.
                        </p>
                        <button
                          type="button"
                          className={`style-toggle-btn ${localConfig.weatherAnimationEnabled !== false ? 'active' : ''}`}
                          aria-label={`Sky animation ${localConfig.weatherAnimationEnabled !== false ? 'enabled' : 'disabled'}`}
                          aria-pressed={localConfig.weatherAnimationEnabled !== false}
                          onClick={() => updateConfig({ weatherAnimationEnabled: localConfig.weatherAnimationEnabled === false })}
                        >
                          {localConfig.weatherAnimationEnabled !== false ? 'Enabled' : 'Disabled'}
                        </button>
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
                      Add a public YouTube playlist link. Private playlists and videos that disallow embedding cannot play here.
                    </p>

                    <div className="field-stack">
                      <input
                        value={playlistName}
                        onChange={(event) => setPlaylistName(event.target.value)}
                        placeholder="Playlist title (e.g., Lofi Chill Beats)"
                      />
                      <input
                        value={playlistLink}
                        onChange={(event) => {
                          setPlaylistLink(event.target.value);
                          setPlaylistError('');
                        }}
                        placeholder="https://www.youtube.com/playlist?list=..."
                      />
                      {playlistError && <p className="settings-validation-message" role="alert">{playlistError}</p>}
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
                      Tinted Glass has a stronger surface tint, Blur Glass is lighter with a soft blur, and Outline is transparent with a defined edge and no blur.
                    </p>

                    <div className="field-stack">
                      <div className="input-group">
                        <label className="settings-sub-label">Card Style</label>
                        <div className="card-style-group">
                          {CARD_STYLES.map(({ value, label }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => updateConfig({ cardStyle: value })}
                              className={`style-toggle-btn ${localConfig.cardStyle === value ? 'active' : ''}`}
                              aria-pressed={localConfig.cardStyle === value}
                            >
                              {label}
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
                        <label className="settings-sub-label">Minimized Widget Dock</label>
                        <p className="settings-description">
                          Choose where minimized widgets gather. The bottom dock expands around the ambient strip.
                        </p>
                        <div className="card-style-group">
                          {[
                            ['bottom', 'Bottom'],
                            ['left', 'Left'],
                            ['right', 'Right'],
                            ['top', 'Top'],
                          ].map(([position, label]) => (
                            <button
                              key={position}
                              type="button"
                              className={`style-toggle-btn ${(localConfig.dockPosition || 'bottom') === position ? 'active' : ''}`}
                              onClick={() => updateConfig({ dockPosition: position })}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="input-group">
                        <label className="settings-sub-label">Dock Tab Style</label>
                        <div className="card-style-group">
                          {[
                            ['icons', 'Compact icons'],
                            ['labels', 'Icons + labels'],
                          ].map(([style, label]) => (
                            <button
                              key={style}
                              type="button"
                              className={`style-toggle-btn ${(localConfig.dockStyle || 'icons') === style ? 'active' : ''}`}
                              onClick={() => updateConfig({ dockStyle: style })}
                            >
                              {label}
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
                              value={localConfig.ambientLightColor || '#b6d2ad'}
                              onChange={(event) => updateConfig({ ambientLightColor: event.target.value })}
                            />
                            <span className="color-code">{localConfig.ambientLightColor || '#b6d2ad'}</span>
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