# Contributing to Kazedesk

Thank you for taking the time to contribute. Bug reports, focused improvements, and documentation updates are all appreciated.

## Before you start

- Read the [Code of Conduct](./CODE_OF_CONDUCT.md).
- Search existing issues and pull requests to avoid duplicating work.
- For a substantial change, open an issue first to discuss the problem and proposed direction.
- For security reports, use the private reporting guidance in [SECURITY.md](./SECURITY.md).

## Development setup

1. Install Node.js 22.12 or later (or 20.19 or later).
2. Clone the repository and install dependencies:

   ```bash
   git clone <repository-url>
   cd kazedesk
   npm ci
   ```

3. Start the local development server:

   ```bash
   npm run dev
   ```

4. Open the Vite URL shown in the terminal. The workspace is available at `/dashboard`.

## Making a change

- Keep changes focused and consistent with the existing React, CSS, and JavaScript patterns.
- Preserve existing local data when changing storage formats. Include a migration when a persisted key or shape must change.
- Keep browser-only capabilities optional and provide a useful state when permission or an external service is unavailable.
- Avoid adding dependencies when the platform or existing packages already meet the need.
- Update the README or architecture documentation when user-facing behavior or project structure changes.
- Do not include generated output, `node_modules`, credentials, or personal data in a pull request.

## Checks

Run these commands before opening a pull request:

```bash
npm run lint
npm test
npm run build
```

Describe any checks you could not run and why.

## Pull requests

- Use a clear title that describes the change.
- Explain the user problem, the approach, and any trade-offs.
- Include steps to verify the change. Add screenshots or a short recording for visible UI changes.
- Mention related issues and user-visible behavior changes.
- Keep unrelated refactors out of the pull request.

The maintainers may request changes before merging. By contributing, you agree that your contributions are provided under the [MIT License](./LICENSE).
