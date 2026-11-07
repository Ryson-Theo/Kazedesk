import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import LandingHero from "./LandingHero";
import DemoVideosSection from "./DemoVideosSection";
import darkHeroImage from "../../assets/hero images/dark 1 hero.png";
import lightHeroImage from "../../assets/hero images/light 1 hero.png";
import { OpenSourceSection } from "./LandingSections";

afterEach(() => {
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

  it("does not add floating UI panels to the hero", () => {
    render(
      <MemoryRouter>
        <LandingHero />
      </MemoryRouter>
    );

    expect(document.querySelector(".hero-ui-panels")).toBeNull();
    expect(document.querySelector(".landing-hero")).toHaveStyle({
      "--hero-image-inset": "50%",
      "--hero-solid-title-opacity": "0",
    });
    expect(document.querySelector(".hero-story")).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: /start focusing/i })).toBeInTheDocument();
    expect(document.querySelector(".hero-dot-grid")).toBeInTheDocument();
  });

  it("reveals the image and supporting content as the hero scrolls", () => {
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback();
      return 1;
    });
    render(
      <MemoryRouter>
        <LandingHero />
      </MemoryRouter>
    );

    const hero = document.querySelector(".landing-hero");
    Object.defineProperty(hero, "offsetHeight", { configurable: true, value: 2000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
    vi.stubGlobal("scrollY", 360);
    hero.getBoundingClientRect = () => ({ top: -360 });
    fireEvent.scroll(window);

    expect(hero).toHaveStyle({
      "--hero-image-inset": "25%",
      "--hero-solid-title-opacity": "0.5",
    });
  });

  it("fully reveals the image before the hero releases on continued scroll", () => {
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback();
      return 1;
    });
    render(
      <MemoryRouter>
        <LandingHero />
      </MemoryRouter>
    );

    const hero = document.querySelector(".landing-hero");
    Object.defineProperty(hero, "offsetHeight", { configurable: true, value: 2000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
    vi.stubGlobal("scrollY", 950);
    hero.getBoundingClientRect = () => ({ top: -950 });
    fireEvent.scroll(window);

    expect(hero).toHaveStyle({
      "--hero-image-inset": "0%",
      "--hero-image-radius": "0px",
      "--hero-title-left": "1%",
      "--hero-title-top": "97%",
      "--hero-title-translate-y": "-100%",
      "--hero-title-scale": "1.12",
      "--hero-solid-title-opacity": "1",
      "--hero-story-opacity": "1",
    });
    expect(document.querySelector(".hero-story")).not.toHaveAttribute("inert");
  });

  it("keeps the mobile wordmark bottom-left with the call to action on the right", () => {
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback();
      return 1;
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    render(
      <MemoryRouter>
        <LandingHero />
      </MemoryRouter>
    );

    const hero = document.querySelector(".landing-hero");
    Object.defineProperty(hero, "offsetHeight", { configurable: true, value: 2000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
    hero.getBoundingClientRect = () => ({ top: -950 });
    fireEvent.scroll(window);

    expect(hero).toHaveStyle({
      "--hero-title-left": "5%",
      "--hero-title-top": "62%",
      "--hero-title-scale": "0.55",
      "--hero-story-opacity": "1",
    });
  });

  it("shows the complete hero without scrolling when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(
      <MemoryRouter>
        <LandingHero />
      </MemoryRouter>
    );

    expect(document.querySelector(".landing-hero")).toHaveStyle({
      "--hero-image-inset": "0%",
      "--hero-solid-title-opacity": "1",
      "--hero-story-opacity": "1",
    });
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
