import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import PipIcon from "../PipIcon";

export default function InfoPageLayout({ pageTitle, children }) {
  const [theme, setTheme] = useState(() => (
    localStorage.getItem("kazedesk-landing-theme") === "light" ? "light" : "dark"
  ));

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${pageTitle} | Kazedesk`;
    return () => {
      document.title = previousTitle;
    };
  }, [pageTitle]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("kazedesk-landing-theme", nextTheme);
  };

  return (
    <div id="top" className={`landing-page landing-theme-${theme} site-info-page`}>
      <header className="landing-header">
        <Link className="landing-brand" to="/" aria-label="Kazedesk home">
          <span className="landing-brand-mark"><PipIcon className="kazedesk-pip-icon" size={25} /></span>
          <span>Kazedesk</span>
        </Link>
        <div className="landing-header-actions">
          <button
            className="landing-theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link className="nav-launch site-info-workspace-link" to="/dashboard">Open workspace</Link>
        </div>
      </header>
      {children}
    </div>
  );
}
