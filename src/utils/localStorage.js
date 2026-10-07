// Centralize persistence for dashboard preferences and user-created content.
const STORAGE_KEYS = {
  DASHBOARD_CONFIG: 'kazedesk_dashboard_config',
  CARDS_LAYOUT: 'kazedesk_cards_layout',
  STICKY_NOTES: 'kazedesk_sticky_notes',
  TASKS: 'kazedesk_tasks',
  POMODORO_CONFIG: 'kazedesk_pomodoro_config',
  WEATHER_LOCATION: 'kazedesk_weather_location',
  YOUTUBE_PLAYLISTS: 'kazedesk_youtube_playlists',
  CURRENT_YOUTUBE_PLAYLIST: 'kazedesk_current_youtube_playlist',
  ANALYTICS_EVENTS: 'kazedesk_analytics_events',
};

export const storageManager = {
  // Dashboard appearance and behavior preferences.
  saveDashboardConfig: (config) => {
    localStorage.setItem(STORAGE_KEYS.DASHBOARD_CONFIG, JSON.stringify(config));
  },
  getDashboardConfig: () => {
    const saved = localStorage.getItem(STORAGE_KEYS.DASHBOARD_CONFIG);
    return saved ? JSON.parse(saved) : getDefaultDashboardConfig();
  },

  // Saved positions and sizes for dashboard cards.
  saveCardsLayout: (layout) => {
    localStorage.setItem(STORAGE_KEYS.CARDS_LAYOUT, JSON.stringify(layout));
  },
  getCardsLayout: () => {
    const saved = localStorage.getItem(STORAGE_KEYS.CARDS_LAYOUT);
    return saved ? JSON.parse(saved) : {};
  },

  // Sticky note storage and CRUD operations.
  saveStickyNotes: (notes) => {
    localStorage.setItem(STORAGE_KEYS.STICKY_NOTES, JSON.stringify(notes));
  },
  getStickyNotes: () => {
    const saved = localStorage.getItem(STORAGE_KEYS.STICKY_NOTES);
    return saved ? JSON.parse(saved) : [];
  },
  addStickyNote: (note) => {
    const notes = storageManager.getStickyNotes();
    notes.push({ id: Date.now(), ...note });
    storageManager.saveStickyNotes(notes);
    return notes;
  },
  deleteStickyNote: (id) => {
    const notes = storageManager.getStickyNotes();
    const filtered = notes.filter((n) => n.id !== id);
    storageManager.saveStickyNotes(filtered);
    return filtered;
  },
  updateStickyNote: (id, updates) => {
    const notes = storageManager.getStickyNotes();
    const updated = notes.map((n) => (n.id === id ? { ...n, ...updates } : n));
    storageManager.saveStickyNotes(updated);
    return updated;
  },

  // Task storage, CRUD operations, and analytics events.
  saveTasks: (tasks) => {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  },
  getTasks: () => {
    const saved = localStorage.getItem(STORAGE_KEYS.TASKS);
    return saved ? JSON.parse(saved) : [];
  },
  getAnalyticsEvents: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ANALYTICS_EVENTS);
      const events = saved ? JSON.parse(saved) : [];
      return Array.isArray(events) ? events : [];
    } catch {
      return [];
    }
  },
  saveAnalyticsEvents: (events) => {
    const validEvents = Array.isArray(events)
      ? events.filter((event) => event && typeof event === 'object' && typeof event.timestamp === 'string' && typeof event.type === 'string')
      : [];
    localStorage.setItem(STORAGE_KEYS.ANALYTICS_EVENTS, JSON.stringify(validEvents.slice(-5000)));
    window.dispatchEvent(new Event('kazedesk-analytics-updated'));
  },
  recordAnalyticsEvent: (event) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...event,
    };
    const events = [...storageManager.getAnalyticsEvents(), entry].slice(-5000);
    localStorage.setItem(STORAGE_KEYS.ANALYTICS_EVENTS, JSON.stringify(events));
    window.dispatchEvent(new Event('kazedesk-analytics-updated'));
    return entry;
  },
  addTask: (task) => {
    const tasks = storageManager.getTasks();
    tasks.push({ id: Date.now(), subtasks: [], ...task });
    storageManager.saveTasks(tasks);
    return tasks;
  },
  updateTask: (id, updates) => {
    const tasks = storageManager.getTasks();
    const updated = tasks.map((t) => (t.id === id ? { ...t, ...updates } : t));
    storageManager.saveTasks(updated);
    return updated;
  },
  deleteTask: (id) => {
    const tasks = storageManager.getTasks();
    const filtered = tasks.filter((t) => t.id !== id);
    storageManager.saveTasks(filtered);
    return filtered;
  },

  // Pomodoro preferences, including migration from the legacy key.
  savePomodoroConfig: (config) => {
    const normalized = normalizePomodoroConfig(config);
    localStorage.setItem(STORAGE_KEYS.POMODORO_CONFIG, JSON.stringify(normalized));
    localStorage.removeItem('pomodoro');
  },
  getPomodoroConfig: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.POMODORO_CONFIG);
      const legacy = localStorage.getItem('pomodoro');
      const config = saved ? JSON.parse(saved) : {};
      const legacyConfig = legacy ? JSON.parse(legacy) : {};
      return normalizePomodoroConfig({ ...legacyConfig, ...config });
    } catch {
      return getDefaultPomodoroConfig();
    }
  },

  // Saved location used by the weather widget.
  saveWeatherLocation: (location) => {
    localStorage.setItem(STORAGE_KEYS.WEATHER_LOCATION, location);
  },
  getWeatherLocation: () => {
    return localStorage.getItem(STORAGE_KEYS.WEATHER_LOCATION) || 'New York';
  },

  // Saved playlists and the currently selected playlist.
  saveYouTubePlaylists: (playlists) => {
    localStorage.setItem(STORAGE_KEYS.YOUTUBE_PLAYLISTS, JSON.stringify(playlists));
  },
  getYouTubePlaylists: () => {
    const saved = localStorage.getItem(STORAGE_KEYS.YOUTUBE_PLAYLISTS);
    return saved ? JSON.parse(saved) : [];
  },
  saveCurrentYouTubePlaylist: (playlistId) => {
    localStorage.setItem(STORAGE_KEYS.CURRENT_YOUTUBE_PLAYLIST, playlistId);
  },
  getCurrentYouTubePlaylist: () => {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_YOUTUBE_PLAYLIST) || '';
  },

  // Remove Kazedesk data, including keys used by older versions.
  clearAllData: () => {
    [...Object.values(STORAGE_KEYS), 'pomodoro', 'weather-widget', 'dashboard-bg'].forEach((key) => {
      localStorage.removeItem(key);
    });
  },
};

export const getDefaultDashboardConfig = () => ({
  bgColor: '#0d1117',
  backgroundType: 'solid', // Supported background types: solid, gradient, and image.
  gradientFrom: '#0d1117',
  gradientTo: '#161b22',
  backgroundImage: null,
  ambientLightColor: '#8b949e',
  ambientLightEnabled: true,
  cardStyle: 'glass', // Supported card styles: glass, transparent, and outline.
  cardBorder: 'rounded', // Supported card shapes: rounded and rectangle.
});

export const getDefaultPomodoroConfig = () => ({
  duration: 20,
  breakDuration: 5,
});

const normalizePomodoroConfig = (config = {}) => {
  const duration = Number(config.duration ?? config.workDuration);
  const breakDuration = Number(config.breakDuration);
  return {
    duration: Number.isFinite(duration) && duration >= 1 ? Math.min(120, duration) : 20,
    breakDuration: Number.isFinite(breakDuration) && breakDuration >= 1 ? Math.min(60, breakDuration) : 5,
  };
};
