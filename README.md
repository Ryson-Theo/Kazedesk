# Kazedesk

**Make room for deep focus.** Kazedesk is a calm, customizable productivity workspace for focus sessions, tasks, notes, and music. It runs in the browser and stores personal workspace data locally on the device.

<p align="center">
  <img src="./public/kazedesk.svg" alt="Kazedesk logo with Pip, the animated blue-crested bird" width="360" />
</p>

> **Project status:** actively evolving. Features, screenshots, and behavior may change as the project develops.

## Features

### A calmer workspace

- Arrange and resize dashboard widgets around your focus.
- Stay on track with a configurable focus timer, tasks, reminders, and nested subtasks.
- Keep quick notes close with folders, tags, and saved dashboard layouts.

### Space for your ideas

- Create independent note-wall boards, each with its own notes, tasks, files, links, and layout.
- Write notes in Markdown; pin links, clip web pages, and connect related ideas.
- Record voice notes with a live waveform, review playback, and discard or add recordings to the board. Audio nodes include seek and playback-speed controls.
- Pan, zoom, filter, and tidy your wall. Changes save locally, with undo and redo.
- Export walls as PNG, PDF, Markdown, or JSON. Optional private Google Drive saves are available.

### The details that make it yours

- Review focus-session analytics and local time and weather.
- Play public YouTube playlists.
- Choose your look, and add ambient visuals with optional system-audio mode.
- Import or export your workspace.

## Screenshots

| Screenshot | Description |
| --- | --- |
| <img src="./src/assets/screenshots/most%20of%20the%20widgets%20in%20dashboard.png" alt="Kazedesk dashboard with focus timer, weather, tasks, analytics, notes, and ambient controls" width="420" /> | **A complete focus workspace.** Arrange your timer, weather, task list, analytics, and notes around a customizable background. |
| <img src="./src/assets/screenshots/dashboard%20with%20only%20timer%20and%20weather%20other%20widgets%20hidden.png" alt="Kazedesk dashboard showing only the focus timer and weather widget" width="420" /> | **Keep the essentials in view.** Minimize other widgets to create a quieter workspace with just the timer and local time and weather. |
| <img src="./src/assets/screenshots/YT%20settings.png" alt="Kazedesk settings with YouTube playlist management" width="420" /> | **Personalize your setup.** Manage YouTube playlists and adjust workspace preferences from dashboard settings. |

## How it works

Kazedesk is a static, client-side React app. Workspace data stays in the current browser by default. Weather lookup and embedded media contact external services; optional Google Drive saves send a private JSON copy of a note wall to the signed-in user's Drive.

```mermaid
flowchart LR
    Source["React + Vite source"] --> Build["Production build · dist/"]
    Build --> Host["Static host / CDN"]
    Visitor --> Browser
    Host --> Browser
    Browser --> Routes["Landing page, dashboard, or note wall"]
    Routes --> Widgets["Dashboard widgets"]
    Routes --> Wall["Dashboard note wall"]
    Routes --> BoardManager["Independent board manager"]
    BoardManager --> Board["Independent board"]
    Widgets <--> LocalStorage[(Browser localStorage)]
    Wall <--> LocalStorage
    Board <--> LocalStorage
    Board --> IndexedDB[(Attachment files in IndexedDB)]
    Widgets --> Weather["Open-Meteo"]
    Widgets --> Media["YouTube and hosted media"]
    Wall -. Optional private save .-> Drive["Google Drive"]
    Board -. Optional private save .-> Drive
```

## Getting started

### Requirements

- Node.js 22.12 or later (or Node.js 20.19 or later).
- npm, included with Node.js.

### Install and run

