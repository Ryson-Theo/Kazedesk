import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import LandingHero from "./LandingHero";
import { OpenSourceSection } from "./LandingSections";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("landing page", () => {
  it("navigates from the hero to the dashboard", () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<LandingHero />} />
          <Route path="/dashboard" element={<h1>Dashboard</h1>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /start focusing/i }));

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
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
