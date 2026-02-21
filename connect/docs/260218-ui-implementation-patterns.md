# Connect UI Implementation Patterns

This doc captures practical UI implementation patterns from the current `connect` app.
It is based on what is actually used in `src/app`, not just what exists in `src/components`.

## Scope

- App shell and page composition
- Form and state layout patterns
- Typography and spacing conventions
- What to avoid when adding new routes

## Core Page Composition

All page routes in `src/app` follow the same outer structure:

1. `PageShell` for viewport-level framing and background
2. `PagePanel` for centered content container
3. State-based render blocks inside the panel

Canonical structure:

```tsx
<PageShell showBackButton={false}>
  <PagePanel>{/* loading | success | error | form */}</PagePanel>
</PageShell>
```

Use `showBackButton={false}` for flow-owned pages (`/grants`, `/connect`, `/login`, `/connect-preview`) and enable only where backward navigation is explicitly part of UX.

## State-Driven Rendering Pattern

Routes use explicit view states and render per-state sections inline.

- Prefer explicit union states, e.g. `"form" | "result"` or `"loading" | "ready" | "error"`
- Keep each state block visually self-contained
- Use shared skeleton for loading/error states:
  - `flex flex-1 flex-col items-center justify-center gap-4 text-center`
  - `<Spinner boxSize={32} className="text-iris" />`
  - `<Text intent="small" color="mutedForeground">...`

## Form Row Pattern (Used in Auth)

For icon + input + action button rows, the established pattern is from `EmailEntryForm`:

- Container uses `fieldVariants({ variant: "outline", size: "lg" })`
- Add `group` + `stateFocusWithin` for unified focus styling
- Left icon in `size-tab` slot
- Input is borderless/transparent inside the wrapper
- Right action is `Button` with `variant="ghost"` and `size="icon"`

This is preferred over ad-hoc wrappers and raw border classes.

## Typography Conventions

Use `Text` for almost all copy:

- Page title: `<Text as="h1" intent="title">`
- Section headline: `<Text as="h2" intent="title">` or `intent="xlarge"`
- Body copy: default `Text` / `intent="body"`
- Secondary copy: `dim` or `color="mutedForeground"`
- Error copy: `color="destructive"`
- Pre/code blocks: `Text as="pre" pre`

Avoid mixing custom span typography when `Text` can express the same intent.

## Spacing and Tokens

Use app spacing tokens already present across pages:

- `space-y-small` for top-level stack
- `space-y-gap` for grouped sub-sections
- `space-y-w6` for intro/copy clusters in auth pages
- `p-small` for internal panel-ish blocks
- `rounded-button` for inner containers to match system radius

Avoid random scale substitutions unless there is a clear visual reason.

## Actions and Buttons

Use shared button primitives:

- Primary emphasis: `variant="iris"`
- Secondary/utility: `variant="outline"`
- Inline action suffix buttons in field rows: `variant="ghost"` + `size="icon"`

Do not introduce raw `<button>` styles when `Button` already covers the behavior.

## Practical Do / Don’t

Do:

- Compose with `PageShell` + `PagePanel`
- Keep route UIs state-based and explicit
- Reuse auth field-row pattern for URL/email-like input rows
- Use `Text` intents and color props for hierarchy
- Keep spacing on existing semantic tokens

Don’t:

- Introduce unused primitives as a style mandate for page work
- Build custom card/badge systems if current routes do not use them
- Mix bespoke Tailwind typography when `Text` already models it
- Hardcode one-off color blocks when semantic text color is sufficient

## Applied Example: `/admin`

The `/admin` route now follows this guidance:

- Two explicit states: `form` and `result`
- Form row uses auth-style `fieldVariants` wrapper with icon + URL input + icon submit
- Result state uses tokenized spacing, `Text` hierarchy, copy action via `Button`
- Env payload rendered with `Text as="pre" pre`
- Minimal bespoke styling, aligned with current route patterns

## Decision Rule for New UI Work

When building a new route:

1. Check `src/app` for currently used composition/state/layout patterns
2. Reuse primitives proven in those routes
3. Only introduce additional primitives when there is a concrete repeated need
4. If introducing a new pattern, add one focused doc in `connect/docs` with rationale
