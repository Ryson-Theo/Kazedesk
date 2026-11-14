import { useEffect, useRef, useState } from "react";
import flappingBird from "../../assets/pipbird/Cute Chick Wing-Flapping Animation.gif";
import settlingBird from "../../assets/pipbird/Chibi Bird Sticker Animation Frames.gif";
import annoyedBird from "../../assets/pipbird/Chibi Finch Settles Into Annoyance.gif";
import taskCelebrationBird from "../../assets/pipbird/Chibi Bird Task Celebration Animation.gif";
import christmasSleighBird from "../../assets/pipbird/Chibi Christmas Sleigh Ride Animation.gif";
import spyGunbarrelBird from "../../assets/pipbird/Chibi Spy Bird_ 007 Gun Barrel Animation.gif";
import christmasCelebrationBird from "../../assets/pipbird/Kawaii Christmas Bird Celebration Frames.gif";
import stretchReminderBird from "../../assets/pipbird/Kawaii Bird Stretch Reminder Animation.gif";
import spySequenceBird from "../../assets/pipbird/Mint Bird_ 007 Spy Sequence.gif";
import waterReminderBird from "../../assets/pipbird/Cute Bird Water Reminder Animation.gif";

const BIRD_WIDTH = 114;
const BIRD_HEIGHT = 76;
const HOME_SCALE = 0.42;
const FOOT_INSET = 7;
const LANDING_DELAY = 650;
const CONTENT_HOVER_DELAY = 2000;
const DEPARTURE_DELAY = 7000;
const ANNOYANCE_DURATION = 1400;
const CLICK_ANIMATION_DURATION = 3200;
const CLICK_ANIMATIONS = [
  taskCelebrationBird,
  christmasSleighBird,
  spyGunbarrelBird,
  christmasCelebrationBird,
  stretchReminderBird,
  spySequenceBird,
  waterReminderBird,
];
const BLOCKER_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "a",
  "button:not(.landing-pip-follower)",
  "input",
  "textarea",
  "select",
  "summary",
  "[role='button']:not(.landing-pip-follower)",
  ".folder-doc",
  ".gif-drop-demo",
  ".product-trailer",
  ".release-notes-flow",
  ".contributors-marquee",
];
const PERCH_SELECTOR = [
  ".landing-header",
  ".hero-title",
  ".hero-summary",
  ".features-heading h2",
  ".features-folder .folder-root",
  ".gif-drop-demo",
  ".gif-drop-copy h2",
  ".how-it-works-heading h2",
  ".product-trailer",
  ".release-notes-flow",
  ".opensource-inner h2",
  ".opensource-actions",
  ".faq-heading h2",
  ".faq-list",
  ".footer-image-brand",
];

function isInside(point, rect) {
  return point.x >= rect.left && point.x <= rect.right
    && point.y >= rect.top && point.y <= rect.bottom;
}

function isClearPosition(x, y, entries, ignoredElement = null) {
  const birdRect = {
    left: x,
    top: y,
    right: x + BIRD_WIDTH,
    bottom: y + BIRD_HEIGHT,
  };

  return !entries.some(({ element, rect }) => (
    element !== ignoredElement
    && birdRect.left < rect.right + 8
    && birdRect.right > rect.left - 8
    && birdRect.top < rect.bottom + 8
    && birdRect.bottom > rect.top - 8
  ));
}

function getBlockerEntries(page) {
  return Array.from(page.querySelectorAll(BLOCKER_SELECTOR.join(",")))
    .flatMap((element) => {
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return [];

      let rects = [element.getBoundingClientRect()];
      if (element.matches("h1, h2, h3, h4, p, summary")) {
        const range = document.createRange();
        range.selectNodeContents(element);
        if (typeof range.getClientRects === "function") {
          const textRects = Array.from(range.getClientRects());
          if (textRects.length) rects = textRects;
        }
      }

      return rects
        .filter((rect) => rect.width > 0
          && rect.height > 0
          && rect.bottom > 0
          && rect.top < window.innerHeight
          && rect.right > 0
          && rect.left < window.innerWidth)
        .map((rect) => ({ element, rect }));
    });
}

