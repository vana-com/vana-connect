# CLI transcripts

These files are generated review artifacts for the human-mode CLI.

They are not a replacement for tests. They exist to make visual and copy review
faster between release pushes.

For a single index of the whole CLI review surface, use
[CLI-REVIEW-SURFACE.md](/home/tnunamak/code/vana-connect-cli-pr/docs/CLI-REVIEW-SURFACE.md).

Refresh them with:

```bash
pnpm demo:vhs:fixtures
pnpm demo:transcripts
```

Current generated surfaces include:

- `help.txt`
- `data-help.txt`
- `status.txt`
- `doctor.txt`
- `logs.txt`
- `setup.txt`
- `sources.txt`
- `data-list.txt`
- `data-list-empty.txt`
- `data-show-github.txt`
- `data-show-github-missing.txt`
- `data-path-github.txt`
- `connect-github-success.txt`
- `connect-github-no-input.txt`
- `connect-github-session-reuse-no-input.txt`
- `connect-shop.txt`
- `connect-shop-no-input.txt`
- `connect-steam.txt`
- `connect-steam-no-input.txt`
