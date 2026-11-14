import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LandingPip from "./LandingPip";

let originalElementFromPoint;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalElementFromPoint) {
    Object.defineProperty(document, "elementFromPoint", originalElementFromPoint);
    originalElementFromPoint = undefined;
  } else {
    delete document.elementFromPoint;
  }
});

describe("landing Pip", () => {
  it("plays a random uploaded animation when clicked, then resumes flight", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { container } = render(
      <main className="landing-page">
        <LandingPip />
      </main>,
    );
    const bird = container.querySelector(".landing-pip-follower");

    fireEvent.pointerMove(window, { clientX: 200, clientY: 200, pointerType: "mouse" });
    fireEvent.pointerMove(bird, { clientX: 200, clientY: 200, pointerType: "mouse" });
    expect(bird.dataset.phase).toBe("following");
    fireEvent.click(bird);

    expect(bird.querySelector("img").getAttribute("src"))
      .toContain("Chibi%20Bird%20Task%20Celebration");

    act(() => vi.advanceTimersByTime(3200));

    expect(bird.querySelector("img").getAttribute("src"))
      .toContain("Cute%20Chick%20Wing-Flapping");
  });

  it("finds a clear perch above rendered text bounds when its element box differs", () => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function getRect() {
      const rect = this.classList?.contains("hero-title")
        ? { left: 0, top: 620, width: 1024, height: 109 }
        : { left: 0, top: 0, width: 0, height: 0 };
      return {
        ...rect,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
      };
    });
    vi.spyOn(document, "createRange").mockReturnValue({
      selectNodeContents: vi.fn(),
      getClientRects: () => [new DOMRect(0, 583, 1024, 183)],
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });

    const { container } = render(
      <main className="landing-page">
        <LandingPip />
        <h1 className="hero-title">Kazedesk</h1>
      </main>,
    );
    const heading = container.querySelector(".hero-title");
    originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => heading,
    });

    fireEvent.pointerMove(window, { clientX: 512, clientY: 674, pointerType: "mouse" });

    const bird = container.querySelector(".landing-pip-follower");
    expect(bird.dataset.phase).toBe("following");
    expect(bird.dataset.active).toBe("true");
  });

  it("flies from the navbar, lands, reacts after seven seconds, and returns home", async () => {
    vi.useFakeTimers();
    const callbacks = new Map();
    let frameId = 0;
    let timestamp = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = ++frameId;
      callbacks.set(id, callback);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => callbacks.delete(id));
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function getRect() {
      const className = typeof this.className === "string" ? this.className : "";
      const rect = className.includes("folder-root")
        ? { left: 50, top: 250, width: 400, height: 100 }
        : className.includes("landing-brand-mark")
          ? { left: 20, top: 20, width: 46, height: 46 }
        : className.includes("landing-pip-follower")
          ? { left: 0, top: 0, width: 114, height: 76 }
          : this.tagName === "P"
            ? { left: 0, top: 380, width: 700, height: 40 }
            : { left: 0, top: 0, width: 0, height: 0 };
      return {
        ...rect,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
      };
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });

    const { container } = render(
      <main className="landing-page">
        <header className="landing-header">
          <a className="landing-brand">
            <span className="landing-brand-mark" />
          </a>
        </header>
        <LandingPip />
        <p>Text Pip should fly around</p>
        <div className="features-folder">
          <div className="folder-root" />
        </div>
      </main>,
    );
    const bird = container.querySelector(".landing-pip-follower");
    const paragraph = container.querySelector("p");
    originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => paragraph,
    });
    const flightPositions = [];
    const advanceFrames = (count) => {
      for (let index = 0; index < count; index += 1) {
        const pending = Array.from(callbacks.values());
        callbacks.clear();
        if (!pending.length) break;
        timestamp = Math.max(timestamp, performance.now());
        timestamp += 16;
        act(() => pending.forEach((callback) => callback(timestamp)));
        const match = bird.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
        if (match) flightPositions.push([Number(match[1]), Number(match[2])]);
      }
    };

    expect(bird.dataset.phase).toBe("offscreen");
    fireEvent.pointerMove(window, { clientX: 120, clientY: 160, pointerType: "mouse" });
    expect(bird.dataset.phase).toBe("following");
    expect(bird.dataset.active).toBe("true");
    expect(bird.style.transform).toContain("translate3d(-14px, 5px, 0)");
    expect(container.querySelector(".landing-brand-mark").classList.contains("is-pip-flying")).toBe(true);

    advanceFrames(300);
    await act(async () => {
      vi.advanceTimersByTime(650);
    });
    expect(bird.dataset.phase).toBe("following");
    await act(async () => {
      vi.advanceTimersByTime(1350);
    });
    advanceFrames(300);
    expect(bird.dataset.phase).toBe("perched");
    expect(bird.querySelector("img").getAttribute("src")).toContain("Chibi%20Bird%20Sticker");
    const position = bird.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
    const birdTop = Number(position[2]);
    expect(birdTop + 76 - 7).toBeCloseTo(250, 0);
    expect(birdTop + 76).toBeLessThan(380);
    const largestFrameStep = Math.max(...flightPositions.slice(1).map((current, index) => (
      Math.hypot(
        current[0] - flightPositions[index][0],
        current[1] - flightPositions[index][1],
      )
    )));
    expect(largestFrameStep).toBeLessThan(35);

    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    expect(bird.dataset.phase).toBe("annoyed");
    expect(bird.querySelector("img").getAttribute("src")).toContain("Chibi%20Finch%20Settles");

    await act(async () => {
      vi.advanceTimersByTime(1400);
    });
    expect(bird.dataset.phase).toBe("returning");
    expect(bird.querySelector("img").getAttribute("src")).toContain("Cute%20Chick%20Wing-Flapping");

    advanceFrames(40);
    const positionBeforeReturn = bird.style.transform;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => document.body,
    });
    fireEvent.pointerMove(window, { clientX: 800, clientY: 160, pointerType: "mouse" });
    expect(bird.dataset.phase).toBe("following");
    expect(bird.style.transform).toBe(positionBeforeReturn);
    expect(bird.dataset.active).toBe("true");

    advanceFrames(160);
    await act(async () => {
      vi.advanceTimersByTime(650);
    });
    advanceFrames(300);
    expect(bird.dataset.phase).toBe("perched");

    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    await act(async () => {
      vi.advanceTimersByTime(1400);
    });
    advanceFrames(500);
    expect(bird.dataset.phase).toBe("docked");
    expect(bird.dataset.active).toBe("false");
    expect(container.querySelector(".landing-brand-mark").classList.contains("is-pip-flying")).toBe(false);
  });
});