function makeCandidate(x, y, direction = 1) {
  return {
    x: Math.max(4, Math.min(window.innerWidth - BIRD_WIDTH - 4, x)),
    y: Math.max(4, Math.min(window.innerHeight - BIRD_HEIGHT - 4, y)),
    direction,
  };
}

function getElementBounds(element, entries) {
  const rects = entries
    .filter(({ element: entryElement }) => entryElement === element)
    .map(({ rect }) => rect);
  if (!rects.length) return element.getBoundingClientRect();

  const bounds = rects.reduce((current, rect) => ({
    left: Math.min(current.left, rect.left),
    top: Math.min(current.top, rect.top),
    right: Math.max(current.right, rect.right),
    bottom: Math.max(current.bottom, rect.bottom),
  }), {
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity,
  });
  return {
    ...bounds,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

function getCursorCandidates(point, entries) {
  const candidates = [
    makeCandidate(point.x + 26, point.y - BIRD_HEIGHT + 10, 1),
    makeCandidate(point.x - BIRD_WIDTH - 26, point.y - BIRD_HEIGHT + 10, -1),
    makeCandidate(point.x + 28, point.y + 24, 1),
    makeCandidate(point.x - BIRD_WIDTH - 28, point.y + 24, -1),
    makeCandidate(point.x + 42, point.y - BIRD_HEIGHT - 34, 1),
    makeCandidate(point.x - BIRD_WIDTH - 42, point.y - BIRD_HEIGHT - 34, -1),
    makeCandidate(12, point.y - BIRD_HEIGHT / 2, 1),
    makeCandidate(window.innerWidth - BIRD_WIDTH - 12, point.y - BIRD_HEIGHT / 2, -1),
    makeCandidate(12, 12),
    makeCandidate(window.innerWidth - BIRD_WIDTH - 12, 12, -1),
    makeCandidate(12, window.innerHeight - BIRD_HEIGHT - 12),
    makeCandidate(window.innerWidth - BIRD_WIDTH - 12, window.innerHeight - BIRD_HEIGHT - 12, -1),
  ];
  const hoveredElement = document.elementFromPoint?.(point.x, point.y);
  const hoveredContent = hoveredElement?.closest(BLOCKER_SELECTOR.join(","));
  if (hoveredContent) {
    const rect = getElementBounds(hoveredContent, entries);
    const perchY = rect.top - BIRD_HEIGHT - 10;
    candidates.push(
      makeCandidate(rect.left + 12, perchY),
      makeCandidate(rect.right - BIRD_WIDTH - 12, perchY, -1),
      makeCandidate(rect.left + (rect.width - BIRD_WIDTH) / 2, perchY),
      makeCandidate(rect.left - BIRD_WIDTH - 10, rect.top + (rect.height - BIRD_HEIGHT) / 2, -1),
      makeCandidate(rect.right + 10, rect.top + (rect.height - BIRD_HEIGHT) / 2),
    );
  }
  return candidates;
}

function findCursorPosition(point, entries) {
  return getCursorCandidates(point, entries)
    .filter(({ x, y }) => isClearPosition(x, y, entries))
    .sort((a, b) => (
      Math.hypot(a.x + BIRD_WIDTH / 2 - point.x, a.y + BIRD_HEIGHT / 2 - point.y)
      - Math.hypot(b.x + BIRD_WIDTH / 2 - point.x, b.y + BIRD_HEIGHT / 2 - point.y)
    ))[0] || null;
}

function getLandingDelay(point) {
  const target = document.elementFromPoint?.(point.x, point.y);
  return target?.closest(BLOCKER_SELECTOR.join(","))
    ? CONTENT_HOVER_DELAY
    : LANDING_DELAY;
}

function overlaps(a, b) {
  return a.left <= b.right && a.right >= b.left
    && a.top <= b.bottom && a.bottom >= b.top;
}

function getPerchCandidates(page, point, entries) {
  return Array.from(page.querySelectorAll(PERCH_SELECTOR.join(",")))
    .flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < BIRD_WIDTH || rect.height < 8
        || rect.bottom < 0 || rect.top > window.innerHeight
        || rect.right < 0 || rect.left > window.innerWidth
        || window.getComputedStyle(element).visibility === "hidden") return [];

      const perchSurface = getElementBounds(element, entries);
      const y = perchSurface.top - BIRD_HEIGHT + FOOT_INSET;
      const positions = [0, 0.5, 1].map((fraction) => (
        makeCandidate(
          perchSurface.left + (perchSurface.width - BIRD_WIDTH) * fraction,
          y,
        )
      ));

      return positions
        .filter(({ x, y: candidateY }) => isClearPosition(x, candidateY, entries, element))
        .map((candidate) => ({
          ...candidate,
          surface: element,
          approachX: candidate.x,
          approachY: candidate.y - 27,
          distance: Math.hypot(
            candidate.x + BIRD_WIDTH / 2 - point.x,
            candidate.y + BIRD_HEIGHT / 2 - point.y,
          ),
        }));
    })
    .sort((a, b) => a.distance - b.distance);
}

