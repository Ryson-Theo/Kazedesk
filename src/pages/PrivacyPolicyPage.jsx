import { LANDING_LINKS } from "../components/landing/landingLinks";
import InfoPageLayout from "../components/landing/InfoPageLayout";

export default function PrivacyPolicyPage() {
  return (
    <InfoPageLayout pageTitle="Privacy policy">
      <main className="site-info-main">
        <article className="site-info-shell privacy-policy">
          <p className="site-info-kicker">Your work stays yours</p>
          <h1 className="site-info-title">Privacy policy</h1>
          <p className="site-info-lede">
            Kazedesk is a browser-based workspace. Your notes, tasks, and settings are kept in your browser unless you choose to use an external service.
          </p>
          <p className="site-info-updated">Last updated November 12, 2026</p>

          <div className="site-info-sections">
            <section className="site-info-section" aria-labelledby="privacy-local">
              <h2 id="privacy-local">What stays in your browser</h2>
              <p>
                Kazedesk does not require an account or send your workspace to a Kazedesk server. Tasks, notes, boards, preferences, timer history, playlist settings, and dashboard analytics activity are saved in this browser. Note Wall attachments are stored in the browser’s IndexedDB; Kazedesk does not send this activity to an analytics service.
              </p>
              <p>
                Browser storage is not encrypted by Kazedesk. Anyone with access to your browser profile may be able to access its saved data. You can remove local data by clearing this site’s browser storage. Downloaded exports and files saved elsewhere need to be removed separately.
              </p>
            </section>

            <section className="site-info-section" aria-labelledby="privacy-services">
              <h2 id="privacy-services">When information goes to other services</h2>
              <ul>
                <li>
                  <strong>GitHub:</strong> The landing page requests public release and contributor information from GitHub.
                </li>
                <li>
                  <strong>Open-Meteo:</strong> If you use weather, the city you enter is sent to its geocoding service and the resulting coordinates are used to request a forecast. Kazedesk does not request device geolocation.
                </li>
                <li>
                  <strong>YouTube:</strong> When a playlist is configured in your dashboard, Kazedesk loads YouTube’s IFrame Player API to embed it. The optional landing-page trailer uses YouTube’s privacy-enhanced embed.
                </li>
                <li>
                  <strong>Google Fonts:</strong> The site requests font files from Google Fonts.
                </li>
                <li>
                  <strong>Web clips:</strong> When you fetch a link’s details, your browser requests the address you provide without sending browser credentials or a referrer. The resulting metadata is saved in your browser.
                </li>
              </ul>
              <p>
                These providers receive normal network information needed to serve their requests and handle it under their own privacy policies. External videos, links, and images may also connect to their host when you view or open them.
              </p>
            </section>

            <section className="site-info-section" aria-labelledby="privacy-exports">
              <h2 id="privacy-exports">Backups and manual uploads</h2>
              <p>
                Dashboard Settings and the main sticky-note wall export JSON without attachment file contents. Those JSON exports store references that resolve only while the matching files remain in this browser's IndexedDB. Custom boards also support JSON references and ZIP backups; board ZIPs include media files and can be restored after browser data is cleared. Kazedesk does not connect to Google Drive or upload your data. Any upload to Drive or another provider is initiated by you and handled under that provider's policies.
              </p>
            </section>

            <section className="site-info-section" aria-labelledby="privacy-control">
              <h2 id="privacy-control">Your choices</h2>
              <p>
                Weather and YouTube features can be left unused. You can clear Kazedesk’s browser storage at any time. Downloaded backups and copies you manually upload to another service must be deleted from those locations separately.
              </p>
            </section>

            <section className="site-info-section" aria-labelledby="privacy-contact">
              <h2 id="privacy-contact">Questions</h2>
              <p>
                For privacy questions or requests, contact the project through the{" "}
                <a href={`${LANDING_LINKS.github}/issues`} target="_blank" rel="noopener noreferrer">
                  Kazedesk GitHub repository
                </a>. Please do not include personal or sensitive information in a public issue.
              </p>
            </section>
          </div>
        </article>
      </main>
    </InfoPageLayout>
  );
}
