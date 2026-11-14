import { useEffect, useRef, useState } from "react";
import taskCelebrationBird from "../assets/pipbird/Chibi Bird Task Celebration Animation.gif";
import stretchReminderBird from "../assets/pipbird/Kawaii Bird Stretch Reminder Animation.gif";
import waterReminderBird from "../assets/pipbird/Cute Bird Water Reminder Animation.gif";
import "../styles/DigitalPet.css";

const WIDGET_IDS = ["timer", "weather", "tasks", "youtube", "analytics", "notes"];
const WATER_REMINDER = "Time for a sip of water.";

export default function DigitalPet({ layout, minimizedWidgets }) {
  const [visit, setVisit] = useState(null);
  const visitIdRef = useRef(0);
  const layoutRef = useRef(layout);
  const minimizedRef = useRef(minimizedWidgets);
  layoutRef.current = layout;
  minimizedRef.current = minimizedWidgets;

  const showReminder = (message, animation) => {
    const visibleWidgets = WIDGET_IDS.filter((id) => {
      const widget = layoutRef.current[id];
      if (!widget) return false;
      const width = minimizedRef.current[id] ? 64 : widget.w;
      return widget.x + width / 2 >= 36
        && widget.x + width / 2 <= window.innerWidth - 36
        && widget.y < window.innerHeight - 36;
    });
    const candidates = visibleWidgets.length ? visibleWidgets : ["timer"];
    const widgetId = candidates[Math.floor(Math.random() * candidates.length)];
    setVisit({ id: ++visitIdRef.current, widgetId, message, animation });
  };

  useEffect(() => {
    const showWaterReminder = () => showReminder(WATER_REMINDER, waterReminderBird);
    const arrive = setTimeout(showWaterReminder, 3200);
    const reminderInterval = setInterval(showWaterReminder, 20 * 60 * 1000);
    const handlePhaseChange = (event) => {
      if (event.detail?.mode === "break") {
        clearTimeout(arrive);
        showReminder("Focus complete. Take a stretch during your break.", stretchReminderBird);
      } else if (event.detail?.mode === "focus") {
        clearTimeout(arrive);
        showReminder("Break complete. Keep water nearby as you focus.", waterReminderBird);
      }
    };
    const handlePomodoroStarted = (event) => {
      clearTimeout(arrive);
      if (event.detail?.mode === "focus") {
        showReminder("Focus time. Keep water nearby.", waterReminderBird);
      }
    };
    const handleTaskCompleted = (event) => {
      clearTimeout(arrive);
      const title = event.detail?.title;
      const message = title
        ? `Pip is proud of you. “${title}” is done!`
        : "Pip is proud of you. One more thing done!";
      showReminder(message, taskCelebrationBird);
    };

    window.addEventListener("pomodoro-phase-changed", handlePhaseChange);
    window.addEventListener("pomodoro-started", handlePomodoroStarted);
    window.addEventListener("task-completed", handleTaskCompleted);
    return () => {
      clearTimeout(arrive);
      clearInterval(reminderInterval);
      window.removeEventListener("pomodoro-phase-changed", handlePhaseChange);
      window.removeEventListener("pomodoro-started", handlePomodoroStarted);
      window.removeEventListener("task-completed", handleTaskCompleted);
    };
  }, []);

  useEffect(() => {
    if (!visit) return undefined;
    const departure = setTimeout(() => setVisit(null), 10000);
    return () => clearTimeout(departure);
  }, [visit]);

  if (!visit || !layout[visit.widgetId]) return null;

  const widget = layout[visit.widgetId];
  const isMinimized = minimizedWidgets[visit.widgetId];
  const widgetWidth = isMinimized ? 64 : widget.w;
  const petLeft = widget.x + widgetWidth / 2;
  const petTop = Math.max(8, widget.y - 42);
  const bubbleOnLeft = petLeft > window.innerWidth * 0.55;

  return (
    <div
      className="digital-pet-anchor"
      style={{ left: `${petLeft}px`, top: `${petTop}px` }}
      key={visit.id}
    >
      <div className={`digital-pet-message ${bubbleOnLeft ? "message-left" : ""}`} role="status">
        {visit.message}
      </div>
      <button
        type="button"
        className="digital-pet-perch"
        aria-label={`${visit.message} Dismiss Pip`}
        title="Click Pip to dismiss"
        onClick={() => setVisit(null)}
      >
        <img className="piper-bird" src={visit.animation} alt="" draggable="false" />
      </button>
    </div>
  );
}