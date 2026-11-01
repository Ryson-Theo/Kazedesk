// Centralize persistence for dashboard preferences and user-created content.
const STORAGE_KEYS = {
  DASHBOARD_CONFIG: 'kazedesk_dashboard_config',
  CARDS_LAYOUT: 'kazedesk_cards_layout',
  MINIMIZED_WIDGETS: 'kazedesk_minimized_widgets',
  STICKY_NOTES: 'kazedesk_sticky_notes',
  NOTE_CATEGORIES: 'kazedesk_note_categories',
  NOTE_WALL: 'kazedesk_note_wall',
  NOTE_WALL_BOARDS: 'kazedesk_note_wall_boards',
  TASKS: 'kazedesk_tasks',
  TASK_CATEGORIES: 'kazedesk_task_categories',
  POMODORO_CONFIG: 'kazedesk_pomodoro_config',
  WEATHER_LOCATION: 'kazedesk_weather_location',
  YOUTUBE_PLAYLISTS: 'kazedesk_youtube_playlists',
  CURRENT_YOUTUBE_PLAYLIST: 'kazedesk_current_youtube_playlist',
  ANALYTICS_EVENTS: 'kazedesk_analytics_events',
};

function getEmptyNoteWall() {
  return { positions: {}, sizes: {}, taskPositions: {}, connections: [], attachments: [], webClips: [], comments: {} };
}

function normalizeNoteWall(wall) {
  return {
    positions: wall?.positions && typeof wall.positions === 'object' ? wall.positions : {},
    sizes: wall?.sizes && typeof wall.sizes === 'object' ? wall.sizes : {},
    taskPositions: wall?.taskPositions && typeof wall.taskPositions === 'object' ? wall.taskPositions : {},
    connections: Array.isArray(wall?.connections) ? wall.connections : [],
    attachments: Array.isArray(wall?.attachments) ? wall.attachments : [],
    webClips: Array.isArray(wall?.webClips) ? wall.webClips : [],
    comments: wall?.comments && typeof wall.comments === 'object' && !Array.isArray(wall.comments)
      ? Object.fromEntries(Object.entries(wall.comments).map(([key, comments]) => [
        key,
        Array.isArray(comments)
          ? comments.filter((comment) => comment && typeof comment === 'object' && typeof comment.id === 'string' && typeof comment.text === 'string')
          : [],
      ]))
      : {},
  };
}

function normalizeBoardName(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter a name for this board.');
  const name = value.trim().slice(0, 80);
  return name;
}

