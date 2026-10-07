import { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, Settings, X, Circle, AlignLeft } from "lucide-react";
import { storageManager } from "../utils/localStorage";
import "../styles/PomodoroTimer.css";

const PRESETS = [5, 10, 15, 25, 30];
const RADIUS = 100;
const SVG_PADDING = 8;
const SVG_SIZE = (RADIUS + SVG_PADDING) * 2;
const SVG_CENTER = SVG_SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DEFAULT_BREAK_MINUTES = 5;

async function playPhaseSound(audioContextRef, phase) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const audioContext = audioContextRef.current;
    if (audioContext.state === "suspended") await audioContext.resume();
    if (audioContext.state !== "running") return;

    const isBreak = phase === "break";
    const notes = isBreak ? [392, 523, 659, 784] : [660, 880];
    const spacing = isBreak ? 0.2 : 0.18;
    const noteLength = isBreak ? 0.34 : 0.18;
    const volume = isBreak ? 0.22 : 0.12;
    const startTime = audioContext.currentTime;

    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const noteStart = startTime + index * spacing;

      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(volume, noteStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteLength);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + noteLength + 0.01);
    });
  } catch (error) {
    console.warn("Pomodoro phase sound could not be played", error);
  }
}

export default function PomodoroTimer() {
  const [savedDurations] = useState(() => storageManager.getPomodoroConfig());
  const [duration, setDuration] = useState(savedDurations.duration);
  const [breakDuration, setBreakDuration] = useState(savedDurations.breakDuration || DEFAULT_BREAK_MINUTES);

  const [customMinutes, setCustomMinutes] = useState(duration);
  const [time, setTime] = useState(duration * 60);
  const [running, setRunning] = useState(false);
  const [phaseStarted, setPhaseStarted] = useState(false);
  const [mode, setMode] = useState("focus");
  const [sessions, setSessions] = useState(() => (
    storageManager.getAnalyticsEvents().filter((event) => event.type === "focus_completed").length + 1
  ));
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState("circle");
  const audioContextRef = useRef(null);
  const activeSegmentStartedAtRef = useRef(null);
  const phaseSegmentsRef = useRef([]);

  useEffect(() => {
    storageManager.savePomodoroConfig({ duration, breakDuration });
  }, [duration, breakDuration]);

  useEffect(() => () => {
    audioContextRef.current?.close();
  }, []);

  useEffect(() => {
    if (!running) return;

    const interval = setInterval(() => {
      setTime((prevTime) => Math.max(0, prevTime - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (!running || time !== 0) return;

    const nextMode = mode === "focus" ? "break" : "focus";
    const completedAt = new Date().toISOString();
    const segments = [...phaseSegmentsRef.current];
    if (activeSegmentStartedAtRef.current) {
      segments.push({ start: activeSegmentStartedAtRef.current, end: completedAt });
    }
    void playPhaseSound(audioContextRef, nextMode);
    if (nextMode === "break") {
      setSessions((prev) => prev + 1);
      storageManager.recordAnalyticsEvent({
        type: "focus_completed",
        minutes: duration,
        startedAt: segments[0]?.start || completedAt,
        endedAt: completedAt,
        segments,
      });
    } else {
      storageManager.recordAnalyticsEvent({
        type: "break_completed",
        minutes: breakDuration,
        startedAt: segments[0]?.start || completedAt,
        endedAt: completedAt,
        segments,
      });
    }
    phaseSegmentsRef.current = [];
    activeSegmentStartedAtRef.current = completedAt;
    window.dispatchEvent(new CustomEvent("pomodoro-phase-changed", { detail: { mode: nextMode } }));
    setMode(nextMode);
    setPhaseStarted(true);
    setTime((nextMode === "break" ? breakDuration : duration) * 60);
  }, [running, time, mode, duration, breakDuration]);

  const toggleTimer = () => {
    if (running) {
      if (activeSegmentStartedAtRef.current) {
        phaseSegmentsRef.current.push({
          start: activeSegmentStartedAtRef.current,
          end: new Date().toISOString(),
        });
        activeSegmentStartedAtRef.current = null;
      }
      setRunning(false);
      return;
    }

    if (!phaseStarted) {
      void playPhaseSound(audioContextRef, mode);
      setPhaseStarted(true);
    }
    if (!activeSegmentStartedAtRef.current) {
      activeSegmentStartedAtRef.current = new Date().toISOString();
    }
    setRunning(true);
  };

  const selectPreset = (minutes) => {
    setDuration(minutes);
    setCustomMinutes(minutes);
    setTime(minutes * 60);
    setMode("focus");
    setPhaseStarted(false);
    setRunning(false);
    activeSegmentStartedAtRef.current = null;
    phaseSegmentsRef.current = [];
  };

  const handleCustomDuration = (e) => {
    const value = Math.max(1, Math.min(120, parseInt(e.target.value) || 1));
    setCustomMinutes(value);
    setDuration(value);
    setTime(value * 60);
    setMode("focus");
    setPhaseStarted(false);
    setRunning(false);
    activeSegmentStartedAtRef.current = null;
    phaseSegmentsRef.current = [];
  };

  const handleBreakDuration = (e) => {
    const value = Math.max(1, Math.min(60, parseInt(e.target.value) || 1));
    setBreakDuration(value);
    if (activeSegmentStartedAtRef.current) {
      phaseSegmentsRef.current.push({
        start: activeSegmentStartedAtRef.current,
        end: new Date().toISOString(),
      });
      activeSegmentStartedAtRef.current = null;
    }
    if (mode === "break") {
      setTime(value * 60);
      setPhaseStarted(false);
      phaseSegmentsRef.current = [];
    }
    setRunning(false);
  };

  const resetTimer = () => {
    setRunning(false);
    setMode("focus");
    setPhaseStarted(false);
    setTime(duration * 60);
    activeSegmentStartedAtRef.current = null;
    phaseSegmentsRef.current = [];
  };

  const activeDuration = mode === "break" ? breakDuration : duration;
  const totalSeconds = activeDuration * 60;
  const progressRatio = totalSeconds > 0 ? (totalSeconds - time) / totalSeconds : 0;
  const strokeOffset = CIRCUMFERENCE - progressRatio * CIRCUMFERENCE;
  const percentage = Math.round(progressRatio * 100);

  const minutesDisplay = String(Math.floor(time / 60)).padStart(2, "0");
  const secondsDisplay = String(time % 60).padStart(2, "0");

  return (
    <div className={`pomo-outer-card view-${viewMode}`}>
      {/* Timer title, view controls, and settings trigger. */}
      <header className="pomo-header">
        <div className="pomo-badge-group">
          <span className="pomo-badge-label">{mode.toUpperCase()}</span>
          <span className="pomo-badge-count">#{sessions}</span>
        </div>

        <div className="pomo-header-actions">
          <div className="pomo-mode-switch">
            <button
              className={`pomo-toggle-btn ${viewMode === "circle" ? "active" : ""}`}
              onClick={() => setViewMode("circle")}
              title="Circular Dial"
            >
              <Circle size={14} />
            </button>
            <button
              className={`pomo-toggle-btn ${viewMode === "timeline" ? "active" : ""}`}
              onClick={() => setViewMode("timeline")}
              title="Horizontal Timeline"
            >
              <AlignLeft size={14} />
            </button>
          </div>

          <button
            className={`pomo-icon-btn ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings(!showSettings)}
            aria-label="Toggle Settings"
          >
            {showSettings ? <X size={15} /> : <Settings size={15} />}
          </button>
        </div>
      </header>

      {/* Adjust work and break durations without leaving the timer. */}
      {showSettings && (
        <div className="pomo-settings-panel">
          <div className="pomo-presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                className={`pomo-chip ${duration === p ? "active" : ""}`}
                onClick={() => selectPreset(p)}
              >
                {p}m
              </button>
            ))}
          </div>
          <label className="pomo-field">
            <span>Focus</span>
            <input
              type="number"
              min="1"
              max="120"
              value={customMinutes}
              onChange={handleCustomDuration}
              className="pomo-input"
              placeholder="Min"
            />
          </label>
          <label className="pomo-field">
            <span>Break</span>
            <input
              type="number"
              min="1"
              max="60"
              value={breakDuration}
              onChange={handleBreakDuration}
              className="pomo-input"
              aria-label="Break duration in minutes"
            />
          </label>
        </div>
      )}

      {/* Render the selected dial or timeline timer view. */}
      <main className="pomo-body">
        {viewMode === "circle" ? (
          <div className="pomo-circle-stage">
            <div className="pomo-dial-wrapper">
              <svg className="pomo-svg" viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
                <defs>
                  <linearGradient id="pomoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>

                <circle
                  cx={SVG_CENTER}
                  cy={SVG_CENTER}
                  r={RADIUS}
                  className="pomo-track-circle"
                />
                <circle
                  cx={SVG_CENTER}
                  cy={SVG_CENTER}
                  r={RADIUS}
                  className="pomo-progress-circle"
                  style={{
                    strokeDasharray: CIRCUMFERENCE,
                    strokeDashoffset: strokeOffset,
                  }}
                />
              </svg>

              <div className="pomo-dial-center">
                <span className="pomo-status-tag">
                  {mode === "break" ? "ON BREAK" : running ? "FOCUSING" : "PAUSED"}
                </span>
                <div className="pomo-time-display">
                  <span>{minutesDisplay}</span>
                  <span className="pomo-colon">:</span>
                  <span>{secondsDisplay}</span>
                </div>
                <span className="pomo-percentage-tag">{percentage}%</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="pomo-timeline-stage">
            <div className="pomo-timeline-header">
              <span className="pomo-status-tag">
                {mode === "break" ? "ON BREAK" : running ? "FOCUSING" : "PAUSED"}
              </span>
              <span className="pomo-percentage-tag">{percentage}%</span>
            </div>

            <div className="pomo-time-display large">
              <span>{minutesDisplay}</span>
              <span className="pomo-colon">:</span>
              <span>{secondsDisplay}</span>
            </div>

            <div className="pomo-timeline-bar-wrapper">
              <div className="pomo-timeline-track">
                <div className="pomo-timeline-fill" style={{ width: `${percentage}%` }} />
              </div>
              <div className="pomo-timeline-labels">
                <span>0m</span>
                <span>{Math.round(activeDuration / 2)}m</span>
                <span>{activeDuration}m</span>
              </div>
            </div>
          </div>
        )}

        {/* Start, pause, and reset controls. */}
        <div className="pomo-actions">
          <button
            className={`pomo-btn-main ${running ? "pause" : "play"}`}
            onClick={toggleTimer}
          >
            {running ? <Pause size={18} /> : <Play size={18} className="play-offset" />}
          </button>

          <button className="pomo-btn-sub" onClick={resetTimer} title="Reset">
            <RotateCcw size={15} />
          </button>
        </div>
      </main>
    </div>
  );
}