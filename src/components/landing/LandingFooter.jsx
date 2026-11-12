import { ArrowUpRight, ArrowUp, Heart } from "lucide-react";
import { Link } from "react-router-dom";
import darkFooterImage from "../../assets/footer.jpg";
import lightFooterImage from "../../assets/footer light.jpg";
import { LANDING_LINKS } from "./landingLinks";
import PipIcon from "../PipIcon";

const PERSONAL_LINKS = [
  { label: "Portfolio", href: LANDING_LINKS.portfolio },
  { label: "GitHub", href: LANDING_LINKS.github },
  { label: "Blog", href: LANDING_LINKS.blog },
  { label: "Instagram", href: LANDING_LINKS.instagram },
  { label: "LinkedIn", href: LANDING_LINKS.linkedin },
  { label: "X", href: LANDING_LINKS.x },
];

export default function LandingFooter({ theme = "dark" }) {
  const footerImage = theme === "light" ? lightFooterImage : darkFooterImage;

  return (
    <footer className="landing-footer">
      <div className="footer-image-stage">
        <img
          src={footerImage}
          alt={theme === "light" ? "Blue coastal landscape beneath a summer sky" : "Coastal hillside and bay beneath a starry night sky"}
          loading="lazy"
          decoding="async"
        />
        <div className="footer-image-topline">
          <a className="footer-image-home" href="#top"><PipIcon className="kazedesk-pip-icon" size={21} /> Kazedesk</a>
          <nav className="footer-personal-links" aria-label="Ribin K Roy links">
            {PERSONAL_LINKS.map(({ label, href }) => href
              ? <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label}<ArrowUpRight size={12} /></a>
              : <span className="footer-link-placeholder" key={label} aria-label={`${label} link not set`}>{label}</span>)}
          </nav>
        </div>
        <span className="footer-image-tagline">A calmer place<br />to get things done.</span>
        <span className="footer-image-brand" aria-label="Kazedesk">Kazedesk</span>
      </div>
      <div className="footer-bottomline">
        <span className="footer-made">Made with <Heart size={12} fill="currentColor" /> for focused days.</span>
        <span className="footer-copyright">Built by <a href={LANDING_LINKS.portfolio} target="_blank" rel="noopener noreferrer">Ribin K Roy</a> · © 2026</span>
        <Link className="footer-privacy-link" to="/privacy">Privacy</Link>
        <a className="footer-back-to-top" href="#top">Back to top <ArrowUp size={13} /></a>
      </div>
    </footer>
  );
}