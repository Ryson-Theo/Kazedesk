import { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { gsap } from "gsap";
import darkHeroImage from "../../assets/hero images/dark.jpg";
import lightHeroImage from "../../assets/hero images/light.jpg";

export default function LandingHero({ theme = "dark" }) {
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const glassPanelRef = useRef(null);
  const heroImage = theme === "light" ? lightHeroImage : darkHeroImage;

  useLayoutEffect(() => {
    const hero = heroRef.current;
    let cancelled = false;
    let introTimeline;
    const context = gsap.context(() => {
      const photo = hero.querySelector(".hero-photo");
      const title = hero.querySelector(".hero-title-row");
      const copy = hero.querySelector(".hero-copy-side");
      const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

      gsap.set(title, { opacity: 0, y: prefersReducedMotion ? 0 : 12 });
      if (!prefersReducedMotion) {
        gsap.set(copy, { opacity: 0, y: 10 });
        gsap.set(photo, { opacity: 0.86, scale: 1.025, transformOrigin: "center center" });
      }

      Promise.resolve(document.fonts?.ready).then(() => {
        if (cancelled) return;

        if (prefersReducedMotion) {
          gsap.set(title, { opacity: 1 });
          return;
        }

        introTimeline = gsap.timeline({ defaults: { ease: "power3.out" } })
          .to(photo, { opacity: 1, scale: 1, duration: 1.5 }, 0)
          .to(title, { opacity: 1, y: 0, duration: 0.85 }, 0.12)
          .to(copy, { opacity: 1, y: 0, duration: 0.8 }, 0.26);
      });
    }, hero);

    return () => {
      cancelled = true;
      introTimeline?.kill();
      context.revert();
    };
  }, []);

  useEffect(() => {
    const glassPanel = glassPanelRef.current;
    gsap.set(glassPanel, { autoAlpha: 0, y: 10, scale: 0.97 });

    return () => gsap.killTweensOf(glassPanel);
  }, []);

  const animateGlassPanel = (show) => {
    const glassPanel = glassPanelRef.current;
    if (!glassPanel) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      gsap.set(glassPanel, { autoAlpha: show ? 1 : 0, y: 0, scale: 1 });
      return;
    }

    gsap.to(glassPanel, {
      autoAlpha: show ? 1 : 0,
      y: show ? 0 : 10,
      scale: show ? 1 : 0.97,
      duration: show ? 0.65 : 0.38,
      ease: show ? "power3.out" : "power2.inOut",
      overwrite: "auto",
    });
  };

  return (
    <section className="landing-hero" id="top" ref={heroRef}>
      <div className="hero-stage">
        <img
          className="hero-photo"
          src={heroImage}
          alt="A calm workspace with a person working at a computer beside a window"
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
        <div className="hero-copy">
          <div className="hero-copy-main">
            <div className="hero-title-row">
              <h1 className="hero-title">Kazedesk</h1>
            </div>
          </div>
          <div className="hero-copy-side">
            <div
              className="hero-summary"
              onPointerEnter={() => animateGlassPanel(true)}
              onPointerLeave={() => animateGlassPanel(false)}
              onFocus={() => animateGlassPanel(true)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  animateGlassPanel(false);
                }
              }}
            >
              <span className="hero-glass-panel" ref={glassPanelRef} aria-hidden="true" />
              <p className="hero-eyebrow">Make room for deep focus</p>
              <p className="hero-description">
                <span>Designed around the way you think and work. A little more clarity, a little</span>
                {" "}
                <span>less chaos, and a better way to spend your day. Bring your tasks, notes,</span>
                {" "}
                <span>ideas, and everyday essentials together in one thoughtful space that feels</span>
                {" "}
                <span>natural, keeps you in flow, and helps you make room for what matters.</span>
              </p>
            </div>
            <button
              type="button"
              className="hero-launch"
              onClick={() => navigate("/dashboard")}
            >
              <span>Start focusing</span>
              <span className="hero-launch-arrow" aria-hidden="true">
                <ArrowRight size={16} />
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
