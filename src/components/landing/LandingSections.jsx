import { useEffect, useRef, useState } from "react";
import { ArrowRight, BarChart3, CheckCircle2, CloudSun, Code2, Image, LockKeyhole, Music2, Network, StickyNote, Timer, Users } from "lucide-react";
import { Link } from "react-router-dom";
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

const FEATURE_SHOWCASES = [
  {
    version: "v1.0.0",
    status: "Available now",
    icon: StickyNote,
    title: "NoteMap",
    description: "Turn a page of notes into a visual map. Arrange ideas freely, connect related thoughts, and keep your whole project in view.",
    href: "/wall",
  },
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

export function FeatureShowcaseSection() {
  return (
    <section className="feature-showcase-section" id="whats-new">
      <div className="feature-showcase-inner">
        <div className="feature-showcase-heading">
          <span className="section-kicker">A workspace that keeps growing</span>
          <h2>What’s new<br /><em>in Kazedesk?</em></h2>
          <p>New ideas and improvements, collected in one place.</p>
        </div>
        <div className="feature-showcase-grid">
          {FEATURE_SHOWCASES.map(({ version, status, icon: Icon, title, description, href }) => (
            <article className="feature-showcase-card" key={title}>
              <div className="feature-showcase-copy">
                <div className="feature-showcase-meta">
                  <span className="feature-showcase-version">{version}</span>
                  <span className="feature-showcase-status">{status}</span>
                </div>
                <h3><Icon size={21} />{title}</h3>
                <p>{description}</p>
                <Link className="feature-showcase-link" to={href}>Explore NoteMap <ArrowRight size={15} /></Link>
              </div>
              <div className="note-map-preview" aria-hidden="true">
                <span className="note-map-preview-kicker"><Network size={12} /> CONNECTED NOTES</span>
                <div className="note-map-canvas">
                  <span className="note-map-connector note-map-connector-one" />
                  <span className="note-map-connector note-map-connector-two" />
                  <span className="note-map-node note-map-node-one">Ideas</span>
                  <span className="note-map-node note-map-node-two">Research</span>
                  <span className="note-map-node note-map-node-three">Next steps</span>
                </div>
                <span className="note-map-preview-footer">A clearer view of your thinking</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContributorCard({ contributor, decorative = false }) {
  return (
    <a
      className="contributor-card"
      href={contributor.html_url}
      target="_blank"
      rel="noreferrer"
      aria-label={`GitHub profile ${contributor.login}, ${contributor.contributions} contributions`}
      tabIndex={decorative ? -1 : undefined}
    >
      <img src={contributor.avatar_url} alt="" loading="lazy" />
      <span className="contributor-card-copy">
        <strong>{contributor.login}</strong>
        <small>{contributor.contributions} contributions</small>
      </span>
      <GithubIcon size={15} />
    </a>
  );
}

function ContributorMarquee() {
  const [contributors, setContributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const apiUrl = LANDING_LINKS.github.replace(
      "https://github.com/",
      "https://api.github.com/repos/"
    );

    fetch(`${apiUrl}/contributors?per_page=30`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      if (response.status === 204) return [];
      return response.json();
    })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error("GitHub returned an invalid contributor list");
        setContributors(data.filter((contributor) => (
          contributor.type === "User"
          && contributor.login
          && contributor.html_url
          && contributor.avatar_url
          && Number.isFinite(contributor.contributions)
          && contributor.contributions > 0
        )));
      })
      .catch((error) => {
        if (error.name !== "AbortError") setLoadFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="contributors-section" aria-label="GitHub contributors">
      <div className="contributors-heading">
        <h3>Built together</h3>
        <p>Profiles appear here when contributions reach the main branch.</p>
      </div>
      {loading && <p className="contributors-message" role="status">Loading contributor profiles…</p>}
      {loadFailed && (
        <p className="contributors-message" role="alert">
          Contributor profiles are temporarily unavailable. Visit the <a href={LANDING_LINKS.github} target="_blank" rel="noreferrer">GitHub repository</a>.
        </p>
      )}
      {!loading && !loadFailed && contributors.length === 0 && (
        <p className="contributors-message">No merged contributions are listed yet. Be the first to contribute.</p>
      )}
      {!loading && !loadFailed && contributors.length > 0 && (
        <div className="contributors-marquee" aria-label="Contributor profiles">
          <div className="contributors-marquee-track">
            <div className="contributors-marquee-group">
              {contributors.map((contributor) => <ContributorCard contributor={contributor} key={contributor.login} />)}
            </div>
            <div className="contributors-marquee-group" aria-hidden="true">
              {contributors.map((contributor) => <ContributorCard contributor={contributor} decorative key={contributor.login} />)}
            </div>
          </div>
        </div>
      )}
    </div>
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
      {repositoryAvailable && <ContributorMarquee />}
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
