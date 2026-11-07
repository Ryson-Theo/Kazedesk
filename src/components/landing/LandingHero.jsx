import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import darkHeroImage from "../../assets/hero images/dark 1 hero.png";
import lightHeroImage from "../../assets/hero images/light 1 hero.png";
import DotGrid from "./DotGrid";

export default function LandingHero({ theme = "dark" }) {
  const heroRef = useRef(null);
  const storyRef = useRef(null);
  const navigate = useNavigate();
  const heroImage = theme === "light" ? lightHeroImage : darkHeroImage;

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return undefined;

    let frame = 0;
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const updateProgress = () => {
      frame = 0;
      const bounds = hero.getBoundingClientRect();
      const scrollRange = Math.max(hero.offsetHeight - window.innerHeight, 1);
      const scrollProgress = prefersReducedMotion ? 1 : Math.min(1, Math.max(0, -bounds.top / scrollRange));
      const imageProgress = Math.min(1, scrollProgress / 0.72);
      const layoutProgress = prefersReducedMotion ? 1 : Math.min(1, Math.max(0, (scrollProgress - 0.72) / 0.22));
      const isMobile = window.innerWidth <= 720;

      hero.style.setProperty("--hero-progress", imageProgress.toString());
      hero.style.setProperty("--hero-image-inset", `${50 * (1 - imageProgress)}%`);
      hero.style.setProperty("--hero-image-radius", `${28 * (1 - imageProgress)}px`);
      hero.style.setProperty("--hero-title-left", `${50 - layoutProgress * (isMobile ? 45 : 49)}%`);
      hero.style.setProperty("--hero-title-top", `${50 + layoutProgress * (isMobile ? 12 : 47)}%`);
      hero.style.setProperty("--hero-title-translate-x", `${-50 * (1 - layoutProgress)}%`);
      hero.style.setProperty("--hero-title-translate-y", `${-50 - layoutProgress * 50}%`);
      hero.style.setProperty("--hero-title-scale", (1 + layoutProgress * (isMobile ? -0.45 : 0.12)).toString());
      hero.style.setProperty("--hero-solid-title-opacity", imageProgress.toString());
      hero.style.setProperty("--hero-story-opacity", layoutProgress.toString());
      hero.style.setProperty("--hero-story-translate", `${16 * (1 - layoutProgress)}px`);
      storyRef.current?.toggleAttribute("inert", layoutProgress < 0.04);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="landing-hero" id="top" ref={heroRef}>
      <div className="hero-stage">
        <img className="hero-photo" src={heroImage} alt="A calm workspace with a person working beside a sunlit window" />
        <DotGrid
          baseColor="#3a3446"
          activeColor="#ffffff"
          shape="circle"
          dotSize={5}
          gap={18}
          proximity={140}
          strength={1}
          bounce={0.6}
          tension={0.4}
          returnDuration={0.8}
          shockRadius={320}
          shockStrength={5}
          swell={0.8}
          stretch={0.5}
          glow={0.5}
          fade={0}
          intro
        />
        <div className="hero-copy">
          <div className="hero-wordmark">
            <h1 className="hero-title" aria-label="Kazedesk" data-text="Kazedesk" style={{ backgroundImage: `url("${heroImage}")` }}>Kazedesk</h1>
          </div>
          <div className="hero-story" ref={storyRef}>
            <p>Focus, tasks, notes, and music—together in one calm workspace.</p>
            <button type="button" className="hero-launch" onClick={() => navigate("/dashboard")}>Start focusing <ArrowUpRight size={17} /></button>
          </div>
        </div>
        <div className="hero-scroll-cue" aria-hidden="true"><span>Scroll to reveal</span><ArrowDown size={14} /></div>
      </div>
    </section>
  );
}