# CLI Demo Guidelines

Design guidelines for the VHS terminal demo GIFs in `docs/vhs/`.

Based on research into what ships in production CLIs (Charm, Vercel, GitHub
CLI, Railway, Starship) and the practices of Charm.sh — the team that built VHS
specifically to solve this problem.

## Principles

1. **One concept per GIF.** Each GIF demonstrates a single command or flow.
2. **Script everything.** Never record live. Tape files ensure zero typos,
   consistent timing, and reproducibility across versions.
3. **Choreograph the timing.** The rhythm matters more than realism:
   - Type command at pleasant speed (50-100ms per keystroke)
   - Brief pause before Enter (500ms) so viewer reads the command
   - Hold on output long enough to absorb (2-3s short, 5s complex)
4. **Size the terminal to the content.** Tight framing, no wasted space. Cap
   height so text stays readable at display width. Let long output scroll
   naturally — the GIF loops.
5. **Visual polish.** Window chrome, rounded corners, and a consistent theme
   make demos feel like a product, not a screenshot.
6. **Hide the boring parts.** Use VHS `Hide`/`Show` to skip setup or cd
   commands. Start the visible recording at the interesting moment.
7. **Keep it short.** Aim for 5-15 seconds per GIF.
8. **Consistent branding.** Same theme, font, margin style across all demos.
   Each GIF should feel like part of a family.

## Standard tape settings

```tape
Set Shell "bash"
Set FontSize 22
Set Width 1200
Set Height 600
Set TypingSpeed 50ms
Set CursorBlink false
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set Padding 20
Set Margin 20
Set MarginFill "#7983FF"
Set BorderRadius 10
Set LoopOffset 50%
```

Adjust `Height` per demo to fit the expected output without excess whitespace.
Maximum recommended height: **700px**. If output exceeds that, let it scroll —
the GIF loops and the viewer catches it on replay.

## Timing recipe

```tape
Hide
# Any setup commands (cd, env, etc.)
Show

Type "vana status"
Sleep 500ms
Enter
Sleep 3s
```

| Moment                      | Duration |
| --------------------------- | -------- |
| After typing, before Enter  | 500ms    |
| Short output (< 15 lines)   | 2-3s     |
| Complex output (15+ lines)  | 4-5s     |
| Between commands (if multi) | 1-2s     |

Do **not** scale sleep proportionally to line count. Execution time and reading
time are different things.

## Display in markdown

Use `<img>` tags with explicit width for consistent sizing:

```html
<img src="vhs/status.gif" width="600" alt="vana status" />
```

Raw `![](...)` markdown gives the browser full control over sizing, which makes
tall GIFs render with tiny text.

## Regeneration

```bash
pnpm demo:vhs
```

The render script (`scripts/render-vhs.mjs`) handles fixture preparation,
environment variants, and ordering.

## Tool chain

- **VHS** (Charm) — scripted terminal recordings → GIF
- **Fixture system** — deterministic demo data in `docs/vhs/fixtures/`
- **Three environments**: seeded (has data), fresh (clean machine),
  seeded-input (has data but no fast-success shortcut)

## Sources

- [Charm "This is How We Do It"](https://charm.land/blog/100k/) — why they
  built VHS and their demo philosophy
- [VHS README](https://github.com/charmbracelet/vhs) — canonical settings
  reference
- [Gum examples](https://github.com/charmbracelet/gum) — reference tape files
  from Charm's own CLI tools
- [agg (asciinema GIF generator)](https://github.com/asciinema/agg) —
  alternative renderer defaults and theme guidance
