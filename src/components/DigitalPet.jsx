import { useEffect, useRef, useState } from "react";
import PipIcon from "./PipIcon";
import "../styles/DigitalPet.css";

const WIDGET_IDS = ["timer", "weather", "tasks", "youtube", "analytics", "notes"];
const WELLNESS_REMINDERS = [
  "A little water break, please!",
  "Stand up and give your shoulders a stretch.",
  "Your eyes deserve a look at something far away.",
  "Step outside for a breath of fresh air?",
];

export default function DigitalPet({ layout, minimizedWidgets }) {
  const [visit, setVisit] = useState(null);
  const visitIdRef = useRef(0);
  const layoutRef = useRef(layout);
  const minimizedRef = useRef(minimizedWidgets);
  layoutRef.current = layout;
  minimizedRef.current = minimizedWidgets;

  const showReminder = (message) => {
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
    setVisit({ id: ++visitIdRef.current, widgetId, message });
  };

  useEffect(() => {
    const arrive = setTimeout(() => showReminder("Pip says: take a sip of water and settle in."), 3200);
    const reminderInterval = setInterval(
      () => showReminder(WELLNESS_REMINDERS[Math.floor(Math.random() * WELLNESS_REMINDERS.length)]),
      20 * 60 * 1000,
    );
    const handlePhaseChange = (event) => {
      const message = event.detail?.mode === "break"
        ? WELLNESS_REMINDERS[Math.floor(Math.random() * WELLNESS_REMINDERS.length)]
        : "Break complete. Roll your shoulders and ease back into focus.";
      showReminder(message);
    };
    const handleTaskReminder = (event) => {
      const taskTitles = event.detail?.tasks?.map((task) => task.title).filter(Boolean) || [];
      const message = taskTitles.length === 1
        ? `Time check: did you finish “${taskTitles[0]}”?`
        : `Your task reminder is here. Did you finish ${taskTitles.length} tasks?`;
      showReminder(message);
    };
    const handleTaskCompleted = (event) => {
      const title = event.detail?.title;
      showReminder(title ? `Pip is proud of you. “${title}” is done!` : "Pip is proud of you. One more thing done!");
    };

    window.addEventListener("pomodoro-phase-changed", handlePhaseChange);
    window.addEventListener("task-reminder-due", handleTaskReminder);
    window.addEventListener("task-completed", handleTaskCompleted);
    return () => {
      clearTimeout(arrive);
      clearInterval(reminderInterval);
      window.removeEventListener("pomodoro-phase-changed", handlePhaseChange);
      window.removeEventListener("task-reminder-due", handleTaskReminder);
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
        <PipIcon className="piper-bird" label="Pip the little blue-crested bird" />
      </button>
    </div>
  );
}