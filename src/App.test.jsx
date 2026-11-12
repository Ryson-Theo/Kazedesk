import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./pages/LandingPage", () => ({ default: () => null }));

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("utility routes", () => {
  it("renders the privacy policy", () => {
    window.history.replaceState({}, "", "/privacy");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Privacy policy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What stays in your browser" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Backups and manual uploads" })).toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kazedesk GitHub repository" })).toHaveAttribute(
      "href",
      "https://github.com/Ryson-Theo/Kazedesk/issues"
    );
  });

  it("redirects the privacy-policy alias to the canonical route", async () => {
    window.history.replaceState({}, "", "/privacy-policy");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Privacy policy" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/privacy");
  });

  it("renders a branded not-found page for unknown routes", () => {
    window.history.replaceState({}, "", "/this-page-does-not-exist");
    render(<App />);

    expect(screen.getByRole("heading", { name: "This page isn’t here." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Open your workspace" })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });
});
