import { useState } from "react";
import { BarChart3, CheckSquare, Settings2, StickyNote, Timer, Bird } from "lucide-react";
import { Copyright } from "lucide-react";

const DEMOS = [
  { id: "timer", title: "Focus timer", description: "Set your focus and break lengths, then let the timer carry the rhythm.", icon: Timer, source: "https://res.cloudinary.com/g0qwmiex/video/upload/v1791117418/timer.mp4" },
  { id: "tasks", title: "Tasks & reminders", description: "Set an AM/PM reminder, choose a priority, sort your work, and move finished tasks down.", icon: CheckSquare, source: "https://res.cloudinary.com/g0qwmiex/video/upload/v1791116558/tasks.mp4" },
  { id: "notes", title: "Notes", description: "Create titled notes, format the important lines, and arrange them your way.", icon: StickyNote, source: "https://res.cloudinary.com/g0qwmiex/video/upload/v1791117696/notes.mp4" },
  { id: "analytics", title: "Focus analytics", description: "Review focus minutes and completed sessions across hourly, monthly, and yearly views.", icon: BarChart3, source: "https://res.cloudinary.com/g0qwmiex/video/upload/v1791116137/analytics.mp4" },
  { id: "settings", title: "Your workspace", description: "Change the background and appearance, tune widget settings, and manage your dashboard backup.", icon: Settings2, source: "https://res.cloudinary.com/g0qwmiex/video/upload/v1791116441/settings.mp4" },
  { id: "pip", title: "Pip the desk bird", description: "A small perch-side reminder for breaks, water, movement, and task follow-through.", icon: Bird, source: "https://res.cloudinary.com/g0qwmiex/video/upload/v1791112594/pip.mp4" },
];

export default function DemoVideosSection() {
  const [selectedId, setSelectedId] = useState("timer");
  const selected = DEMOS.find((demo) => demo.id === selectedId) || DEMOS[0];

  return (
    <section className="demo-videos-section" id="how-it-works">
      <div className="demo-videos-heading">
        <span className="section-kicker">A closer look</span>
        <h2>Real tools. <em>Real flow.</em></h2>
        <p>Choose a feature to see how it fits into a calmer workday.</p>
      </div>
      <div className="demo-videos-layout">
        <div className="demo-video-player">
          <video key={selected.id} autoPlay muted loop playsInline preload="metadata" aria-label={`${selected.title} product demonstration`}>
            <source src={selected.source} type="video/mp4" />
            Your browser does not support embedded video.
          </video>
          <div className="demo-video-caption">
            <span className="demo-video-caption-icon"><selected.icon size={17} /></span>
            <div><h3>{selected.title}</h3><p>{selected.description}</p></div>
          </div>
        </div>
        <div className="demo-video-list" role="group" aria-label="Choose a feature video">
          {DEMOS.map(({ id, title, icon: Icon }, index) => (
            <button
              className={`demo-video-option ${selectedId === id ? "is-active" : ""}`}
              type="button"
              key={id}
              onClick={() => setSelectedId(id)}
              aria-pressed={selectedId === id}
            >
              <span className="demo-video-option-icon"><Icon size={17} /></span>
              <span className="demo-video-option-copy"><span>{title}</span></span>
              <span className="demo-video-number">0{index + 1}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="demo-media-disclosure">
        <Copyright size={15} />
        <p><strong>Third-party media notice.</strong> Feature demo footage includes GIPHY-sourced clips shown as examples in this personal, non-commercial project. Kazedesk does not claim ownership or grant reuse rights; copyright remains with the respective creators and rights holders. Check GIPHY and original creator terms and get any permission required before reusing clips, especially commercially. Kazedesk being free does not make these clips free to reuse.</p>
      </div>
    </section>
  );
}