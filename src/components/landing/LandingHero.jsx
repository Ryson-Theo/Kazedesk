import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import heroImage from "../../assets/hero (2).png";

export default function LandingHero() {
  const navigate = useNavigate();
  return (
    <section className="landing-hero" id="top">
      <img className="hero-photo" src={heroImage} alt="A quiet desk beside a sunlit window" />
      <div className="hero-photo-shade" />
      <div className="hero-copy">
        <span className="hero-eyebrow"><i /> Focus, without the noise</span>
        <h1>Make room for<br /><em>deep focus.</em></h1>
        <p>Focus, tasks, notes and music, together in one calm workspace.</p>
        <div className="hero-actions"><button type="button" className="button-primary" onClick={() => navigate("/dashboard")}>Start focusing <ArrowUpRight size={17} /></button><a className="button-quiet" href="#features">Explore features <ArrowDown size={15} /></a></div>
        <div className="hero-trust-list" aria-label="Kazedesk benefits"><span>Free to use</span><span>No account</span><span>Your data stays local</span></div>
      </div>
    </section>
  );
}