function segmentIntersectsRect(start, end, rect) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let low = 0;
  let high = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [
    start.x - rect.left,
    rect.right - start.x,
    start.y - rect.top,
    rect.bottom - start.y,
  ];

  for (let index = 0; index < p.length; index += 1) {
    if (p[index] === 0) {
      if (q[index] < 0) return false;
      continue;
    }

    const ratio = q[index] / p[index];
    if (p[index] < 0) low = Math.max(low, ratio);
    else high = Math.min(high, ratio);
    if (low > high) return false;
  }

  return true;
}

function mergeObstacles(rects) {
  const merged = [];
  rects.sort((a, b) => a.top - b.top || a.left - b.left).forEach((rect) => {
    let next = { ...rect };
    let mergeIndex = merged.findIndex((other) => {
      if (!overlaps(next, other)) return false;
      const bounds = {
        left: Math.min(next.left, other.left),
        top: Math.min(next.top, other.top),
        right: Math.max(next.right, other.right),
        bottom: Math.max(next.bottom, other.bottom),
      };
      const boundsArea = (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
      const separateArea = (next.right - next.left) * (next.bottom - next.top)
        + (other.right - other.left) * (other.bottom - other.top);
      return boundsArea <= separateArea;
    });
    while (mergeIndex !== -1) {
      const other = merged.splice(mergeIndex, 1)[0];
      next = {
        left: Math.min(next.left, other.left),
        top: Math.min(next.top, other.top),
        right: Math.max(next.right, other.right),
        bottom: Math.max(next.bottom, other.bottom),
      };
      mergeIndex = merged.findIndex((candidate) => overlaps(next, candidate));
    }
    merged.push(next);
  });
  return merged;
}

function getObstacles(entries, ignoredElement = null) {
  return mergeObstacles(entries
    .filter(({ element }) => element !== ignoredElement)
    .map(({ rect }) => ({
      left: rect.left - BIRD_WIDTH - 6,
      top: rect.top - BIRD_HEIGHT - 6,
      right: rect.right + 6,
      bottom: rect.bottom + 6,
    })));
}

function isPathClear(start, end, obstacles, allowExit = false) {
  return !obstacles.some((rect) => (
    !(allowExit && isInside(start, rect))
    && segmentIntersectsRect(start, end, rect)
  ));
}

function planPath(start, goal, entries, ignoredElement = null) {
  const obstacles = getObstacles(entries, ignoredElement);
  if (isPathClear(start, goal, obstacles, true)) return [goal];

  const corridor = {
    left: Math.min(start.x, goal.x) - BIRD_WIDTH,
    right: Math.max(start.x, goal.x) + BIRD_WIDTH,
    top: Math.min(start.y, goal.y) - BIRD_HEIGHT,
    bottom: Math.max(start.y, goal.y) + BIRD_HEIGHT,
  };
  const nearbyObstacles = obstacles.filter((rect) => overlaps(rect, corridor));
  const nodes = [start, goal];

  nearbyObstacles.forEach((rect) => {
    [
      { x: rect.left - 2, y: rect.top - 2 },
      { x: rect.right + 2, y: rect.top - 2 },
      { x: rect.right + 2, y: rect.bottom + 2 },
      { x: rect.left - 2, y: rect.bottom + 2 },
    ].forEach((point) => {
      if (point.x < -BIRD_WIDTH - 16 || point.x > window.innerWidth + 16
        || point.y < -BIRD_HEIGHT - 16 || point.y > window.innerHeight + 16
        || obstacles.some((obstacle) => isInside(point, obstacle))) return;
      if (!nodes.some((node) => Math.hypot(node.x - point.x, node.y - point.y) < 1)) {
        nodes.push(point);
      }
    });
  });

  const distances = nodes.map(() => Infinity);
  const previous = nodes.map(() => -1);
  const visited = nodes.map(() => false);
  distances[0] = 0;

  for (let step = 0; step < nodes.length; step += 1) {
    let current = -1;
    for (let index = 0; index < nodes.length; index += 1) {
      if (!visited[index] && (current === -1 || distances[index] < distances[current])) {
        current = index;
      }
    }
    if (current === -1 || !Number.isFinite(distances[current])) break;
    if (current === 1) break;
    visited[current] = true;

    for (let next = 1; next < nodes.length; next += 1) {
      if (visited[next] || !isPathClear(nodes[current], nodes[next], obstacles, current === 0)) continue;
      const distance = distances[current] + Math.hypot(
        nodes[next].x - nodes[current].x,
        nodes[next].y - nodes[current].y,
      );
      if (distance < distances[next]) {
        distances[next] = distance;
        previous[next] = current;
      }
    }
  }

  if (!Number.isFinite(distances[1])) return [goal];
  const path = [];
  for (let index = 1; index !== 0; index = previous[index]) {
    if (index < 0) return [goal];
    path.unshift(nodes[index]);
  }
  return path;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function LandingPip() {
  const birdRef = useRef(null);
  const clickAnimationTimerRef = useRef(null);
  const clickAnimationIdRef = useRef(0);
  const [phase, setPhase] = useState("offscreen");
  const [active, setActive] = useState(false);
  const [clickAnimation, setClickAnimation] = useState(null);

  const playRandomClickAnimation = () => {
    const index = Math.floor(Math.random() * CLICK_ANIMATIONS.length);
    setClickAnimation({
      id: ++clickAnimationIdRef.current,
      source: CLICK_ANIMATIONS[index],
    });
    window.clearTimeout(clickAnimationTimerRef.current);
    clickAnimationTimerRef.current = window.setTimeout(
      () => setClickAnimation(null),
      CLICK_ANIMATION_DURATION,
    );
  };

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
      || window.matchMedia?.("(pointer: coarse)")?.matches) return undefined;

    const page = birdRef.current?.closest(".landing-page");
    const bird = birdRef.current;
    if (!page || !bird) return undefined;

    const now = performance.now();
    const motion = {
      x: -BIRD_WIDTH - 12,
      y: Math.max(8, window.innerHeight * 0.62),
      scale: 1,
      vx: 0,
      vy: 0,
      goalX: -BIRD_WIDTH - 12,
      goalY: Math.max(8, window.innerHeight * 0.62),
      path: [],
      obstacles: [],
      landing: null,
      dropping: false,
      phase: "offscreen",
      lastFrame: now,
      lastPlan: 0,
      direction: 1,
      hasEntered: false,
    };

    let frame = null;
    let landingTimer;
    let departureTimer;
    let annoyanceTimer;
    let lastPointer = null;
    const homeMark = page.querySelector(".landing-brand-mark");

    const getHomePosition = () => {
      const rect = homeMark?.getBoundingClientRect();
      const centerX = rect ? rect.left + rect.width / 2 : 12 + BIRD_WIDTH * HOME_SCALE / 2;
      const centerY = rect ? rect.top + rect.height / 2 : 12 + BIRD_HEIGHT * HOME_SCALE / 2;
      return {
        x: centerX - BIRD_WIDTH / 2,
        y: centerY - BIRD_HEIGHT / 2,
      };
    };

    const setFollowerActive = (value) => {
      setActive(value);
      homeMark?.classList.toggle("is-pip-flying", value);
    };

    const renderTransform = () => {
      const rotation = motion.phase === "perched"
        ? 0
        : clamp(motion.vy * 0.009, -10, 10);
      bird.style.transform = `translate3d(${motion.x}px, ${motion.y}px, 0) rotate(${rotation}deg) scale(${motion.scale}) scaleX(${motion.direction})`;
    };

    const requestFrame = () => {
      if (frame === null) {
        motion.lastFrame = performance.now();
        frame = window.requestAnimationFrame(animate);
      }
    };

    const setRoute = (goal, entries, ignoredElement = null) => {
      const start = { x: motion.x, y: motion.y };
      motion.goalX = goal.x;
      motion.goalY = goal.y;
      motion.obstacles = getObstacles(entries, ignoredElement);
      motion.path = planPath(start, goal, entries, ignoredElement);
      motion.lastPlan = performance.now();
    };

    const startLanding = () => {
      if (!lastPointer || motion.phase === "offscreen") return;
      const entries = getBlockerEntries(page);
      const perch = getPerchCandidates(page, lastPointer, entries)[0];
      if (!perch) {
        landingTimer = window.setTimeout(startLanding, 700);
        return;
      }

      motion.phase = "landing";
      motion.landing = perch;
      motion.dropping = false;
      setPhase("landing");
      setRoute(
        { x: perch.approachX, y: perch.approachY },
        entries,
        perch.surface,
      );
      requestFrame();
    };

    const returnToHome = () => {
      if (motion.phase !== "annoyed") return;
      const entries = getBlockerEntries(page);

      motion.phase = "returning";
      motion.landing = null;
      motion.dropping = false;
      setPhase("returning");
      setRoute(getHomePosition(), entries, homeMark?.closest(".landing-brand"));
      requestFrame();
    };

    const beginAnnoyance = () => {
      if (motion.phase !== "perched") return;
      motion.phase = "annoyed";
      setPhase("annoyed");
      annoyanceTimer = window.setTimeout(returnToHome, ANNOYANCE_DURATION);
    };

    const scheduleLanding = (delay) => {
      window.clearTimeout(landingTimer);
      landingTimer = window.setTimeout(startLanding, delay);
    };

    function animate(timestamp) {
      frame = null;
      const elapsed = clamp((timestamp - motion.lastFrame) / 1000, 0.001, 0.032);
      motion.lastFrame = timestamp;
      const targetScale = motion.phase === "returning" ? HOME_SCALE : 1;
      motion.scale += (targetScale - motion.scale) * Math.min(1, elapsed * 8);

      const waypoint = motion.path[0] || { x: motion.goalX, y: motion.goalY };
      const dx = waypoint.x - motion.x;
      const dy = waypoint.y - motion.y;
      const previousX = motion.x;
      const previousY = motion.y;

      if (motion.dropping && motion.landing) {
        motion.vx += (dx * 38 - motion.vx * 14) * elapsed;
        motion.x += motion.vx * elapsed;
        motion.vy += 1500 * elapsed;
        motion.y += motion.vy * elapsed;
        if (motion.y >= motion.landing.y) {
          motion.y = motion.landing.y;
          motion.x = motion.landing.x;
          motion.vx = 0;
          motion.vy = 0;
          motion.dropping = false;
          motion.phase = "perched";
          setPhase("perched");
          window.clearTimeout(departureTimer);
          departureTimer = window.setTimeout(beginAnnoyance, DEPARTURE_DELAY);
        }
      } else {
        motion.vx += (dx * 42 - motion.vx * 15) * elapsed;
        motion.vy += (dy * 42 - motion.vy * 15) * elapsed;
        motion.vx = clamp(motion.vx, -1000, 1000);
        motion.vy = clamp(motion.vy, -1000, 1000);
        const nextX = motion.x + motion.vx * elapsed;
        const nextY = motion.y + motion.vy * elapsed;
        const minX = -BIRD_WIDTH + 12;
        const maxX = window.innerWidth - 12;
        const minY = -BIRD_HEIGHT + 12;
        const maxY = window.innerHeight - 12;
        const keepInView = motion.phase === "following"
          && motion.hasEntered;
        const nextPoint = keepInView
          ? { x: clamp(nextX, minX, maxX), y: clamp(nextY, minY, maxY) }
          : { x: nextX, y: nextY };
        const isBlocked = motion.obstacles.some((obstacle) => (
          !isInside({ x: previousX, y: previousY }, obstacle)
          && isInside(nextPoint, obstacle)
        ));

        if (isBlocked) {
          motion.vx = 0;
          motion.vy = 0;
          const entries = getBlockerEntries(page);
          setRoute(
            { x: motion.goalX, y: motion.goalY },
            entries,
            motion.phase === "landing" ? motion.landing?.surface : null,
          );
        } else {
          motion.x = nextPoint.x;
          motion.y = nextPoint.y;
          if (keepInView) {
            if (nextX < minX || nextX > maxX) motion.vx = 0;
            if (nextY < minY || nextY > maxY) motion.vy = 0;
          }
          if (motion.x >= 0 && motion.x < window.innerWidth
            && motion.y >= 0 && motion.y < window.innerHeight) {
            motion.hasEntered = true;
          }
        }
      }

      if (Math.abs(motion.vx) > 18) motion.direction = motion.vx > 0 ? 1 : -1;
      renderTransform();

      const speed = Math.hypot(motion.vx, motion.vy);
      const waypointDistance = Math.hypot(waypoint.x - motion.x, waypoint.y - motion.y);
      if (motion.path.length && waypointDistance < 4 && speed < 34) {
        motion.x = waypoint.x;
        motion.y = waypoint.y;
        motion.path.shift();
        if (motion.phase === "landing" && motion.landing && !motion.dropping) {
          if (!motion.path.length) {
            motion.dropping = true;
            motion.vy = 50;
            motion.goalX = motion.landing.x;
            motion.goalY = motion.landing.y;
          }
        }
      }

      const goalDistance = Math.hypot(motion.goalX - motion.x, motion.goalY - motion.y);
      if (motion.phase === "returning"
        && !motion.path.length
        && goalDistance < 4
        && speed < 34
        && Math.abs(motion.scale - HOME_SCALE) < 0.02) {
        motion.x = motion.goalX;
        motion.y = motion.goalY;
        motion.vx = 0;
        motion.vy = 0;
        motion.phase = "docked";
        setPhase("docked");
        setFollowerActive(false);
        renderTransform();
        return;
      }

      const moved = Math.hypot(motion.x - previousX, motion.y - previousY);
      if (motion.dropping
        || motion.path.length
        || goalDistance > 1
        || moved > 0.1
        || (motion.phase === "returning" && Math.abs(motion.scale - HOME_SCALE) >= 0.02)) {
        requestFrame();
      }
    }

    const handlePointerMove = (event) => {
      if (event.pointerType === "touch") return;
      lastPointer = { x: event.clientX, y: event.clientY };
      window.clearTimeout(landingTimer);
      window.clearTimeout(departureTimer);
      window.clearTimeout(annoyanceTimer);
      if (event.target instanceof Node && bird.contains(event.target)) {
        if (motion.phase === "annoyed") {
          motion.phase = "following";
          motion.landing = null;
          motion.dropping = false;
          motion.path = [];
          motion.obstacles = [];
          motion.goalX = motion.x;
          motion.goalY = motion.y;
          setPhase("following");
          setFollowerActive(true);
          requestFrame();
        }
        return;
      }

      const entries = getBlockerEntries(page);
      const candidate = findCursorPosition(lastPointer, entries);
      if (!candidate) return;

      const wasOffscreen = motion.phase === "offscreen";
      motion.phase = "following";
      motion.landing = null;
      motion.dropping = false;
      motion.direction = candidate.x + BIRD_WIDTH / 2 < lastPointer.x ? -1 : 1;
      if (wasOffscreen) {
        const home = getHomePosition();
        motion.x = home.x;
        motion.y = home.y;
        motion.scale = HOME_SCALE;
        motion.vx = 0;
        motion.vy = 0;
        motion.hasEntered = true;
        renderTransform();
      }
      setPhase("following");
      setFollowerActive(true);

      const now = performance.now();
      const goalChanged = Math.hypot(candidate.x - motion.goalX, candidate.y - motion.goalY) > 12;
      if (goalChanged) {
        motion.goalX = candidate.x;
        motion.goalY = candidate.y;
        motion.obstacles = getObstacles(entries);
        if (now - motion.lastPlan > 70 || motion.path.length === 0) {
          motion.path = planPath(
            { x: motion.x, y: motion.y },
            candidate,
            entries,
          );
          motion.lastPlan = now;
        }
      }

      requestFrame();
      scheduleLanding(getLandingDelay(lastPointer));
    };

    const handleScroll = () => {
      if (!lastPointer || motion.phase === "offscreen") return;
      window.clearTimeout(landingTimer);
      window.clearTimeout(departureTimer);
      window.clearTimeout(annoyanceTimer);
      if (motion.phase === "returning") return;
      const entries = getBlockerEntries(page);
      const candidate = findCursorPosition(lastPointer, entries);
      if (candidate) {
        motion.phase = "following";
        motion.landing = null;
        motion.dropping = false;
        setPhase("following");
        motion.obstacles = getObstacles(entries);
        motion.path = planPath(
          { x: motion.x, y: motion.y },
          candidate,
          entries,
        );
        motion.goalX = candidate.x;
        motion.goalY = candidate.y;
        motion.lastPlan = performance.now();
        requestFrame();
      }
      scheduleLanding(getLandingDelay(lastPointer));
    };

    bird.style.transform = `translate3d(${motion.x}px, ${motion.y}px, 0)`;
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("scroll", handleScroll);
      homeMark?.classList.remove("is-pip-flying");
      window.clearTimeout(landingTimer);
      window.clearTimeout(departureTimer);
      window.clearTimeout(annoyanceTimer);
      window.clearTimeout(clickAnimationTimerRef.current);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <button
      type="button"
      ref={birdRef}
      className="landing-pip-follower"
      data-active={active}
      data-phase={phase}
      aria-label="Pip, click for a surprise animation"
      aria-hidden={!active}
      tabIndex={active ? 0 : -1}
      onClick={playRandomClickAnimation}
    >
      <img
        key={clickAnimation?.id ?? phase}
        className="landing-pip-follower__image"
        src={clickAnimation?.source || (phase === "perched"
          ? settlingBird
          : phase === "annoyed" ? annoyedBird : flappingBird)}
        alt=""
        draggable="false"
      />
    </button>
  );
}
