# CLI Install Path Research

_As of March 13, 2026_

## Question

What do best-in-class CLI install paths look like, and should `vana` require something like `pnpm` or `npx`?

## Short answer

- Requiring `pnpm` is **not** best-in-class for a general-purpose CLI.
- Requiring `npx` is **better as a temporary bridge**, but still not ideal as the final public install path.
- The best install stories usually avoid tying the user to a language-specific package manager unless the CLI is clearly aimed at that ecosystem.

## What the strongest references suggest

### `uv`

`uv` is a strong reference because it offers direct installation methods rather than assuming a Python package manager. The installation story is product-native and low-friction.

Source:

- https://docs.astral.sh/uv/getting-started/installation/

### GitHub CLI (`gh`)

`gh` is a strong reference because it is installable through standard OS package channels like Homebrew, apt, yum/dnf, winget, and Scoop. It does not expect users to already have a language-specific toolchain.

Source:

- https://cli.github.com/manual/installation

### Doppler CLI

Doppler follows a similar pattern: install through standard package manager channels and shell-friendly instructions.

Source:

- https://docs.doppler.com/docs/install-cli

### Vercel CLI

Vercel is the main counterexample. Its audience is heavily JavaScript-centric, so an npm-based install path is acceptable. Even there, that works because the product is already aimed at developers who almost certainly have Node.

Source:

- https://vercel.com/docs/cli

## Implication for `vana`

`vana` is not purely a JavaScript-developer tool.

It is meant to work for:

- coding agents
- vibe coders
- developers outside the JS ecosystem
- eventually users who may not think in terms of Node/npm/pnpm at all

That means:

- `pnpm` should **not** be a required prerequisite for the public install path
- `npx` is acceptable for canary/internal/early-adopter usage
- the final public install story should likely be one or more of:
  - standalone shell installer
  - Homebrew
  - winget
  - maybe Scoop
  - direct binary or installer downloads

## Current recommendation

### Short-term

Use:

```bash
npx -y @opendatalabs/connect@canary
```

Why:

- no `pnpm` prerequisite
- works today
- good enough for internal and agent-driven testing

### Long-term

Aim for a primary install story that does **not** require Node package-manager literacy.

The likely quality bar is:

- primary: OS-native / shell-native install
- secondary: npm/npx for JS-heavy workflows
- tertiary: canary/nightly channel for pre-release testing

## Conclusion

`npx` is a good bridge.

It is **better than `pnpm`** for the current stage because it removes one unnecessary prerequisite.

But if `vana` is meant to be truly best-in-class, the final install story should not depend on users already identifying as Node developers.