function normalizeNoteWallBoard(board) {
  return {
    ...board,
    notes: Array.isArray(board.notes) ? board.notes : [],
    tasks: Array.isArray(board.tasks) ? board.tasks : [],
    categories: Array.isArray(board.categories) && board.categories.length ? board.categories : ['Inbox'],
    taskCategories: Array.isArray(board.taskCategories) && board.taskCategories.length ? board.taskCategories : ['Inbox'],
    wall: normalizeNoteWall(board.wall),
  };
}

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
  saveMinimizedWidgets: (widgets) => {
    localStorage.setItem(STORAGE_KEYS.MINIMIZED_WIDGETS, JSON.stringify(widgets));
  },
  getMinimizedWidgets: () => {
    const saved = localStorage.getItem(STORAGE_KEYS.MINIMIZED_WIDGETS);
    if (!saved) return null;
    try {
      const widgets = JSON.parse(saved);
      return widgets && typeof widgets === 'object' && !Array.isArray(widgets)
        ? { tasks: widgets.tasks === true, youtube: widgets.youtube === true, analytics: widgets.analytics === true, notes: widgets.notes === true }
        : null;
    } catch {
      return null;
    }
  },

  // Sticky note storage and CRUD operations.
  saveStickyNotes: (notes) => {
    localStorage.setItem(STORAGE_KEYS.STICKY_NOTES, JSON.stringify(notes));
  },
  getStickyNotes: () => {
    const saved = localStorage.getItem(STORAGE_KEYS.STICKY_NOTES);
    return saved ? JSON.parse(saved) : [];
  },
  saveNoteWall: (wall) => {
    localStorage.setItem(STORAGE_KEYS.NOTE_WALL, JSON.stringify(wall));
  },
  getNoteWall: () => {
    const saved = localStorage.getItem(STORAGE_KEYS.NOTE_WALL);
    if (!saved) return getEmptyNoteWall();
    try {
      return normalizeNoteWall(JSON.parse(saved));
    } catch {
      return getEmptyNoteWall();
    }
  },
  getNoteWallBoards: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.NOTE_WALL_BOARDS);
      const boards = saved ? JSON.parse(saved) : [];
      return Array.isArray(boards)
        ? boards.filter((board) => board && typeof board.id === 'string' && typeof board.name === 'string').map(normalizeNoteWallBoard)
        : [];
    } catch {
      return [];
    }
  },
  getNoteWallBoard: (id) => storageManager.getNoteWallBoards().find((board) => board.id === id) || null,
  createNoteWallBoard: (value) => {
    const name = normalizeBoardName(value);
    const boards = storageManager.getNoteWallBoards();
    if (boards.some((board) => board.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new Error('A board with this name already exists.');
    }
    const now = new Date().toISOString();
    const board = {
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      notes: [],
      tasks: [],
      categories: ['Inbox'],
      taskCategories: ['Inbox'],
      wall: getEmptyNoteWall(),
    };
    localStorage.setItem(STORAGE_KEYS.NOTE_WALL_BOARDS, JSON.stringify([...boards, board]));
    return board;
  },
  updateNoteWallBoard: (id, updates) => {
    const boards = storageManager.getNoteWallBoards();
    const index = boards.findIndex((board) => board.id === id);
    if (index < 0) throw new Error('This board no longer exists.');
    const nextUpdates = { ...updates };
    if (Object.hasOwn(nextUpdates, 'name')) {
      nextUpdates.name = normalizeBoardName(nextUpdates.name);
      if (boards.some((board) => board.id !== id && board.name.toLocaleLowerCase() === nextUpdates.name.toLocaleLowerCase())) {
        throw new Error('A board with this name already exists.');
      }
    }
    const updated = normalizeNoteWallBoard({
      ...boards[index],
      ...nextUpdates,
      updatedAt: new Date().toISOString(),
    });
    boards[index] = updated;
    localStorage.setItem(STORAGE_KEYS.NOTE_WALL_BOARDS, JSON.stringify(boards));
    return updated;
  },
  deleteNoteWallBoard: (id) => {
    const boards = storageManager.getNoteWallBoards();
    const nextBoards = boards.filter((board) => board.id !== id);
    if (boards.length === nextBoards.length) return false;
    localStorage.setItem(STORAGE_KEYS.NOTE_WALL_BOARDS, JSON.stringify(nextBoards));
    return true;
  },
  saveNoteWallBoard: (id, updates) => {
    const board = storageManager.getNoteWallBoard(id);
    if (!board) throw new Error('This board no longer exists.');
    return storageManager.updateNoteWallBoard(id, { ...updates, name: board.name });
  },
  saveNoteCategories: (categories) => {
    const normalized = Array.isArray(categories)
      ? [...new Set(categories.map((category) => String(category).trim()).filter(Boolean))]
      : [];
    localStorage.setItem(STORAGE_KEYS.NOTE_CATEGORIES, JSON.stringify(normalized.includes('Inbox') ? normalized : ['Inbox', ...normalized]));
  },
  getNoteCategories: () => {
    const saved = localStorage.getItem(STORAGE_KEYS.NOTE_CATEGORIES);
    if (!saved) return ['Inbox'];
    try {
      const categories = JSON.parse(saved);
      if (!Array.isArray(categories)) return ['Inbox'];
      const normalized = [...new Set(categories.filter((category) => typeof category === 'string').map((category) => category.trim()).filter(Boolean))];
      return normalized.includes('Inbox') ? normalized : ['Inbox', ...normalized];
    } catch {
      return ['Inbox'];
    }
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
  saveTaskCategories: (categories) => {
    const normalized = Array.isArray(categories)
      ? [...new Set(categories.map((category) => String(category).trim()).filter(Boolean))]
      : [];
    localStorage.setItem(STORAGE_KEYS.TASK_CATEGORIES, JSON.stringify(normalized.includes('Inbox') ? normalized : ['Inbox', ...normalized]));
  },
  getTaskCategories: () => {
    const saved = localStorage.getItem(STORAGE_KEYS.TASK_CATEGORIES);
    if (!saved) return ['Inbox'];
    try {
      const categories = JSON.parse(saved);
      if (!Array.isArray(categories)) return ['Inbox'];
      const normalized = [...new Set(categories.filter((category) => typeof category === 'string').map((category) => category.trim()).filter(Boolean))];
      return normalized.includes('Inbox') ? normalized : ['Inbox', ...normalized];
    } catch {
      return ['Inbox'];
    }
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
  bgColor: '#0b0e0d',
  backgroundType: 'solid', // Supported background types: solid, gradient, and image.
  gradientFrom: '#0b0e0d',
  gradientTo: '#111614',
  backgroundImage: null,
  ambientLightColor: '#b6d2ad',
  ambientLightEnabled: true,
  weatherAnimationEnabled: true,
  cardStyle: 'glass', // Supported card styles: glass, transparent, and outline.
  cardBorder: 'rounded', // Supported card shapes: rounded and rectangle.
  dockPosition: 'bottom', // Supported minimized-widget dock positions: bottom, top, left, and right.
  dockStyle: 'icons', // Supported dock tab styles: icons and labels.
});

export const getDefaultPomodoroConfig = () => ({
  duration: 20,
  breakDuration: 5,
  progressStyle: 'pixel',
});

const normalizePomodoroConfig = (config = {}) => {
  const duration = Number(config.duration ?? config.workDuration);
  const breakDuration = Number(config.breakDuration);
  return {
    duration: Number.isFinite(duration) && duration >= 1 ? Math.min(120, duration) : 20,
    breakDuration: Number.isFinite(breakDuration) && breakDuration >= 1 ? Math.min(60, breakDuration) : 5,
    progressStyle: config.progressStyle === 'smooth' ? 'smooth' : 'pixel',
  };
};
