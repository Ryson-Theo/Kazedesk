import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Menu, Moon, Sun, X } from "lucide-react";
import { LANDING_LINKS } from "./landingLinks";
import GithubIcon from "./GithubIcon";
import PipIcon from "../PipIcon";

const NAV_LINKS = [["Features", "#features"], ["How it works", "#how-it-works"], ["Open source", "#open-source"], ["FAQ", "#faq"]];

export default function LandingNavbar({ theme, onToggleTheme }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const launchApp = () => navigate("/dashboard");

  return (
    <header className="landing-header">
      <a className="landing-brand" href="#top" aria-label="Kazedesk home">
        <span className="landing-brand-mark"><PipIcon className="kazedesk-pip-icon" size={25} /></span><span>Kazedesk</span>
      </a>
      <nav className={`landing-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
        {NAV_LINKS.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
        <button className="nav-launch-mobile" type="button" onClick={launchApp}>Launch app <ArrowUpRight size={15} /></button>
      </nav>
      <div className="landing-header-actions">
        <button className="landing-theme-toggle" type="button" onClick={onToggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <a className="github-nav-link" href={LANDING_LINKS.github || "#open-source"} target={LANDING_LINKS.github ? "_blank" : undefined} rel={LANDING_LINKS.github ? "noreferrer" : undefined} aria-label="GitHub repository details" title={LANDING_LINKS.github ? "Open GitHub repository" : "Add repository URL in landingLinks.js"}><GithubIcon size={19} /></a>
        <button className="nav-launch" type="button" onClick={launchApp}>Launch app <ArrowUpRight size={15} /></button>
        <button className="nav-menu-toggle" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </header>
  );
}