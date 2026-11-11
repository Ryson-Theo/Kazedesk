import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import GithubIcon from "./GithubIcon";
import { LANDING_LINKS } from "./landingLinks";

const getTrailerSource = () => import.meta.env.VITE_PRODUCT_TRAILER_URL?.trim() || "";
const RELEASES_URL = `${LANDING_LINKS.github.replace(
  "https://github.com/",
  "https://api.github.com/repos/"
)}/releases?per_page=3`;
const FALLBACK_RELEASE = {
  name: "Kazedesk v0.2.0",
  tag_name: "v0.2.0",
  html_url: `${LANDING_LINKS.github}/releases/tag/v0.2.0`,
  published_at: "2026-11-07T04:28:37Z",
  body: `Kazedesk keeps its calm, customizable workspace and adds a richer, more flexible Note Wall, along with improvements across the dashboard and mobile experience.

## What’s new
- Create independent Note Wall boards for separate projects and ideas
- Add and arrange image, PDF, and audio files on your wall
- Record voice notes, rename attachments, and use the web clipper to save links
- Connect related notes and files, with improved connection controls for mobile and touch devices`,
};

const STEPS = [
  {
    title: "Open your workspace",
    description: "Start in your browser. No account or setup required.",
  },
  {
    title: "Find your flow",
    description: "Keep your focus timer, tasks, and notes together for the day.",
  },
  {
    title: "Make it yours",
    description: "Choose your backdrop; your workspace stays saved on your device.",
  },
];

function getReleaseSummary(body) {
  const summary = body?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !/^#{1,6}\s/.test(line) && !/^[-*+]\s|^\d+\.\s/.test(line)) || "";
  const text = summary
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*`_~]/g, "")
    .trim();

  if (!text) return "See what’s new in this release.";
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text;
}

function getReleaseHighlights(body) {
  const lines = body?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) || [];
  const bullets = lines
    .filter((line) => /^[-*+]\s|^\d+\.\s/.test(line))
    .map((line) => line.replace(/^([-*+]|\d+\.)\s+/, ""));
  const highlights = bullets.length
    ? bullets
    : lines.filter((line) => !/^#{1,6}\s/.test(line) && !/^[-*+]\s|^\d+\.\s/.test(line));

  return highlights
    .map((line) => line
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*`_~]/g, "")
      .trim())
    .filter(Boolean)
    .slice(0, 4);
}

