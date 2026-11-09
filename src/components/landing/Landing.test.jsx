import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import LandingHero from "./LandingHero";
import DemoVideosSection from "./DemoVideosSection";
import darkHeroImage from "../../assets/hero images/dark.png";
import lightHeroImage from "../../assets/hero images/light.png";
import { OpenSourceSection } from "./LandingSections";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
});

describe("landing page", () => {
  it("loads only the chosen demo video after the user clicks", () => {
    render(<DemoVideosSection />);

    expect(document.querySelector(".demo-video-player video")).toBeNull();
    expect(document.querySelector(".demo-video-player source")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Play Focus timer demo" }));

    expect(document.querySelector(".demo-video-player video")).toHaveAttribute("preload", "none");
    expect(document.querySelector(".demo-video-player source")).toHaveAttribute(
      "src",
      "https://res.cloudinary.com/g0qwmiex/video/upload/v1791117418/timer.mp4"
    );

    fireEvent.click(screen.getByRole("button", { name: /tasks & reminders/i }));
    expect(document.querySelector(".demo-video-player source")).toHaveAttribute(
      "src",
      "https://res.cloudinary.com/g0qwmiex/video/upload/v1791116558/tasks.mp4"
    );
  });

  it("shows a single accessible Kazedesk hero wordmark", () => {
    render(
      <MemoryRouter>
        <LandingHero />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Kazedesk" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Kazedesk" })).toHaveLength(1);
  });

  it("uses the hero artwork that matches the selected theme", () => {
    const { rerender } = render(
      <MemoryRouter>
        <LandingHero theme="dark" />
      </MemoryRouter>
    );

    expect(screen.getByAltText(/calm workspace/i)).toHaveAttribute("src", darkHeroImage);

    rerender(
      <MemoryRouter>
        <LandingHero theme="light" />
      </MemoryRouter>
    );

    expect(screen.getByAltText(/calm workspace/i)).toHaveAttribute("src", lightHeroImage);
  });

  it("renders a static hero without dot grid or scroll effects", () => {
    render(
      <MemoryRouter>
        <LandingHero />
      </MemoryRouter>
    );

    expect(document.querySelector(".hero-ui-panels")).toBeNull();
    expect(document.querySelector(".hero-dot-grid")).toBeNull();
    expect(document.querySelector(".hero-scroll-cue")).toBeNull();
    expect(document.querySelectorAll(".hero-glass-panel")).toHaveLength(1);
    expect(document.querySelector(".hero-glass-panel")).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".landing-hero")).not.toHaveAttribute("style");
    expect(screen.getByRole("button", { name: /start focusing/i })).toBeInTheDocument();
  });

  it("shows a left-aligned launch button with a centered arrow and no circular text", () => {
    render(
      <MemoryRouter>
        <LandingHero />
      </MemoryRouter>
    );

    const launchButton = screen.getByRole("button", { name: /start focusing/i });
    expect(launchButton.querySelector(".hero-launch-arrow svg")).toBeInTheDocument();
    expect(launchButton.querySelector(".hero-launch-ring")).toBeNull();
    expect(launchButton.querySelectorAll(".hero-launch-glyph")).toHaveLength(0);
    expect(screen.getByText("Make room for deep focus")).toBeInTheDocument();
    expect(document.querySelector(".hero-description").textContent).toBe(
      "Designed around the way you think and work. A little more clarity, a little less chaos, and a better way to spend your day. Bring your tasks, notes, ideas, and everyday essentials together in one thoughtful space that feels natural, keeps you in flow, and helps you make room for what matters."
    );
    expect(Array.from(document.querySelectorAll(".hero-description > span"), (line) => line.textContent)).toEqual([
      "Designed around the way you think and work. A little more clarity, a little",
      "less chaos, and a better way to spend your day. Bring your tasks, notes,",
      "ideas, and everyday essentials together in one thoughtful space that feels",
      "natural, keeps you in flow, and helps you make room for what matters.",
    ]);
    expect(launchButton).toBeInTheDocument();
  });

  it("shows the repository, license, and contribution information", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }));
    render(<OpenSourceSection />);

    expect(screen.getByText("MIT License")).toBeInTheDocument();
    expect(screen.getByText("Contributions are welcome.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /github repository/i })).toHaveAttribute(
      "href",
      "https://github.com/Ryson-Theo/Kazedesk"
    );
  });

  it("shows contributor profiles returned by GitHub", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        type: "User",
        login: "octocat",
        html_url: "https://github.com/octocat",
        avatar_url: "https://avatars.githubusercontent.com/u/1",
        contributions: 42,
      }],
    }));
    render(<OpenSourceSection />);

    expect(await screen.findByRole("link", {
      name: "GitHub profile octocat, 42 contributions",
    })).toHaveAttribute("href", "https://github.com/octocat");
  });

  it("shows an empty state when GitHub has no listed contributors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    }));
    render(<OpenSourceSection />);

    expect(await screen.findByText(/no merged contributions are listed yet/i)).toBeInTheDocument();
  });
});
