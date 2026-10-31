import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, CheckSquare, GripVertical, Moon, Music2, Network, StickyNote, Sun } from "lucide-react";

import AmbientLightStrip from "../components/AmbientLightStrip";
import DashboardSettings from "../components/DashboardSettings";
import DigitalPet from "../components/DigitalPet";
import MinimizedWidgetDock from "../components/MinimizedWidgetDock";
import PomodoroTimer from "../components/PomodoroTimer";
import WeatherTime from "../components/WeatherTime";
import NotesCard from "../components/NotesCard";
import TaskCard from "../components/TaskCard";
import YouTubePlayer from "../components/YouTubePlayer";
import { readBackgroundImage } from "../utils/backgroundImage";
import { getDefaultDashboardConfig, storageManager } from "../utils/localStorage";

import "../styles/Dashboard.css";

const AnalyticsWidget = lazy(() => import("../components/AnalyticsWidget"));

const MIN_WIDGET_WIDTHS = { timer: 260, weather: 260, tasks: 260, youtube: 280, analytics: 300, notes: 360 };
const WIDGET_IDS = ["timer", "weather", "tasks", "youtube", "analytics", "notes"];
const MINIMIZABLE_WIDGETS = [
  { id: "tasks", label: "Tasks", Icon: CheckSquare },
  { id: "youtube", label: "YouTube", Icon: Music2 },
  { id: "analytics", label: "Analytics", Icon: BarChart3 },
  { id: "notes", label: "Notes", Icon: StickyNote },
];

