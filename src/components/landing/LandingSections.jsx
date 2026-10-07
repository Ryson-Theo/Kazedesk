import { useEffect, useRef } from "react";
import { BarChart3, CheckCircle2, CloudSun, Code2, Image, LockKeyhole, Music2, StickyNote, Timer, Users } from "lucide-react";
import analyticsImage from "../../assets/features/analytics.png";
import notesImage from "../../assets/features/notes.png";
import playlistImage from "../../assets/features/playlist.png";
import privateImage from "../../assets/features/private.png";
import tasksImage from "../../assets/features/tasks.jpg";
import timerImage from "../../assets/features/timer.png";
import weatherImage from "../../assets/features/weather.png";
import workspaceImage from "../../assets/features/workspace.png";
import { LANDING_LINKS } from "./landingLinks";
import GithubIcon from "./GithubIcon";

const FEATURES = [
  [Timer, "01", "Focus timer", "Choose a focus length and break rhythm that works for you.", timerImage],
  [CloudSun, "02", "Weather & time", "Keep local conditions and your chosen clock close by.", weatherImage],
  [CheckCircle2, "03", "Tasks & reminders", "Prioritize your next steps and get timely reminders.", tasksImage],
  [StickyNote, "04", "Notes that stay handy", "Write titled notes, format key ideas, and arrange your list.", notesImage],
  [Music2, "05", "YouTube playlists", "Keep a playlist alongside the rest of your workspace.", playlistImage],
  [Image, "06", "Your own workspace", "Choose a background and tune the look of your widgets.", workspaceImage],
  [BarChart3, "07", "Focus analytics", "See saved focus time and completed sessions over time.", analyticsImage],
  [LockKeyhole, "08", "Private by design", "Your tasks, notes, and history stay in your browser.", privateImage],
];

const FAQS = [
  ["Is Kazedesk free?", "Yes. Kazedesk is free to use with no paid tier or ads."],
  ["Do I need an account?", "No. Open the dashboard and start using it without signing up."],
  ["Where is my data stored?", "Your settings, tasks, notes, and analytics are kept in this browser's local storage."],
  ["Can I self-host it?", "Yes. Kazedesk is a client-side React app. The source is available on GitHub, and you can build and host the static site yourself."],
  ["Does it work offline?", "The app shell and locally saved information are available after loading. Weather updates and YouTube playback require internet access."],
];

export function FeatureGrid() {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const cards = Array.from(track.children);
    const swipeLayout = window.matchMedia("(max-width: 720px), (prefers-reduced-motion: reduce)");
    let frame = null;

    const updateRail = () => {
      frame = null;
      if (swipeLayout.matches) {
        section.style.height = "";
        track.style.transform = "";
        cards.forEach((card) => {
          card.style.removeProperty("--card-tilt");
          card.style.removeProperty("--card-scale");
          card.style.removeProperty("--card-opacity");
        });
        return;
      }

      if (viewport.scrollLeft !== 0) viewport.scrollLeft = 0;
      const travel = Math.max(0, track.scrollWidth - viewport.clientWidth);
      const stageHeight = stage.offsetHeight;
      const stickyTop = Number.parseFloat(window.getComputedStyle(stage).top) || 0;
      section.style.height = `${stageHeight + travel + stickyTop}px`;

      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      const scrollRange = travel + stickyTop;
      const progress = travel === 0 ? 0 : Math.min(1, Math.max(0, (window.scrollY - sectionTop + stickyTop) / scrollRange));
      track.style.transform = `translate3d(${-travel * progress}px, 0, 0)`;

      const trackLeft = track.getBoundingClientRect().left;
      const viewportCenter = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
      cards.forEach((card) => {
        const cardCenter = trackLeft + card.offsetLeft + card.offsetWidth / 2;
        const distance = (cardCenter - viewportCenter) / (viewport.clientWidth / 2);
        const limitedDistance = Math.min(1.2, Math.max(-1.2, distance));
        const sideDistance = Math.min(1, Math.abs(distance));
        card.style.setProperty("--card-tilt", `${-limitedDistance * 25}deg`);
        card.style.setProperty("--card-scale", `${1 - sideDistance * 0.12}`);
        card.style.setProperty("--card-opacity", `${1 - sideDistance * 0.24}`);
      });
    };

    const scheduleUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(updateRail);
    };

    updateRail();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    swipeLayout.addEventListener("change", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      swipeLayout.removeEventListener("change", scheduleUpdate);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="features-section" id="features" ref={sectionRef}>
      <div className="feature-stage" ref={stageRef}>
        <div className="section-heading">
          <span className="section-kicker">Made for your everyday flow</span>
          <h2>Less switching.<br /><em>More doing.</em></h2>
          <p>The useful parts of a workday, together in one personal workspace.</p>
        </div>
        <div className="feature-rail-viewport" ref={viewportRef} role="region" tabIndex={0} aria-label="Kazedesk features">
          <div className="feature-grid" ref={trackRef}>
            {FEATURES.map(([Icon, number, title, description, featureImage]) => (
              <article className="feature-card" key={number}>
                <div className="feature-card-top"><span className="feature-icon"><Icon size={20} /></span><span>{number}</span></div>
                <div className="feature-card-visual" aria-hidden="true"><img src={featureImage} alt="" /></div>
                <div className="feature-card-copy">
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function OpenSourceSection() {
  const repositoryAvailable = Boolean(LANDING_LINKS.github);

  return (
    <section className="opensource-section" id="open-source">
      <div className="opensource-inner">
        <div className="opensource-mark"><Code2 size={22} /></div>
        <span className="section-kicker">{repositoryAvailable ? "Open source" : "Open-source project in progress"}</span>
        <h2>Free to use.<br /><em>Made to stay open.</em></h2>
        <p>{repositoryAvailable
          ? "No premium tier and no ads. Explore the source, follow development, or contribute on GitHub."
          : "No premium tier and no ads. The public repository and contributor information will appear here when available."}</p>
        <div className="opensource-facts">
          <div><span>PRICE</span><strong>Free to use</strong></div>
          <div><span>REPOSITORY</span><strong>{repositoryAvailable ? "Available" : "Coming soon"}</strong></div>
          <div><span>LICENSE</span><strong>MIT License</strong></div>
        </div>
        <div className="opensource-actions">
          {repositoryAvailable
            ? <a className="button-light" href={LANDING_LINKS.github} target="_blank" rel="noreferrer"><GithubIcon size={16} /> GitHub repository</a>
            : <span className="button-light" aria-disabled="true" title="Add repository URL in landingLinks.js"><GithubIcon size={16} /> GitHub repository coming soon</span>}
        </div>
        <div className="opensource-note"><Users size={15} />{repositoryAvailable ? " Contributions are welcome." : " Contributor information will appear with the repository."}</div>
      </div>
    </section>
  );
}

export function FAQSection() {
  return (
    <section className="faq-section" id="faq">
      <div className="faq-inner">
        <div className="faq-heading"><span className="section-kicker">The practical details</span><h2>Before you<br /><em>get started.</em></h2></div>
        <div className="faq-list">
          {FAQS.map(([question, answer], index) => (
            <details className="faq-item" key={question} open={index === 0}>
              <summary>{question}<span aria-hidden="true">+</span></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