```bash
git clone https://github.com/Ryson-Theo/Kazedesk.git
cd kazedesk
npm ci
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). The landing page is at `/`, the workspace is at `/dashboard`, and its connected sticky-note wall is at `/wall`. Manage independent named boards at `/wall/boards` and open an individual board at `/wall/boards/:boardId`. The dashboard wall and independent boards keep their notes and tasks separate.

### Optional Google Drive saves

The dashboard wall and independent boards can each save a JSON copy to the signed-in user's Google Drive. To enable it, create a Google OAuth web client, enable the Google Drive API for its Google Cloud project, add your development/deployed origins as authorized JavaScript origins, and copy `.env.example` to `.env.local` with the client ID. The browser app requests the `drive.file` scope and creates a private file; it does not make the file public or store OAuth access tokens in local storage. Drive saves require the user to authorize the app and are subject to Google's quotas and policies. Attachment files remain in this browser and are not included in wall exports or Drive JSON saves. Without Drive setup, local autosave and downloadable exports continue to work.

### Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Create a production build in `dist/`. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run Oxlint on the project. |
| `npm test` | Run the automated component and behavior tests. |

## Deploying

Kazedesk is a client-side React application and can be deployed to a static hosting provider. Connect the repository to a provider such as Cloudflare Pages, Netlify, or Vercel and configure:

- **Build command:** `npm run build`
- **Output directory:** `dist`

For Cloudflare Pages deployments without API tokens, connect the GitHub repository through the Cloudflare dashboard's **Workers & Pages** Git integration. Set the production branch to `main`, the build command to `npm run build`, and the output directory to `dist`. Once connected, pushes to `main` deploy automatically. The GitHub Actions workflow in this repository runs CI checks only; it does not publish the site.

Configure the host to serve `index.html` for application routes such as `/dashboard` (SPA fallback). A root-domain deployment works with the default Vite configuration. If deploying beneath a repository subpath, configure Vite's `base` option and the router's basename for that path.

Docker is not required for the current static application. See [ARCHITECTURE.md](./ARCHITECTURE.md) for its runtime boundaries and deployment considerations.

## Privacy and browser capabilities

Kazedesk has no application server or account system. Settings, tasks, notes, board definitions, tags, wall positions/sizes/connections, layouts, playlists, and analytics are stored in the browser's `localStorage` for the current origin. Note-wall attachment file contents, including voice recordings, are stored separately in browser `IndexedDB` after you add them to a board. Recording requires browser microphone permission and is available on secure origins such as HTTPS or localhost. Recordings can be previewed or discarded before saving to the board. This data does not automatically sync between browsers or devices. Clearing site data removes it; use the workspace backup feature or export the wall before changing browsers or devices. Google Drive saves are optional private JSON copies; downloadable PNG, print-to-PDF, Markdown, and JSON wall exports are also available. Attachment file contents are not included in those wall exports or Drive saves.

The weather widget sends the configured city to Open-Meteo for geocoding and weather data, with an attribution link beside displayed weather. City lookups are cached in the browser for 30 days and forecasts for four hours. To limit accidental repeat requests, each browser profile allows up to three city lookups and six forecast requests per UTC day, with a short cooldown between same-type requests. These client-side limits can be cleared or bypassed and are not a shared quota or security boundary. Open-Meteo's free API is for non-commercial use and has daily and short-term request limits; check its [terms](https://open-meteo.com/en/terms) before launch. A shared edge cache or backend and an appropriate API plan are needed to enforce limits across visitors or support commercial use. YouTube embeds and externally hosted landing-page media may also connect to their respective providers when used. Review those providers' privacy policies if this matters to your use.

System-audio visualization depends on browser support for screen capture and audio sharing, and generally requires HTTPS or localhost. It is optional; simulated visualization does not capture audio.

## Contributing

Contributions are welcome. Visit the [GitHub repository](https://github.com/Ryson-Theo/Kazedesk) to contribute, and start with [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, quality checks, and pull request guidance. Please read the [Code of Conduct](./CODE_OF_CONDUCT.md) before participating.

To report a vulnerability, follow [SECURITY.md](./SECURITY.md) rather than opening a public issue.

## License

Kazedesk is distributed under the [MIT License](./LICENSE).

## Maintainer

<table align="center">
  <tr>
    <td align="center">
      <a href="https://github.com/Ryson-Theo">
        <img src="https://github.com/Ryson-Theo.png?size=120" width="96" alt="Ribin K Roy's GitHub profile" />
        <br />
        <strong>Ribin K Roy</strong>
      </a>
      <br />
      Project creator
      <br />
      <a href="https://ribin-portfolio.vercel.app/">Portfolio</a>
      ·
      <a href="https://github.com/Ryson-Theo">GitHub</a>
    </td>
  </tr>
</table>
