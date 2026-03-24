# AI Horde Frontend

The homepage for [AI Horde](https://aihorde.net/), a community-driven distributed cluster for generating images and text using open-source AI models.

Built with **Angular 21** and **Tailwind CSS 4**.

## Prerequisites

- **Node.js 24** — managed via [NVM for Windows](https://github.com/coreybutler/nvm-windows) or [nvm](https://github.com/nvm-sh/nvm)
- **Angular CLI** — globally installed for development convenience (`npm install -g @angular/cli`)

```bash
# Windows (We recommend nvm-windows for ease of use)
nvm install 24.12.0
nvm use 24.12.0

# Verify
node -v  # Should output v24.x

npm install -g @angular/cli
```

## Getting Started

```bash
# Install dependencies
npm ci

# Start development server (port 4209)
npm start
```

Navigate to `http://localhost:4209/`. The app will hot-reload on file changes.

## Scripts

| Command                            | Description                      |
| ---------------------------------- | -------------------------------- |
| `npm start`                        | Development server on port 4209  |
| `npm test`                         | Run unit tests (Karma + Jasmine) |
| `npm run build`                    | Production build with SSR        |
| `npm run serve:ssr:AiHordeWebsite` | Serve the SSR build locally      |

## SSR Host Allowlist (Security)

Angular SSR validates request hostnames to reduce SSRF risk. Configure allowed hosts with the `NG_ALLOWED_HOSTS` environment variable.

- Local machine (LAN testing included):

```bash
# Linux/macOS
export NG_ALLOWED_HOSTS="localhost,127.0.0.1,::1,192.168.1.7"
npm run serve:ssr:AiHordeWebsite
```

```powershell
# Windows PowerShell
$env:NG_ALLOWED_HOSTS="localhost,127.0.0.1,::1,192.168.1.7"
npm run serve:ssr:AiHordeWebsite
```

- Docker runtime override:

```bash
docker run -e NG_ALLOWED_HOSTS="localhost,127.0.0.1,::1,192.168.1.7,app.example.com" -p 8006:8006 aihorde-frontpage:latest
```

- Production behind reverse proxy:

```text
NG_ALLOWED_HOSTS=app.example.com,www.example.com
```

Only include hostnames and IPs that should legitimately reach your app. See the [angular docs on ssrf security](https://angular.dev/best-practices/security#preventing-server-side-request-forgery-ssrf) for more details.

## Project Structure

```bash
src/
├── app/
│   ├── components/       # Standalone Angular components
│   ├── pages/            # Route-level page components
│   ├── services/         # Injectable services (API, auth, theme, etc.)
│   ├── guards/           # Route guards
│   ├── pipes/            # Custom pipes
│   ├── directives/       # Custom directives
│   ├── types/            # TypeScript interfaces and types
│   ├── helper/           # Utility functions
│   ├── app.routes.ts     # Route definitions
│   └── app.config.ts     # App providers and configuration
├── assets/
│   ├── i18n/             # Transloco translation files
│   ├── img/              # Static images
│   └── data/             # Static data files
├── styles/               # All CSS (centralized, not in components)
│   ├── _theme.css        # Design tokens via @theme
│   ├── _base.css         # Element defaults and keyframes
│   └── _*.css            # Component and page-specific styles
└── environments/         # Environment configs
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical overview including route tables, service inventory, and data flow.

## Styling

All styles are centralized in `src/styles/`. This project does not use component-level css files.

- [STYLING.md](STYLING.md) — Conventions, file organization, quick reference
- [docs/design-system.md](docs/design-system.md) — Design tokens, surface primitives, glass system, color system
- [docs/component-patterns.md](docs/component-patterns.md) — Full CSS class catalog

## API

The frontend consumes the AI Horde API at `https://aihorde.net/api/v2/`. Service layer is in `src/app/services/`, with `HordeApiCacheService` providing TTL-based caching for all API calls.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development conventions, code standards, and PR guidelines.

## License

Code is licensed under the [AGPL-3.0 License](LICENSE). See the LICENSE file for details.

This is a relicense of the [original code](https://github.com/RikudouSage/AiHordeFrontpage) (prior to commit 0a58cdde78410e208f7d5e0321ea3ddcda996c38) is licensed under the MIT License. See [original LICENSE](https://github.com/RikudouSage/AiHordeFrontpage/blob/master/LICENSE) for details.
