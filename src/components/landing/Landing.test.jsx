import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import LandingHero from "./LandingHero";
import HowItWorksSection from "./HowItWorksSection";
import darkHeroImage from "../../assets/hero images/dark.jpg";
import lightHeroImage from "../../assets/hero images/light.jpg";
import { FeatureGrid, OpenSourceSection } from "./LandingSections";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
});

describe("landing page", () => {
  it("explains the workflow and keeps a single trailer placeholder", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }));
    const { container } = render(<HowItWorksSection />);

    expect(screen.getByRole("heading", { name: /one space\..*your kind of flow/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open your workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Find your flow" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Make it yours" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open your workspace/i })).toHaveAttribute("href", "/dashboard");
    expect(container.querySelectorAll("video")).toHaveLength(0);
    expect(screen.getByText("The Kazedesk trailer")).toBeInTheDocument();
    expect(await screen.findByText(/no releases yet/i)).toBeInTheDocument();
  });

  it("shows release notes returned by GitHub", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        name: "A calmer workspace",
        tag_name: "v1.2.0",
        html_url: "https://github.com/Ryson-Theo/Kazedesk/releases/tag/v1.2.0",
        published_at: "2026-11-10T12:00:00Z",
        body: "A refreshed workspace and a smoother daily flow.\n\n## Highlights\n- Added a calmer workspace\n- Improved NoteMap performance\n- Made focus sessions easier to manage\n- Added independent boards\n- Improved mobile layouts",
      }, {
        name: "Older release",
        tag_name: "v1.1.0",
        html_url: "https://github.com/Ryson-Theo/Kazedesk/releases/tag/v1.1.0",
        published_at: "2026-10-10T12:00:00Z",
        body: "An older release.",
      }],
    }));
    const { container } = render(<HowItWorksSection />);

    expect(await screen.findByRole("link", { name: /read full release notes/i })).toHaveAttribute(
      "href",
      "https://github.com/Ryson-Theo/Kazedesk/releases/tag/v1.2.0"
    );
    expect(screen.getByText("A refreshed workspace and a smoother daily flow.")).toBeInTheDocument();
    expect(screen.getByText("Added a calmer workspace")).toBeInTheDocument();
    expect(screen.getByText("Improved NoteMap performance")).toBeInTheDocument();
    expect(container.querySelectorAll(".release-note-highlights li")).toHaveLength(4);
    expect(screen.queryByText("Improved mobile layouts")).not.toBeInTheDocument();
    expect(screen.getByText("v1.2.0")).toBeInTheDocument();
    expect(screen.queryByText("Older release")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".release-notes-fall")).toHaveLength(0);
    expect(container.querySelector(".release-notes-laser")).not.toBeInTheDocument();
  });

  it("shows the latest known release when GitHub is rate limited or unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<HowItWorksSection />);

    expect(await screen.findByText("Kazedesk v0.2.0")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/showing the latest release available here/i);
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/Ryson-Theo/Kazedesk/releases"
    );
    expect(screen.getByRole("link", { name: /read full release notes/i })).toHaveAttribute(
      "href",
      "https://github.com/Ryson-Theo/Kazedesk/releases/tag/v0.2.0"
    );
  });

  it("embeds YouTube trailers and supports an expandable player", () => {
    vi.stubEnv("VITE_PRODUCT_TRAILER_URL", "https://youtu.be/abcdefghijk");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<HowItWorksSection />);

    expect(screen.getByTitle("Kazedesk product trailer")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/abcdefghijk?controls=1&rel=0&playsinline=1"
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand trailer" }));
    expect(screen.getByRole("dialog", { name: "Expanded Kazedesk product trailer" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses custom playback controls for direct MP4 video URLs", () => {
    vi.stubEnv("VITE_PRODUCT_TRAILER_URL", "https://example.com/videos/trailer.mp4");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    const { container } = render(<HowItWorksSection />);

    expect(container.querySelector(".product-trailer video source")).toHaveAttribute(
      "src",
      "https://example.com/videos/trailer.mp4"
    );
    expect(screen.getByRole("button", { name: "Play trailer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mute trailer" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Seek trailer" })).toBeInTheDocument();
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

  it("shows the everyday features in an open folder without the scrolling image rail", () => {
    const { container } = render(<FeatureGrid />);

    expect(container.querySelector(".folder-root")).toHaveAttribute("data-open");
    expect(container.querySelectorAll(".folder-doc")).toHaveLength(4);
    expect(screen.getByText("Focus timer")).toBeInTheDocument();
    expect(screen.getByText("Tasks & reminders")).toBeInTheDocument();
    expect(screen.getByText("Notes & NoteMap")).toBeInTheDocument();
    expect(container.querySelectorAll(".folder-doc-checklist")).toHaveLength(4);
    expect(container.querySelectorAll(".folder-doc-checklist li")).toHaveLength(12);
    expect(screen.getByText("Timed breaks")).toBeInTheDocument();
    expect(screen.getByText("Visual maps")).toBeInTheDocument();
    expect(screen.getByText("Your data stays yours")).toBeInTheDocument();
    expect(container.querySelector(".feature-rail-viewport")).toBeNull();
    expect(container.querySelector(".feature-card-visual")).toBeNull();
    expect(container.querySelector(".folder-doc-line")).toBeNull();
    expect(container.querySelector(".folder-doc-block")).toBeNull();
    expect(container.querySelector(".features-ribbon")).toBeInTheDocument();
    expect(container.querySelector(".features-ribbon .text-loop-svg")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("FOCUS")
    );
    expect(screen.getByText("Set a focus rhythm and make space for the work in front of you.")).toBeInTheDocument();
    expect(screen.getByText("Click the folder to open or close it")).toBeInTheDocument();

    fireEvent.click(container.querySelector(".folder-stage"));
    expect(container.querySelector(".features-folder")).toHaveClass("is-straight");
    expect(screen.queryByText("Click the folder to open or close it")).not.toBeInTheDocument();
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

  it("ignores contributor links that are not hosted by GitHub over HTTPS", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        type: "User",
        login: "unsafe-link",
        html_url: "javascript:alert(1)",
        avatar_url: "https://evil.example/avatar.png",
        contributions: 1,
      }],
    }));
    render(<OpenSourceSection />);

    expect(await screen.findByText(/no merged contributions are listed yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /unsafe-link/i })).not.toBeInTheDocument();
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
