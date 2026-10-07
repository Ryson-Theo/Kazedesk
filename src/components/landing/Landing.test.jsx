import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import LandingHero from "./LandingHero";
import { OpenSourceSection } from "./LandingSections";

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
    render(<OpenSourceSection />);

    expect(screen.getByText("MIT License")).toBeInTheDocument();
    expect(screen.getByText("Contributions are welcome.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /github repository/i })).toHaveAttribute(
      "href",
      "https://github.com/Ryson-Theo/Kazedesk"
    );
  });
});
