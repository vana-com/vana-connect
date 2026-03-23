## DataConnect Sync PR Failure

### Summary

The automation that should keep `connect/src/config/config.ts` aligned with the latest `vana-com/data-connect` release is not failing to detect releases. It is failing when trying to update the already-open sync PR branch.

At time of investigation:

- latest `vana-com/data-connect` release: `v0.7.32`
- `main` in this repo: `DOWNLOAD_VERSION = "0.7.29"`
- open sync PR: `#48`
- sync PR branch content: `DOWNLOAD_VERSION = "0.7.30"`

So the system created the first PR correctly, then got stuck and never advanced it to `0.7.31` or `0.7.32`.

### What Happened

The workflow responsible for this is `.github/workflows/sync-dataconnect-download-version.yml`.

Its old behavior:

1. resolve latest `data-connect` tag
2. update `connect/src/config/config.ts`
3. use `peter-evans/create-pull-request`
4. always target the fixed branch `chore/sync-dataconnect-download-version`

That works for initial PR creation, but once the branch already exists, `create-pull-request` tries to rewrite/reset that branch and push it with `--force-with-lease`.

### Root Cause

Repository branch rules reject force-pushes to `chore/sync-dataconnect-download-version`.

This is the exact failure from recent scheduled runs:

```text
remote: error: GH013: Repository rule violations found for refs/heads/chore/sync-dataconnect-download-version
remote: - Cannot force-push to this branch
! [remote rejected] chore/sync-dataconnect-download-version -> chore/sync-dataconnect-download-version (push declined due to repository rule violations)
```

So after PR `#48` was opened for `0.7.30`, every later scheduled run failed in the PR update step.

### Why The PR Is Stale

Because the workflow is stuck in this loop:

1. detect newer release
2. modify `config.ts`
3. attempt to update existing automation branch
4. force-push blocked by branch rules
5. workflow exits failure
6. open PR stays frozen at the old version

That is why an open PR still shows `0.7.30` while upstream is already at `0.7.32`.

### Local Fix Prepared

The local workflow change in `.github/workflows/sync-dataconnect-download-version.yml` removes the force-push dependency:

1. look for an existing open sync PR by title
2. if one exists, fetch its branch and commit on top of it
3. if none exists, create a fresh branch named `chore/sync-dataconnect-download-version-<tag>`
4. push with a normal `git push`
5. call `gh pr create` only when no sync PR already exists

This preserves the "one open sync PR" behavior without depending on a force update of a protected branch.

### Expected Result After Push

Once this change is pushed:

- the next scheduled/manual run should update the existing sync PR branch normally
- the stale PR should advance beyond `0.7.30`
- future runs should continue to move the PR forward as new `data-connect` releases appear
- if no PR is open, a new one will be created on a fresh per-tag branch

### Suggested PR Title

`fix(ci): stop DataConnect sync PR updates from failing on protected branches`

### Suggested PR Body

```md
## Summary

- fix the DataConnect download version sync workflow so it can update an existing PR without force-pushing
- add an incident note documenting why the sync PR got stuck at `0.7.30` while upstream reached `0.7.32`

## Test plan

- [ ] Run `Sync DataConnect Download Version` via `workflow_dispatch`
- [ ] Confirm an existing sync PR branch is updated with a normal push
- [ ] Confirm a new PR is created only when no sync PR is already open
- [ ] Confirm `connect/src/config/config.ts` matches the latest `vana-com/data-connect` release tag
```
