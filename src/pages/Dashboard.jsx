import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, CheckSquare, Moon, Music2, Network, StickyNote, Sun } from "lucide-react";

import AmbientLightStrip from "../components/AmbientLightStrip";
import DashboardSettings from "../components/DashboardSettings";
import DigitalPet from "../components/DigitalPet";
import MinimizedWidgetDock from "../components/MinimizedWidgetDock";
import PomodoroTimer from "../components/PomodoroTimer";
import WeatherTime from "../components/WeatherTime";
import NotesCard from "../components/NotesCard";
import TaskCard from "../components/TaskCard";
import YouTubePlayer from "../components/YouTubePlayer";
import { getDefaultDashboardConfig, storageManager } from "../utils/localStorage";

import "../styles/Dashboard.css";

const AnalyticsWidget = lazy(() => import("../components/AnalyticsWidget"));

const MIN_WIDGET_WIDTHS = { timer: 260, weather: 260, tasks: 260, youtube: 280, analytics: 300, notes: 360 };
const MINIMIZABLE_WIDGETS = [
  { id: "tasks", label: "Tasks", Icon: CheckSquare },
  { id: "youtube", label: "YouTube", Icon: Music2 },
  { id: "analytics", label: "Analytics", Icon: BarChart3 },
  { id: "notes", label: "Notes", Icon: StickyNote },
];

function createDefaultLayout(viewportWidth = window.innerWidth) {
  const width = viewportWidth <= 960 ? 1280 : viewportWidth;
  const leftInset = 84;
  const rightInset = 24;
  const gap = 16;
  const availableWidth = width - leftInset - rightInset;

  if (width >= 1300) {
    const columnWidth = Math.min(440, Math.floor((availableWidth - gap * 2) / 3));
    const gridWidth = columnWidth * 3 + gap * 2;
    const startX = leftInset + Math.max(0, Math.floor((availableWidth - gridWidth) / 2));
    const secondRowY = 402;

    return {
      timer: { x: startX, y: 24, w: columnWidth, h: 280 },
      weather: { x: startX + columnWidth + gap, y: 24, w: columnWidth, h: 250 },
      tasks: { x: startX + (columnWidth + gap) * 2, y: 24, w: columnWidth, h: 360 },
      youtube: { x: startX, y: secondRowY, w: columnWidth, h: 360 },
      analytics: { x: startX + columnWidth + gap, y: secondRowY, w: columnWidth, h: 380 },
      notes: { x: startX + (columnWidth + gap) * 2, y: secondRowY, w: columnWidth, h: 360 },
    };
  }

  const columnWidth = Math.min(520, Math.floor((availableWidth - gap) / 2));
  const gridWidth = columnWidth * 2 + gap;
  const startX = leftInset + Math.max(0, Math.floor((availableWidth - gridWidth) / 2));

  return {
    timer: { x: startX, y: 24, w: columnWidth, h: 280 },
    weather: { x: startX + columnWidth + gap, y: 24, w: columnWidth, h: 250 },
    tasks: { x: startX, y: 314, w: columnWidth, h: 360 },
    notes: { x: startX + columnWidth + gap, y: 314, w: columnWidth, h: 360 },
    youtube: { x: startX, y: 694, w: columnWidth, h: 360 },
    analytics: { x: startX + columnWidth + gap, y: 694, w: columnWidth, h: 380 },
  };
}

function mergeSavedLayout(defaultLayout, savedLayout) {
  const saved = savedLayout && typeof savedLayout === "object" && !Array.isArray(savedLayout) ? savedLayout : {};
  return Object.fromEntries(Object.entries(defaultLayout).map(([id, defaults]) => {
    const stored = saved[id] && typeof saved[id] === "object" ? saved[id] : {};
    const width = Number.isFinite(stored.w) ? Math.max(MIN_WIDGET_WIDTHS[id], stored.w) : defaults.w;
    const minHeight = id === "youtube" ? 280 : id === "notes" ? 300 : 220;
    const height = Number.isFinite(stored.h) ? Math.max(minHeight, stored.h) : defaults.h;
    return [id, {
      ...defaults,
      ...stored,
      x: Number.isFinite(stored.x) ? stored.x : defaults.x,
      y: Number.isFinite(stored.y) ? stored.y : defaults.y,
      w: id === "notes" ? Math.max(360, width) : width,
      h: height,
    }];
  }));
}