function normalizeWidgetOrder(order) {
  const savedOrder = Array.isArray(order) ? order.filter((id) => WIDGET_IDS.includes(id)) : [];
  return [...new Set([...savedOrder, ...WIDGET_IDS])];
}

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
  const backgroundDropErrorTimerRef = useRef(null);
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
  const [mobileWidgetOrder, setMobileWidgetOrder] = useState(() => (
    normalizeWidgetOrder(storageManager.getCardsLayout()?.mobileOrder)
  ));
  const [widgetStackOrder, setWidgetStackOrder] = useState(WIDGET_IDS);
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
  const [mobileDraggedWidgetId, setMobileDraggedWidgetId] = useState(null);
  const [mobileDropTargetId, setMobileDropTargetId] = useState(null);
  const [backgroundDropError, setBackgroundDropError] = useState("");
  const mobilePointerRef = useRef(null);

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
      clearTimeout(backgroundDropErrorTimerRef.current);
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

      setWidgetLayout((previous) => {
        let changed = false;
        const next = { ...previous };
        Object.entries(previous).forEach(([id, widget]) => {
          const width = Math.min(widget.w, workspaceWidth);
          const x = Math.min(Math.max(widget.x, 0), Math.max(0, workspaceWidth - width));
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
    storageManager.saveCardsLayout({ ...widgetLayout, mobileOrder: mobileWidgetOrder });
  }, [widgetLayout, mobileWidgetOrder]);

  useEffect(() => {
    storageManager.saveMinimizedWidgets(minimizedWidgets);
  }, [minimizedWidgets]);

  useEffect(() => {
    storageManager.saveDashboardConfig(dashboardConfig);
    localStorage.removeItem("dashboard-bg");
  }, [dashboardConfig]);

  useEffect(() => {
    if (!dragState && !resizeState) return;

    const handleMove = (event) => {
      if (!workspaceRef.current) return;
      const bounds = workspaceRef.current.getBoundingClientRect();
      const scrollTop = workspaceRef.current.scrollTop;

      if (dragState) {
        if (
          Math.abs(event.clientX - dragState.startClientX) > 4 ||
          Math.abs(event.clientY - dragState.startClientY) > 4
        ) {
          dragMovedRef.current = true;
        }

        const nextX = event.clientX - bounds.left - dragState.offsetX;
        const nextY = event.clientY - bounds.top + scrollTop - dragState.offsetY;

        setWidgetLayout((prev) => {
          const width = dragState.width || prev[dragState.id].w || 320;
          const height = dragState.height || prev[dragState.id].h || 240;
          const maxX = Math.max(0, bounds.width - width);
          const minY = scrollTop;
          const maxY = Math.max(minY, scrollTop + workspaceRef.current.clientHeight - height);
          return {
            ...prev,
            [dragState.id]: {
              ...prev[dragState.id],
              x: Math.max(0, Math.min(nextX, maxX)),
              y: Math.max(minY, Math.min(nextY, maxY)),
            },
          };
        });
      }

      if (resizeState) {
        const minWidth = resizeState.id === "notes" ? 360 : resizeState.id === "youtube" ? 280 : 260;
        const minHeight = resizeState.id === "notes" ? 300 : resizeState.id === "youtube" ? 280 : 220;
        const nextWidth = Math.max(minWidth, event.clientX - bounds.left - resizeState.offsetX);
        const nextHeight = Math.max(minHeight, event.clientY - bounds.top + scrollTop - resizeState.offsetY);
        setWidgetLayout((prev) => {
          const current = prev[resizeState.id];
          const maxWidth = Math.max(1, bounds.width - current.x);
          const maxHeight = Math.max(
            1,
            workspaceRef.current.clientHeight + scrollTop - current.y,
          );
          return {
            ...prev,
            [resizeState.id]: {
              ...current,
              w: Math.min(Math.max(minWidth, nextWidth), maxWidth),
              h: Math.min(Math.max(minHeight, nextHeight), maxHeight),
            },
          };
        });
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

  useEffect(() => {
    const handlePointerMove = (event) => {
      const pointer = mobilePointerRef.current;
      if (!pointer) return;

      if (!pointer.active) {
        const moved = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
        if (moved > 10) {
          clearTimeout(pointer.timer);
          mobilePointerRef.current = null;
        }
        return;
      }

      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-widget-id]");
      const targetId = target?.getAttribute("data-widget-id");
      pointer.dropTargetId = WIDGET_IDS.includes(targetId) ? targetId : null;
      setMobileDropTargetId(pointer.dropTargetId);
    };

    const handlePointerUp = () => {
      const pointer = mobilePointerRef.current;
      if (!pointer) return;
      clearTimeout(pointer.timer);
      if (pointer.active && pointer.dropTargetId && pointer.dropTargetId !== pointer.id) {
        setMobileWidgetOrder((previous) => {
          const next = [...previous];
          const sourceIndex = next.indexOf(pointer.id);
          const targetIndex = next.indexOf(pointer.dropTargetId);
          if (sourceIndex < 0 || targetIndex < 0) return previous;
          next.splice(sourceIndex, 1);
          next.splice(targetIndex, 0, pointer.id);
          return next;
        });
      }
      mobilePointerRef.current = null;
      setMobileDraggedWidgetId(null);
      setMobileDropTargetId(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const handleConfigChange = (updates) => {
    const next = { ...dashboardConfig, ...updates };
    storageManager.saveDashboardConfig(next);
    setDashboardConfig(next);
  };

  const showBackgroundDropError = (message) => {
    setBackgroundDropError(message);
    clearTimeout(backgroundDropErrorTimerRef.current);
    backgroundDropErrorTimerRef.current = setTimeout(() => setBackgroundDropError(""), 6000);
  };

  const handleBackgroundDrop = async (event) => {
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
        const url = urlMatch[0];
        if (!/\.(gif|png|jpe?g|webp)(?:[?#].*)?$/i.test(url)) {
          showBackgroundDropError("Use a GIF, PNG, JPEG, or WebP image URL.");
          return;
        }
        handleConfigChange({ backgroundType: 'image', backgroundImage: url, bgColor: dashboardConfig.bgColor });
        return;
      }
    }

    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const backgroundImage = await readBackgroundImage(file);
      handleConfigChange({ backgroundType: 'image', backgroundImage, bgColor: dashboardConfig.bgColor });
      setBackgroundDropError("");
    } catch (error) {
      showBackgroundDropError(error instanceof Error ? error.message : "The image could not be applied.");
    }
  };

  const startDrag = (id, event) => {
    if (window.innerWidth <= 960) return;
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

  const bringWidgetToFront = (id) => {
    setWidgetStackOrder((previous) => (
      previous[previous.length - 1] === id
        ? previous
        : [...previous.filter((widgetId) => widgetId !== id), id]
    ));
  };

  const startMobileWidgetReorder = (id, event) => {
    if (window.innerWidth > 960) return;
    event.preventDefault();
    event.stopPropagation();
    if (mobilePointerRef.current) clearTimeout(mobilePointerRef.current.timer);

    const pointer = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      dropTargetId: null,
      timer: null,
    };
    mobilePointerRef.current = pointer;
    setMobileDropTargetId(null);

    pointer.timer = setTimeout(() => {
      if (mobilePointerRef.current !== pointer) return;
      pointer.active = true;
      setMobileDraggedWidgetId(id);
    }, 500);
  };

  const renderMobileDragZones = (id) => (
    <>
      <button
        type="button"
        className="widget-mobile-drag-zone widget-mobile-drag-zone-left"
        aria-label={`Hold to reorder ${id}`}
        tabIndex={-1}
        onPointerDown={(event) => startMobileWidgetReorder(id, event)}
        onMouseDown={(event) => event.stopPropagation()}
      />
      <button
        type="button"
        className="widget-mobile-drag-zone widget-mobile-drag-zone-right"
        aria-label={`Hold to reorder ${id}`}
        tabIndex={-1}
        onPointerDown={(event) => startMobileWidgetReorder(id, event)}
        onMouseDown={(event) => event.stopPropagation()}
      />
      {mobileDraggedWidgetId === id && (
        <div className="widget-mobile-drag-indicator" aria-hidden="true">
          <GripVertical size={16} />
          <span>Drag to reorder</span>
        </div>
      )}
    </>
  );

  const startResize = (id, event) => {
    event.stopPropagation();
    if (window.innerWidth <= 960) return;
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
    setMobileWidgetOrder(WIDGET_IDS);
    workspaceRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleWidgetMinimized = (id) => {
    if (minimizedWidgets[id]) {
      bringWidgetToFront(id);
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
      {backgroundDropError && (
        <div className="dashboard-background-error" role="alert">
          {backgroundDropError}
        </div>
      )}

      <main className="workspace" ref={workspaceRef}>
        <div
          className={`widget ${dashboardConfig.cardStyle || "glass"} ${dashboardConfig.cardBorder || "rounded"} ${mobileDraggedWidgetId === "timer" ? "mobile-widget-dragging" : ""} ${mobileDropTargetId === "timer" ? "mobile-widget-drop-target" : ""}`}
          data-widget-id="timer"
          style={{ left: `${widgetLayout.timer.x}px`, top: `${widgetLayout.timer.y}px`, width: `${widgetLayout.timer.w}px`, height: `${widgetLayout.timer.h}px`, order: mobileWidgetOrder.indexOf("timer"), zIndex: widgetStackOrder.indexOf("timer") + 1 }}
          onPointerDownCapture={() => bringWidgetToFront("timer")}
          onMouseDown={(event) => startDrag("timer", event)}
        >
          {renderMobileDragZones("timer")}
          <div className="widget-handle" onMouseDown={(event) => { event.stopPropagation(); startDrag("timer", event); }}>
            <span>Move</span>
          </div>
          <div className="widget-resize-handle" onMouseDown={(event) => startResize("timer", event)} />
          <PomodoroTimer />
        </div>

        <div
          className={`widget ${dashboardConfig.cardStyle || "glass"} ${dashboardConfig.cardBorder || "rounded"} ${mobileDraggedWidgetId === "weather" ? "mobile-widget-dragging" : ""} ${mobileDropTargetId === "weather" ? "mobile-widget-drop-target" : ""}`}
          data-widget-id="weather"
          style={{ left: `${widgetLayout.weather.x}px`, top: `${widgetLayout.weather.y}px`, width: `${widgetLayout.weather.w}px`, height: `${widgetLayout.weather.h}px`, order: mobileWidgetOrder.indexOf("weather"), zIndex: widgetStackOrder.indexOf("weather") + 1 }}
          onPointerDownCapture={() => bringWidgetToFront("weather")}
          onMouseDown={(event) => startDrag("weather", event)}
        >
          {renderMobileDragZones("weather")}
          <div className="widget-handle" onMouseDown={(event) => { event.stopPropagation(); startDrag("weather", event); }}>
            <span>Move</span>
          </div>
          <div className="widget-resize-handle" onMouseDown={(event) => startResize("weather", event)} />
          <WeatherTime animationEnabled={dashboardConfig.weatherAnimationEnabled !== false} />
        </div>

        <div
          className={`widget ${dashboardConfig.cardStyle || "glass"} ${dashboardConfig.cardBorder || "rounded"} ${tasksMinimized ? "task-widget-minimized widget-docked" : ""} ${restoringWidgetId === "tasks" ? "widget-restoring" : ""} ${mobileDraggedWidgetId === "tasks" ? "mobile-widget-dragging" : ""} ${mobileDropTargetId === "tasks" ? "mobile-widget-drop-target" : ""}`}
          data-widget-id="tasks"
          style={{
            left: `${widgetLayout.tasks.x}px`,
            top: `${widgetLayout.tasks.y}px`,
            width: `${tasksMinimized ? 64 : widgetLayout.tasks.w}px`,
            height: `${tasksMinimized ? 64 : widgetLayout.tasks.h}px`,
            order: mobileWidgetOrder.indexOf("tasks"),
            zIndex: widgetStackOrder.indexOf("tasks") + 1,
          }}
          onPointerDownCapture={() => bringWidgetToFront("tasks")}
          onMouseDown={(event) => startDrag("tasks", event)}
        >
          {renderMobileDragZones("tasks")}
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
          className={`widget ${dashboardConfig.cardStyle || "glass"} ${dashboardConfig.cardBorder || "rounded"} ${youtubeMinimized ? "youtube-widget-minimized widget-docked" : ""} ${restoringWidgetId === "youtube" ? "widget-restoring" : ""} ${mobileDraggedWidgetId === "youtube" ? "mobile-widget-dragging" : ""} ${mobileDropTargetId === "youtube" ? "mobile-widget-drop-target" : ""}`}
          data-widget-id="youtube"
          style={{
            left: `${widgetLayout.youtube.x}px`,
            top: `${widgetLayout.youtube.y}px`,
            width: `${youtubeMinimized ? 64 : widgetLayout.youtube.w}px`,
            height: `${youtubeMinimized ? 64 : widgetLayout.youtube.h}px`,
            order: mobileWidgetOrder.indexOf("youtube"),
            zIndex: widgetStackOrder.indexOf("youtube") + 1,
          }}
          onPointerDownCapture={() => bringWidgetToFront("youtube")}
          onMouseDown={(event) => startDrag("youtube", event)}
        >
          {renderMobileDragZones("youtube")}
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
          className={`widget ${dashboardConfig.cardStyle || "glass"} ${dashboardConfig.cardBorder || "rounded"} ${analyticsMinimized ? "analytics-widget-minimized widget-docked" : ""} ${restoringWidgetId === "analytics" ? "widget-restoring" : ""} ${mobileDraggedWidgetId === "analytics" ? "mobile-widget-dragging" : ""} ${mobileDropTargetId === "analytics" ? "mobile-widget-drop-target" : ""}`}
          data-widget-id="analytics"
          style={{
            left: `${widgetLayout.analytics.x}px`,
            top: `${widgetLayout.analytics.y}px`,
            width: `${analyticsMinimized ? 64 : widgetLayout.analytics.w}px`,
            height: `${analyticsMinimized ? 64 : widgetLayout.analytics.h}px`,
            order: mobileWidgetOrder.indexOf("analytics"),
            zIndex: widgetStackOrder.indexOf("analytics") + 1,
          }}
          onPointerDownCapture={() => bringWidgetToFront("analytics")}
          onMouseDown={(event) => startDrag("analytics", event)}
        >
          {renderMobileDragZones("analytics")}
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
          className={`widget ${dashboardConfig.cardStyle || "glass"} ${dashboardConfig.cardBorder || "rounded"} ${notesMinimized ? "notes-widget-minimized widget-docked" : ""} ${restoringWidgetId === "notes" ? "widget-restoring" : ""} ${mobileDraggedWidgetId === "notes" ? "mobile-widget-dragging" : ""} ${mobileDropTargetId === "notes" ? "mobile-widget-drop-target" : ""}`}
          data-widget-id="notes"
          style={{
            left: `${widgetLayout.notes.x}px`,
            top: `${widgetLayout.notes.y}px`,
            width: `${notesMinimized ? 64 : widgetLayout.notes.w}px`,
            height: `${notesMinimized ? 64 : widgetLayout.notes.h}px`,
            order: mobileWidgetOrder.indexOf("notes"),
            zIndex: widgetStackOrder.indexOf("notes") + 1,
          }}
          onPointerDownCapture={() => bringWidgetToFront("notes")}
          onMouseDown={(event) => startDrag("notes", event)}
        >
          {renderMobileDragZones("notes")}
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