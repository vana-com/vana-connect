# Contributing to @opendatalabs/connect

## Getting Started

```bash
git clone https://github.com/vana-com/vana-connect.git
cd vana-connect
npm install
npm run build
npm test
```

## Development

- `npm run build` — Compile TypeScript
- `npm test` — Run unit tests
- `npm run test:e2e` — Run E2E tests (requires env vars)
- `npm run lint` — Type-check
- `npm run lint:eslint` — Lint with ESLint
- `npm run format` — Format with Prettier
- `npm run validate` — Run all checks

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
