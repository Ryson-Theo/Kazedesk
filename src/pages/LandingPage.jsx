import { useState } from "react";
import LandingNavbar from "../components/landing/LandingNavbar";
import LandingHero from "../components/landing/LandingHero";
import LandingFooter from "../components/landing/LandingFooter";
import HowItWorksSection from "../components/landing/HowItWorksSection";
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
      <LandingHero theme={theme} />
      <FeatureGrid theme={theme} />
      <GifDropSection />
      <HowItWorksSection />
      <OpenSourceSection />
      <FAQSection />
      <LandingFooter />
    </main>
  );
}
