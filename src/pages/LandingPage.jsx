import { useState } from "react";
import LandingNavbar from "../components/landing/LandingNavbar";
import LandingHero from "../components/landing/LandingHero";
import LandingFooter from "../components/landing/LandingFooter";
import DemoVideosSection from "../components/landing/DemoVideosSection";
import GifDropSection from "../components/landing/GifDropSection";
import {
  FAQSection,
  FeatureGrid,
  OpenSourceSection,
} from "../components/landing/LandingSections";
import "../styles/landing.css";

export default function LandingPage() {
  const [theme, setTheme] = useState(() => localStorage.getItem("kazedesk-landing-theme") || "dark");

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("kazedesk-landing-theme", nextTheme);
  };

  return (
    <main className={`landing-page landing-theme-${theme}`}>
      <LandingNavbar theme={theme} onToggleTheme={toggleTheme} />
      <LandingHero />
      <FeatureGrid />
      <GifDropSection />
      <DemoVideosSection />
      <OpenSourceSection />
      <FAQSection />
      <LandingFooter />
    </main>
  );
}