function formatReleaseDate(publishedAt) {
  if (!publishedAt) return "Release date unavailable";

  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return "Release date unavailable";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getYouTubeEmbedUrl(source) {
  if (!source) return null;

  try {
    const url = new URL(source);
    const host = url.hostname.replace(/^www\./, "");
    if (!["youtube.com", "m.youtube.com", "youtube-nocookie.com", "youtu.be"].includes(host)) return null;

    const videoId = host === "youtu.be"
      ? url.pathname.slice(1)
      : url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];

    if (!videoId || !/^[\w-]{11}$/.test(videoId)) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}?controls=1&rel=0&playsinline=1`;
  } catch {
    return null;
  }
}

function formatPlaybackTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function ReleaseNotesCard() {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
        if (response.status === 204) return [];
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error("GitHub returned an invalid release list");
        setReleases(data.filter((release) => (
          release
          && typeof release.html_url === "string"
          && release.html_url.startsWith(`${LANDING_LINKS.github}/releases/`)
          && typeof (release.name || release.tag_name) === "string"
        ))
          .sort((a, b) => Date.parse(b.published_at || "") - Date.parse(a.published_at || ""))
          .slice(0, 1));
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setReleases([FALLBACK_RELEASE]);
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const latestRelease = releases[0];
  const highlights = latestRelease ? getReleaseHighlights(latestRelease.body) : [];

  return (
    <div className="release-notes-flow">
      <aside className="release-notes-card" aria-labelledby="release-notes-title">
        <div className="release-notes-header">
          <span className="release-notes-mark"><GithubIcon size={18} /></span>
          <div>
            <span className="release-notes-kicker">Straight from GitHub</span>
            <h3 id="release-notes-title">Latest release</h3>
          </div>
          <a
            className="release-notes-all"
            href={`${LANDING_LINKS.github}/releases`}
            target="_blank"
            rel="noreferrer"
            aria-label="View all GitHub releases"
            title="View all releases"
          >
            <ArrowUpRight size={17} />
          </a>
        </div>

        <div className="release-notes-content" aria-live="polite">
          {loading && <p className="release-notes-message" role="status">Loading the latest release…</p>}
          {loadFailed && latestRelease && (
            <p className="release-notes-message" role="status">
              Showing the latest release available here. Check <a href={`${LANDING_LINKS.github}/releases`} target="_blank" rel="noreferrer">GitHub</a> for newer notes.
            </p>
          )}
          {!loading && !loadFailed && releases.length === 0 && (
            <p className="release-notes-message">No releases yet. Check back when the next update ships.</p>
          )}
          {!loading && latestRelease && (
            <article className="release-note-entry">
              <span className="release-note-meta">
                <span>{latestRelease.tag_name || "Release"}</span>
                <time dateTime={latestRelease.published_at || undefined}>
                  {formatReleaseDate(latestRelease.published_at)}
                </time>
              </span>
              <strong className="release-note-title">{latestRelease.name || latestRelease.tag_name}</strong>
              <p className="release-note-summary">{getReleaseSummary(latestRelease.body)}</p>
              {highlights.length > 0 && (
                <ul className="release-note-highlights">
                  {highlights.map((highlight, index) => (
                    <li key={`${index}-${highlight}`}>{highlight}</li>
                  ))}
                </ul>
              )}
              <span className="release-note-read">
                <a href={latestRelease.html_url} target="_blank" rel="noreferrer">
                  Read full release notes <ArrowRight size={14} />
                </a>
              </span>
            </article>
          )}
        </div>
      </aside>
    </div>
  );
}

function ProductTrailer() {
  const videoRef = useRef(null);
  const closeZoomRef = useRef(null);
  const trailerSource = getTrailerSource();
  const youtubeUrl = getYouTubeEmbedUrl(trailerSource);
  const hasDirectVideo = Boolean(trailerSource) && !youtubeUrl;
  const hasTrailer = Boolean(trailerSource);
  const [zoomed, setZoomed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackError, setPlaybackError] = useState("");

  useEffect(() => {
    if (!zoomed) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setZoomed(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    closeZoomRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, [zoomed]);

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    setPlaybackError("");

    try {
      if (video.paused) await video.play();
      else video.pause();
    } catch {
      setPlaybackError("The trailer could not be played. Check that the video link is public and valid.");
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const seek = (event) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Number(event.target.value);
    setCurrentTime(video.currentTime);
  };

  return (
    <>
      {zoomed && (
        <button
          type="button"
          className="product-trailer-backdrop"
          onClick={() => setZoomed(false)}
          aria-label="Close expanded trailer"
          tabIndex={-1}
        />
      )}
      <div
        className={`product-trailer${zoomed ? " is-zoomed" : ""}`}
        role={zoomed ? "dialog" : undefined}
        aria-modal={zoomed ? "true" : undefined}
        aria-label={zoomed ? "Expanded Kazedesk product trailer" : "Kazedesk product trailer"}
      >
        {hasTrailer ? (
          youtubeUrl ? (
            <iframe
              className="product-trailer-embed"
              src={youtubeUrl}
              title="Kazedesk product trailer"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : (
            <video
              ref={videoRef}
              playsInline
              preload="metadata"
              aria-label="Kazedesk product trailer"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
              onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
              onError={() => setPlaybackError("The trailer could not be loaded. Check that the video link is public and valid.")}
            >
              <source src={trailerSource} />
              Your browser does not support embedded video.
            </video>
          )
        ) : (
          <div className="product-trailer-placeholder">
            <span className="product-trailer-orbit" aria-hidden="true" />
            <span className="product-trailer-play" aria-hidden="true"><Play size={22} fill="currentColor" /></span>
            <span className="product-trailer-label">The Kazedesk trailer</span>
          </div>
        )}
        <div className={`product-trailer-controls${hasDirectVideo ? "" : " is-compact"}`}>
          {hasDirectVideo && (
            <>
              <button type="button" className="trailer-control-button" onClick={togglePlayback} aria-label={playing ? "Pause trailer" : "Play trailer"}>
                {playing ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
              </button>
              <span className="trailer-time">{formatPlaybackTime(currentTime)}</span>
              <input
                className="trailer-seek"
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={Math.min(currentTime, duration || 0)}
                onChange={seek}
                disabled={!duration}
                aria-label="Seek trailer"
              />
              <span className="trailer-time">{formatPlaybackTime(duration)}</span>
              <button type="button" className="trailer-control-button" onClick={toggleMute} aria-label={muted ? "Unmute trailer" : "Mute trailer"}>
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
            </>
          )}
          {youtubeUrl && <span className="trailer-controls-label">YouTube player</span>}
          <button
            ref={closeZoomRef}
            type="button"
            className="trailer-control-button trailer-zoom-button"
            onClick={() => setZoomed((value) => !value)}
            aria-label={zoomed ? "Close expanded trailer" : "Expand trailer"}
          >
            {zoomed ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
        {playbackError && <p className="product-trailer-error" role="alert">{playbackError}</p>}
      </div>
    </>
  );
}

export default function HowItWorksSection() {
  return (
    <section className="how-it-works-section" id="how-it-works">
      <div className="how-it-works-inner">
        <div className="how-it-works-main">
          <div className="how-it-works-copy">
            <div className="how-it-works-heading">
              <span className="section-kicker">A little clarity, right away</span>
              <h2>One space.<br /><em>Your kind of flow.</em></h2>
              <p>Bring the small things that make up your day into one calm, personal workspace.</p>
            </div>

            <div className="how-it-works-content">
              <ol className="how-it-works-steps">
                {STEPS.map((step, index) => (
                  <li key={step.title}>
                    <span className="how-it-works-number">0{index + 1}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <a className="how-it-works-cta" href="/dashboard">
                Open your workspace <ArrowRight size={16} />
              </a>
            </div>
          </div>

          <ProductTrailer />
        </div>

        <ReleaseNotesCard />
      </div>
    </section>
  );
}
