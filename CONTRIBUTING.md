# Contributing to @opendatalabs/connect

## Getting Started

```bash
git clone https://github.com/vana-com/vana-connect.git
cd vana-connect
pnpm install
pnpm build
pnpm test
```

## Package Manager

- Use `pnpm` as the package manager for this repository (including the `connect` app).
- Prefer `pnpm install` and `pnpm <script>` commands for local development.

## Workspace Install Rules

- Install dependencies for `connect` from repo root with filtering:
  - `pnpm --filter connect add <package>`
  - `pnpm --filter connect add -D <package>`
- Install dependencies for the root package (`@opendatalabs/connect`) with:
  - `pnpm -w add <package>`
  - `pnpm -w add -D <package>`
- Running `pnpm add` inside `connect/` also works, but root + `--filter` is the default convention.
- Keep lockfile changes at the workspace root (`pnpm-lock.yaml`).

## Development

- `pnpm build` — Compile TypeScript
- `pnpm test` — Run unit tests
- `pnpm test:e2e` — Run E2E tests (requires env vars)
- `pnpm lint` — Type-check
- `pnpm lint:eslint` — Lint with ESLint
- `pnpm format` — Format with Prettier
- `pnpm validate` — Run all checks

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Commit messages are validated by commitlint.

```
feat: add new feature
fix: resolve bug
docs: update documentation
chore: maintenance task
```

## Pull Requests

- PR titles must follow the conventional commit format
- All CI checks must pass before merging
- Keep changes focused and incremental
