# AI Horde Frontend

The homepage for [AI Horde](https://aihorde.net/), a community-driven distributed cluster for generating images and text using open-source AI models.

Built with **Angular 22** and **Tailwind CSS 4**.

## Prerequisites

- **Node.js 24** — managed via [NVM for Windows](https://github.com/coreybutler/nvm-windows) or [nvm](https://github.com/nvm-sh/nvm)
- **Angular CLI** — globally installed for development convenience (`npm install -g @angular/cli`)

```bash
# Windows (We recommend nvm-windows for ease of use)
nvm install 24.22.2
nvm use 24.22.2

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

To test frontend and API changes together, start AI-Horde on port 7001 and use
the local configuration. This configuration points API traffic at the local
server and serves the on-disk evidence library:

```bash
npm start -- --configuration local
```

To drive a horde change that is deployed to the staging host but not yet to
production, serve the `devhorde` configuration. It is the development
configuration with API traffic pointed at `https://dev.aihorde.net`, which has
its own accounts and keys:

```bash
npm start -- --configuration devhorde
```

To open that studio from a phone or a second machine, serve the `lan`
configuration bound to the machine's address. It is the local configuration
with the API origin read off the page's own hostname, so requests reach the API
on the machine the page came from:

```bash
npm start -- --configuration lan --host <this-machine-ip>
```

The equivalent container build and launch are:

```bash
docker build --build-arg BUILD_CONFIG=local -t aihorde-frontpage:local .
docker run --rm -p 8006:8006 --name aihorde-frontpage-local aihorde-frontpage:local
```

Open `http://localhost:8006/`. The browser calls
`http://localhost:7001/api/v2`, so the API can run in its own container with
port 7001 published to the host.

## Scripts

| Command                            | Description                     |
| ---------------------------------- | ------------------------------- |
| `npm start`                        | Development server on port 4209 |
| `npm test`                         | Run unit tests with Vitest      |
| `npm run build`                    | Production build with SSR       |
| `npm run serve:ssr:AiHordeWebsite` | Serve the SSR build locally     |

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
│   │   └── docs/         # The /docs area: shells, homes, examples, settings entries
│   ├── content/          # Documentation content as data: flows, sections, settings, examples
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
├── shared/
│   └── design-system/    # Submodule: shared Horde tokens and primitives (glass and HD families)
├── styles.css            # The single import order for every stylesheet
├── styles/               # All CSS (centralized, not in components)
│   ├── _theme.css        # Project design tokens via @theme
│   ├── _base.css         # Element defaults and keyframes
│   ├── _models.css       # Models pages, the worked example of a page on the HD family
│   ├── _generate.css     # The /generate studio, scoped under .gen-studio
│   └── _*.css            # Component and page-specific styles
└── environments/         # Environment configs
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical overview including route tables, service inventory, and data flow.

## Styling

All styles are centralized in `src/styles/` and in the design-system submodule. This project does not use
component-level css files. New and rebuilt surfaces use the HD family (`.hd-*`, `--hd-*`); the glass family (`.btn`,
`.card`, `.surface-glass*`) is legacy and still draws most of the site.

- [STYLING.md](STYLING.md) — the two families and which to use, file tree, import order, idioms, anti-patterns
- [AGENTS.md](AGENTS.md) — the rules any change to this codebase has to follow, and the checks it has to pass
- [docs/design-system.md](docs/design-system.md) — frontpage-specific tokens, surfaces and form shells
- [docs/component-patterns.md](docs/component-patterns.md) — frontpage-specific CSS class catalog
- [docs/design-language.md](docs/design-language.md) — the studio's zones, identity hues and remaining idioms

## API

The frontend consumes the AI Horde API at `https://aihorde.net/api/v2/`. Service layer is in `src/app/services/`, with `HordeApiCacheService` providing TTL-based caching for all API calls.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development conventions, code standards, and PR guidelines.

## License

Code is licensed under the [AGPL-3.0 License](LICENSE). See the LICENSE file for details.

This is a relicense of the [original code](https://github.com/RikudouSage/AiHordeFrontpage) (prior to commit 0a58cdde78410e208f7d5e0321ea3ddcda996c38) is licensed under the MIT License. See [original LICENSE](https://github.com/RikudouSage/AiHordeFrontpage/blob/master/LICENSE) for details.