export default function Dashboard() {
  const workspaceRef = useRef(null);
  const dragMovedRef = useRef(false);
  const idleTimerRef = useRef(null);
  const restoreAnimationTimerRef = useRef(null);
  const [dashboardConfig, setDashboardConfig] = useState(() => {
    const saved = storageManager.getDashboardConfig();
    const legacyBg = localStorage.getItem("dashboard-bg");
    const merged = { ...getDefaultDashboardConfig(), ...saved };
    return legacyBg && !merged.backgroundImage ? { ...merged, backgroundImage: legacyBg } : merged;
  });
  const [theme, setTheme] = useState(() => localStorage.getItem("kazedesk-landing-theme") === "light" ? "light" : "dark");
  const [widgetLayout, setWidgetLayout] = useState(() => {
    const saved = storageManager.getCardsLayout();
    return mergeSavedLayout(createDefaultLayout(), saved);
  });
  const [minimizedWidgets, setMinimizedWidgets] = useState(() => {
    const saved = storageManager.getMinimizedWidgets();
    return saved ? {
      tasks: saved.tasks === true,
      youtube: saved.youtube === true,
      analytics: saved.analytics === true,
      notes: saved.notes === true,
    } : { tasks: true, youtube: true, analytics: true, notes: true };
  });
  const { notes: notesMinimized, tasks: tasksMinimized, youtube: youtubeMinimized, analytics: analyticsMinimized } = minimizedWidgets;
  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [pointerIdle, setPointerIdle] = useState(false);
  const [restoringWidgetId, setRestoringWidgetId] = useState(null);

  useEffect(() => {
    const hideAfterInactivity = () => setPointerIdle(true);
    const handlePointerMovement = () => {
      setPointerIdle(false);
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(hideAfterInactivity, 5000);
    };

    idleTimerRef.current = setTimeout(hideAfterInactivity, 5000);
    window.addEventListener("pointermove", handlePointerMovement, { passive: true });
    window.addEventListener("pointerdown", handlePointerMovement, { passive: true });
    window.addEventListener("touchstart", handlePointerMovement, { passive: true });
    window.addEventListener("focusin", handlePointerMovement);

    return () => {
      clearTimeout(idleTimerRef.current);
      clearTimeout(restoreAnimationTimerRef.current);
      window.removeEventListener("pointermove", handlePointerMovement);
      window.removeEventListener("pointerdown", handlePointerMovement);
      window.removeEventListener("touchstart", handlePointerMovement);
      window.removeEventListener("focusin", handlePointerMovement);
    };
  }, []);

  useEffect(() => {
    const clampLayoutToViewport = () => {
      if (window.innerWidth <= 960 || !workspaceRef.current) return;
      const workspaceWidth = workspaceRef.current.clientWidth;
      const minimumLeft = 84;

      setWidgetLayout((previous) => {
        let changed = false;
        const next = { ...previous };
        Object.entries(previous).forEach(([id, widget]) => {
          const width = Math.min(widget.w, Math.max(MIN_WIDGET_WIDTHS[id], workspaceWidth - minimumLeft - 24));
          const x = Math.min(Math.max(widget.x, minimumLeft), Math.max(minimumLeft, workspaceWidth - width - 24));
          if (x !== widget.x || width !== widget.w) {
            next[id] = { ...widget, x, w: width };
            changed = true;
          }
        });
        return changed ? next : previous;
      });
    };

    clampLayoutToViewport();
    window.addEventListener("resize", clampLayoutToViewport);
    return () => window.removeEventListener("resize", clampLayoutToViewport);
  }, []);

  useEffect(() => {
    storageManager.saveCardsLayout(widgetLayout);
  }, [widgetLayout]);

  useEffect(() => {
    storageManager.saveMinimizedWidgets(minimizedWidgets);
  }, [minimizedWidgets]);

  useEffect(() => {
    if (dashboardConfig.backgroundImage) {
      localStorage.setItem("dashboard-bg", dashboardConfig.backgroundImage);
    }
  }, [dashboardConfig.backgroundImage]);

  useEffect(() => {
    if (!dragState && !resizeState) return;

    const handleMove = (event) => {
      if (!workspaceRef.current) return;
      const bounds = workspaceRef.current.getBoundingClientRect();
      const scrollTop = workspaceRef.current.scrollTop;
      const contentHeight = Math.max(workspaceRef.current.clientHeight, workspaceRef.current.scrollHeight);

      if (dragState) {
        if (
          Math.abs(event.clientX - dragState.startClientX) > 4 ||
          Math.abs(event.clientY - dragState.startClientY) > 4
        ) {
          dragMovedRef.current = true;
        }

        const nextX = event.clientX - bounds.left - dragState.offsetX;
        const nextY = event.clientY - bounds.top + scrollTop - dragState.offsetY;
        const minX = window.innerWidth > 960 ? 84 : 0;

        setWidgetLayout((prev) => {
          const maxX = Math.max(minX, bounds.width - (dragState.width || prev[dragState.id].w || 320) - 24);
          return {
            ...prev,
            [dragState.id]: {
              ...prev[dragState.id],
              x: Math.max(minX, Math.min(nextX, maxX)),
              y: Math.max(0, Math.min(nextY, contentHeight - (dragState.height || prev[dragState.id].h || 240))),
            },
          };
        });
      }

      if (resizeState) {
        const minWidth = resizeState.id === "notes" ? 360 : resizeState.id === "youtube" ? 280 : 260;
        const minHeight = resizeState.id === "notes" ? 300 : resizeState.id === "youtube" ? 280 : 220;
        const nextWidth = Math.max(minWidth, event.clientX - bounds.left - resizeState.offsetX);
        const nextHeight = Math.max(minHeight, event.clientY - bounds.top + scrollTop - resizeState.offsetY);
        setWidgetLayout((prev) => ({
          ...prev,
          [resizeState.id]: {
            ...prev[resizeState.id],
            w: Math.min(Math.max(minWidth, nextWidth), Math.max(minWidth, bounds.width - prev[resizeState.id].x)),
            h: Math.min(Math.max(minHeight, nextHeight), Math.max(minHeight, contentHeight - prev[resizeState.id].y)),
          },
        }));
      }
    };

    const handleUp = () => {
      setDragState(null);
      setResizeState(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragState, resizeState]);

  const handleConfigChange = (updates) => {
    const next = { ...dashboardConfig, ...updates };
    setDashboardConfig(next);
    storageManager.saveDashboardConfig(next);
  };

  const handleBackgroundDrop = (event) => {
    event.preventDefault();

    const candidates = [
      event.dataTransfer.getData("text/uri-list"),
      event.dataTransfer.getData("text/plain"),
      event.dataTransfer.getData("text/html"),
    ].filter(Boolean);

    for (const candidate of candidates) {
      const normalized = candidate.trim();
      const urlMatch = normalized.match(/https?:\/\/[^\s]+/i);
      if (urlMatch?.[0]) {
        handleConfigChange({ backgroundType: 'image', backgroundImage: urlMatch[0], bgColor: dashboardConfig.bgColor });
        return;
      }
    }

    const file = event.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      handleConfigChange({ backgroundType: 'image', backgroundImage: reader.result, bgColor: dashboardConfig.bgColor });
    };
    reader.readAsDataURL(file);
  };

  const startDrag = (id, event) => {
    if (!workspaceRef.current) return;
    const bounds = workspaceRef.current.getBoundingClientRect();
    const current = widgetLayout[id];
    dragMovedRef.current = false;
    setDragState({
      id,
      offsetX: event.clientX - bounds.left - current.x,
      offsetY: event.clientY - bounds.top + workspaceRef.current.scrollTop - current.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      width: (id === "notes" && notesMinimized) || (id === "tasks" && tasksMinimized) || (id === "youtube" && youtubeMinimized) || (id === "analytics" && analyticsMinimized) ? 64 : current.w,
      height: (id === "notes" && notesMinimized) || (id === "tasks" && tasksMinimized) || (id === "youtube" && youtubeMinimized) || (id === "analytics" && analyticsMinimized) ? 64 : current.h,
    });
  };

  const startResize = (id, event) => {
    event.stopPropagation();
    if (!workspaceRef.current) return;
    const bounds = workspaceRef.current.getBoundingClientRect();
    const current = widgetLayout[id];
    setResizeState({
      id,
      offsetX: event.clientX - bounds.left - current.w,
      offsetY: event.clientY - bounds.top + workspaceRef.current.scrollTop - current.h,
    });
  };

  const handleResetLayout = () => {
    setWidgetLayout(createDefaultLayout());
    workspaceRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleWidgetMinimized = (id) => {
    if (minimizedWidgets[id]) {
      setRestoringWidgetId(id);
      clearTimeout(restoreAnimationTimerRef.current);
      restoreAnimationTimerRef.current = setTimeout(() => setRestoringWidgetId(null), 720);
    }
    setMinimizedWidgets((previous) => ({ ...previous, [id]: !previous[id] }));
  };

  const dockItems = MINIMIZABLE_WIDGETS
    .map((item) => ({
      ...item,
      active: !minimizedWidgets[item.id],
      onRestore: () => toggleWidgetMinimized(item.id),
    }));

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("kazedesk-landing-theme", nextTheme);
  };

  const isDefaultSolidColor = ["#0d1117", "#161b22", "#0b0e0d", "#f4f5f1"].includes((dashboardConfig.bgColor || "").toLowerCase());
  const dashboardBackgroundColor = isDefaultSolidColor
    ? theme === "dark" ? "#0b0e0d" : "#f4f5f1"
    : dashboardConfig.bgColor || (theme === "dark" ? "#0b0e0d" : "#f4f5f1");
  const gradientFrom = ["#0d1117", "#0b0e0d", "#f4f5f1"].includes(dashboardConfig.gradientFrom?.toLowerCase())
    ? theme === "dark" ? "#0b0e0d" : "#f4f5f1"
    : dashboardConfig.gradientFrom || dashboardBackgroundColor;
  const gradientTo = ["#161b22", "#111614", "#ecefea"].includes(dashboardConfig.gradientTo?.toLowerCase())
    ? theme === "dark" ? "#111614" : "#ecefea"
    : dashboardConfig.gradientTo || (theme === "dark" ? "#111614" : "#ecefea");

  return (
    <div
      className={`dashboard landing-theme-${theme}`}
      onDrop={handleBackgroundDrop}
      onDragOver={(event) => event.preventDefault()}
      style={{
        backgroundColor: dashboardBackgroundColor,
        backgroundImage: dashboardConfig.backgroundType === 'image' && dashboardConfig.backgroundImage
          ? `url(${dashboardConfig.backgroundImage})`
          : dashboardConfig.backgroundType === 'gradient'
          ? `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`
          : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="dashboardOverlay" />

      <main className="workspace" ref={workspaceRef}>
        <div
          className={`widget ${dashboardConfig.cardStyle || "glass"} ${dashboardConfig.cardBorder || "rounded"}`}
          data-widget-id="timer"
          style={{ left: `${widgetLayout.timer.x}px`, top: `${widgetLayout.timer.y}px`, width: `${widgetLayout.timer.w}px`, height: `${widgetLayout.timer.h}px` }}
          onMouseDown={(event) => startDrag("timer", event)}
        >
          <div className="widget-handle" onMouseDown={(event) => { event.stopPropagation(); startDrag("timer", event); }}>
            <span>Move</span>
          </div>
          <div className="widget-resize-handle" onMouseDown={(event) => startResize("timer", event)} />
          <PomodoroTimer />
        </div>

        <div
          className={`widget ${dashboardConfig.cardStyle || "glass"} ${dashboardConfig.cardBorder || "rounded"}`}
          data-widget-id="weather"
          style={{ left: `${widgetLayout.weather.x}px`, top: `${widgetLayout.weather.y}px`, width: `${widgetLayout.weather.w}px`, height: `${widgetLayout.weather.h}px` }}
          onMouseDown={(event) => startDrag("weather", event)}
        >
          <div className="widget-handle" onMouseDown={(event) => { event.stopPropagation(); startDrag("weather", event); }}>
            <span>Move</span>
          </div>
          <div className="widget-resize-handle" onMouseDown={(event) => startResize("weather", event)} />
          <WeatherTime />
        </div>

        <div
          className={`widget ${dashboardConfig.cardStyle || "glass"} ${dashboardConfig.cardBorder || "rounded"} ${tasksMinimized ? "task-widget-minimized widget-docked" : ""} ${restoringWidgetId === "tasks" ? "widget-restoring" : ""}`}
          data-widget-id="tasks"
          style={{
            left: `${widgetLayout.tasks.x}px`,
            top: `${widgetLayout.tasks.y}px`,
            width: `${tasksMinimized ? 64 : widgetLayout.tasks.w}px`,
            height: `${tasksMinimized ? 64 : widgetLayout.tasks.h}px`,
          }}
          onMouseDown={(event) => startDrag("tasks", event)}
        >
          <div className="widget-handle" onMouseDown={(event) => { event.stopPropagation(); startDrag("tasks", event); }}>
            <span>Move</span>
          </div>
          <div className="widget-resize-handle" onMouseDown={(event) => startResize("tasks", event)} />
          <TaskCard
            minimized={tasksMinimized}
            onToggleMinimize={() => toggleWidgetMinimized("tasks")}
          />
        </div>

        <div
          className={`widget ${dashboardConfig.cardStyle || "glass"} ${dashboardConfig.cardBorder || "rounded"} ${youtubeMinimized ? "youtube-widget-minimized widget-docked" : ""} ${restoringWidgetId === "youtube" ? "widget-restoring" : ""}`}
          data-widget-id="youtube"
          style={{
            left: `${widgetLayout.youtube.x}px`,
            top: `${widgetLayout.youtube.y}px`,
            width: `${youtubeMinimized ? 64 : widgetLayout.youtube.w}px`,
            height: `${youtubeMinimized ? 64 : widgetLayout.youtube.h}px`,
          }}
          onMouseDown={(event) => startDrag("youtube", event)}
        >
          <div className="widget-handle" onMouseDown={(event) => { event.stopPropagation(); startDrag("youtube", event); }}>
            <span>Move</span>
          </div>
          <div className="widget-resize-handle" onMouseDown={(event) => startResize("youtube", event)} />
          <YouTubePlayer
            minimized={youtubeMinimized}
            onResize={(event) => startResize("youtube", event)}
            onToggleMinimize={() => toggleWidgetMinimized("youtube")}
          />
        </div>

        <div
          className={`widget ${dashboardConfig.cardStyle || "glass"} ${dashboardConfig.cardBorder || "rounded"} ${analyticsMinimized ? "analytics-widget-minimized widget-docked" : ""} ${restoringWidgetId === "analytics" ? "widget-restoring" : ""}`}
          data-widget-id="analytics"
          style={{
            left: `${widgetLayout.analytics.x}px`,
            top: `${widgetLayout.analytics.y}px`,
            width: `${analyticsMinimized ? 64 : widgetLayout.analytics.w}px`,
            height: `${analyticsMinimized ? 64 : widgetLayout.analytics.h}px`,
          }}
          onMouseDown={(event) => startDrag("analytics", event)}
        >
          <div className="widget-handle" onMouseDown={(event) => { event.stopPropagation(); startDrag("analytics", event); }}>
            <span>Move</span>
          </div>
          {!analyticsMinimized && <div className="widget-resize-handle" onMouseDown={(event) => startResize("analytics", event)} />}
          <Suspense fallback={null}>
            <AnalyticsWidget
              minimized={analyticsMinimized}
              onToggleMinimize={() => toggleWidgetMinimized("analytics")}
            />
          </Suspense>
        </div>

        <div
          className={`widget ${dashboardConfig.cardStyle || "glass"} ${dashboardConfig.cardBorder || "rounded"} ${notesMinimized ? "notes-widget-minimized widget-docked" : ""} ${restoringWidgetId === "notes" ? "widget-restoring" : ""}`}
          data-widget-id="notes"
          style={{
            left: `${widgetLayout.notes.x}px`,
            top: `${widgetLayout.notes.y}px`,
            width: `${notesMinimized ? 64 : widgetLayout.notes.w}px`,
            height: `${notesMinimized ? 64 : widgetLayout.notes.h}px`,
          }}
          onMouseDown={(event) => startDrag("notes", event)}
        >
          <div className="widget-handle" onMouseDown={(event) => { event.stopPropagation(); startDrag("notes", event); }}>
            <span>Move</span>
          </div>
          <div className="widget-resize-handle" onMouseDown={(event) => startResize("notes", event)} />
          <NotesCard
            minimized={notesMinimized}
            onToggleMinimize={() => toggleWidgetMinimized("notes")}
          />
        </div>

        <DigitalPet
          layout={widgetLayout}
          minimizedWidgets={{ tasks: tasksMinimized, youtube: youtubeMinimized, analytics: analyticsMinimized, notes: notesMinimized }}
        />
      </main>

      <div className="floatingSettingsWrapper">
        <div className="dashboard-control-cluster">
          <DashboardSettings config={dashboardConfig} onConfigChange={handleConfigChange} onResetLayout={handleResetLayout} />
          <div className="dashboard-top-actions">
            <Link className="wall-open-link" to="/wall"><Network size={16} /> NoteMap</Link>
            <button type="button" className="dashboard-theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </div>

      {dashboardConfig.dockPosition !== "bottom" && (
        <MinimizedWidgetDock
          items={dockItems}
          position={dashboardConfig.dockPosition || "bottom"}
          style={dashboardConfig.dockStyle || "icons"}
          idle={pointerIdle}
        />
      )}
      {dashboardConfig.ambientLightEnabled !== false && (
        <div className={`bottomAmbient ${dashboardConfig.dockPosition === "bottom" ? "bottomAmbient-with-dock" : ""}`}>
          <AmbientLightStrip
            color={dashboardConfig.ambientLightColor || "#b6d2ad"}
            idle={pointerIdle}
            dockItems={dashboardConfig.dockPosition === "bottom" ? dockItems : []}
            dockStyle={dashboardConfig.dockStyle || "icons"}
          />
        </div>
      )}
      {dashboardConfig.dockPosition === "bottom" && dashboardConfig.ambientLightEnabled === false && (
        <MinimizedWidgetDock items={dockItems} position="bottom" style={dashboardConfig.dockStyle || "icons"} />
      )}

      <div className="dashboard-attribution">
        Kazedesk — a project by <a href="https://ribin-portfolio.vercel.app/" target="_blank" rel="noreferrer">Ribin K Roy</a>
      </div>
    </div>
  );
}