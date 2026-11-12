import { Link } from "react-router-dom";
import InfoPageLayout from "../components/landing/InfoPageLayout";

export default function NotFoundPage() {
  return (
    <InfoPageLayout pageTitle="Page not found">
      <main className="site-info-main site-not-found">
        <section className="site-info-shell">
          <span className="site-info-code" aria-hidden="true">404</span>
          <p className="site-info-kicker">Page not found</p>
          <h1 className="site-info-title">This page isn’t here.</h1>
          <p className="site-info-lede">
            The address may have changed, or the page may no longer exist.
          </p>
          <div className="site-info-actions">
            <Link className="site-info-action-primary" to="/">Back to home</Link>
            <Link className="site-info-action-secondary" to="/dashboard">Open your workspace</Link>
          </div>
        </section>
      </main>
    </InfoPageLayout>
  );
}
