import { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import LandingNavbar from "../components/landing/LandingNavbar";
import LandingHero from "../components/landing/LandingHero";
import LandingPip from "../components/landing/LandingPip";
import LandingFooter from "../components/landing/LandingFooter";
import HowItWorksSection from "../components/landing/HowItWorksSection";
import GifDropSection from "../components/landing/GifDropSection";
import {
  FAQSection,
  FeatureGrid,
  OpenSourceSection,
} from "../components/landing/LandingSections";
import "../styles/landing.css";

gsap.registerPlugin(ScrollTrigger);

export default function LandingPage() {
  const [theme, setTheme] = useState(() => localStorage.getItem("kazedesk-landing-theme") || "dark");
  const pageRef = useRef(null);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("kazedesk-landing-theme", nextTheme);
  };

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return undefined;

    const context = gsap.context(() => {
      const header = page.querySelector(".landing-header");
      if (header) {
        gsap.fromTo(header, { autoAlpha: 0, y: -12 }, {
          autoAlpha: 1,
          y: 0,
          delay: 0.12,
          duration: 0.65,
          ease: "power2.out",
        });
      }

      const revealGroups = [
        [".gif-drop-section", ".gif-drop-copy, .gif-drop-demo"],
        [".how-it-works-section", ".how-it-works-main, .release-notes-flow"],
        [".opensource-section", ".opensource-inner, .contributors-section"],
        [".faq-section", ".faq-heading, .faq-item"],
        [".footer-image-stage", ".footer-image-topline, .footer-image-tagline, .footer-image-brand"],
      ];

      revealGroups.forEach(([sectionSelector, targetSelector]) => {
        const section = page.querySelector(sectionSelector);
        const targets = section?.querySelectorAll(targetSelector);
        if (!section || !targets?.length) return;

        gsap.fromTo(targets, { autoAlpha: 0, y: 24 }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: { trigger: section, start: "top 82%", once: true },
        });
      });
    }, page);

    return () => context.revert();
  }, []);

  return (
    <main className={`landing-page landing-theme-${theme}`} ref={pageRef}>
      <LandingPip />
      <LandingNavbar theme={theme} onToggleTheme={toggleTheme} />
      <LandingHero theme={theme} />
      <FeatureGrid theme={theme} />
      <div className="landing-continuous-flow">
        <GifDropSection />
        <HowItWorksSection />
        <OpenSourceSection />
        <FAQSection />
      </div>
      <LandingFooter theme={theme} />
    </main>
  );
}
