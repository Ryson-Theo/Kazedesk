import { useEffect, useRef, useState } from "react";
import { Code2, Users } from "lucide-react";
import { gsap } from "gsap";
import { LANDING_LINKS } from "./landingLinks";
import GithubIcon from "./GithubIcon";
import Folder from "./Folder";
import TextLoop from "./TextLoop";

const FOLDER_FEATURES = [
  {
    title: "Focus timer",
    description: "Set a focus rhythm and make space for the work in front of you.",
    checklist: ["Focus sessions", "Timed breaks", "Session history"],
  },
  {
    title: "Tasks & reminders",
    description: "Keep priorities and the next small steps close at hand.",
    checklist: ["Priority lists", "Due dates", "Reminders"],
  },
  {
    title: "Notes & NoteMap",
    description: "Capture quick thoughts or connect ideas into a visual map.",
    checklist: ["Quick notes", "Linked ideas", "Visual maps"],
  },
  {
    title: "Private by design",
    description: "Your tasks, notes, and history stay saved in this browser.",
    checklist: ["Saved in browser", "No account needed", "Your data stays yours"],
  },
];

const FAQS = [
  ["Is Kazedesk free?", "Yes. Kazedesk is free to use with no paid tier or ads."],
  ["Do I need an account?", "No. Open the dashboard and start using it without signing up."],
  ["Where is my data stored?", "Your settings, tasks, notes, and analytics are kept in this browser's local storage."],
  ["Can I self-host it?", "Yes. Kazedesk is a client-side React app. The source is available on GitHub, and you can build and host the static site yourself."],
  ["Does it work offline?", "The app shell and locally saved information are available after loading. Weather updates and YouTube playback require internet access."],
];

export function FeatureGrid({ theme = "dark" }) {
  const [hasOpenedFolder, setHasOpenedFolder] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return undefined;

    const animateFeatures = () => {
      gsap.fromTo(
        [section.querySelector(".features-heading"), section.querySelector(".features-experience")],
        { autoAlpha: 0, y: 30 },
        { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.18 }
      );
    };

    if (!window.IntersectionObserver) {
      animateFeatures();
      return () => gsap.killTweensOf(section.querySelectorAll(".features-heading, .features-experience"));
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      animateFeatures();
      observer.disconnect();
    }, { threshold: 0.2 });

    observer.observe(section);
    return () => {
      observer.disconnect();
      gsap.killTweensOf(section.querySelectorAll(".features-heading, .features-experience"));
    };
  }, []);

  return (
    <section className="features-section" id="features" ref={sectionRef}>
      <TextLoop
        className="features-ribbon"
        text="FOCUS   ✦  PLAN  ✦  CAPTURE  ✦ ORGANIZE"
        path="M 1360 -80 C 1290 -25 1260 50 1190 48 C 1120 46 1110 -25 1045 -5 C 975 18 1045 103 980 112 C 900 121 850 60 770 95 C 710 121 715 180 750 220 C 785 260 785 300 760 340 C 735 380 735 420 760 460 C 785 500 820 525 890 535 C 960 545 1070 485 1140 505 C 1210 525 1250 600 1320 625 C 1370 643 1380 710 1430 775"
        speed={90}
        direction="forward"
        separator=""
        curviness={90}
        tilt={0}
        fontSize={18}
        fontWeight={800}
        letterSpacing={1}
        uppercase
        ribbon
        ribbonColor="#95c482"
        ribbonWidth={26}
        edgeFade={0}
        cross={false}
        crossAngle={16}
        draggable
        scrollBoost={0}
        outline={false}
        pauseOnHover={false}
      />
      <div className="features-inner">
        <div className="features-heading">
          <span className="section-kicker">Made for your everyday flow</span>
          <h2>Less switching.<br /><em>More doing.</em></h2>
          <p className="features-description">
            Everything you need to think clearly, stay in control, and move your day forward with purpose. From focused work and thoughtful planning to capturing ideas, managing priorities, and building better daily routines, Kazedesk brings every part of your workflow together in one beautifully connected space. Designed to simplify the way you work, create room for deeper focus, and make everyday productivity feel effortless.
          </p>
        </div>
        <div className="features-experience">
          <div
            className={`features-folder${hasOpenedFolder ? " is-straight" : ""}`}
            aria-label="Explore the tools inside Kazedesk"
            onClickCapture={() => setHasOpenedFolder(true)}
          >
            <Folder
              mode="book"
              variant="glass"
              color="#b6d3ac"
              paperColor="#fffdf7"
              label="Kazedesk"
              items={FOLDER_FEATURES}
              theme={theme}
              defaultOpen
              onOpenChange={() => setHasOpenedFolder(true)}
              draggable={false}
              size={1.2}
            />
          </div>
          {!hasOpenedFolder && (
            <p className="features-folder-hint">Click the folder to open or close it</p>
          )}
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
