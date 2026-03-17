# Temporal & Freshness UX in CLIs

_As of March 16, 2026_

## Which CLIs Show Time by Default?

| Tool                 | What              | Format                              | Default? |
| -------------------- | ----------------- | ----------------------------------- | -------- |
| **kubectl get pods** | AGE column        | Relative compact: `2d`, `3h`, `5m`  | Yes      |
| **docker ps**        | CREATED column    | Relative natural: `2 days ago`      | Yes      |
| **gh run list**      | AGE column        | Relative compact: `2h`              | Yes      |
| **ls -l**            | Modification time | Adaptive (see below)                | Yes      |
| **restic snapshots** | Timestamp         | Absolute ISO: `2018-02-22 12:59:30` | Yes      |
| **git log**          | Date              | Requires `--date=relative` flag     | No       |
| **npm list**         | None              | --                                  | No       |
| **brew list**        | None              | --                                  | No       |

## Time Format Patterns

### Relative Compact (kubectl, gh)

```
NAME                    READY  STATUS   AGE
nginx-deployment-66b6   1/1    Running  2d
nginx-deployment-abc1   0/1    Pending  5m
```

Best for: status dashboards, monitoring. Instantly scannable.

### Relative Natural (docker)

```
CONTAINER ID  IMAGE         STATUS         CREATED
a1b2c3d4e5    nginx:latest  Up 2 hours     2 days ago
```

Best for: occasional use. More readable but takes more space.

### Adaptive (ls -l)

```
-rw-r--r-- 1 user group 1024 Mar 30 23:45 recent-file.txt
-rw-r--r-- 1 user group 2048 Mar 30  2024 old-file.txt
```

Recent files show time, old files show year. Avoids wasting precision on ancient items.

### Absolute ISO (restic, rclone)

```
ID        Date                 Host  Directory
9ba42540  2018-02-22 12:59:30  hwkb  /
```

Best for: logs, audit trails. Unambiguous but requires mental math for recency.

## Visual Hierarchy

Consistent patterns across CLIs:

- Time is **rightmost column** (supporting metadata, not the headline)
- **Right-aligned** for scannability, even for variable-width text
- **No color or dimming** in most CLI tools (unlike web UIs)
- Never the primary identifier -- always secondary to name/status

## Periodic Tasks & Frequency Metadata

**Healthchecks.io** is the best model for "last run + expected frequency":

```
Check         Status  Last Ping        Period
backup-db     Up      3 minutes ago    every 1 hour
sync-files    Late    2 hours ago      every 30 min
cleanup       Down    3 days ago       every 1 hour
```

Shows: status derived from (last run vs expected period), not just the timestamp.

No other CLI tool studied combines "last occurrence" with "expected frequency" in default output. This is an opportunity for the vana CLI.

## Anti-Patterns

| Problem              | Example                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| Excessive precision  | rclone showing nanoseconds: `18:55:41.062626927`                          |
| Format inconsistency | gh uses relative in tables, absolute in JSON                              |
| Hidden by default    | git log requiring `--date=relative` flag                                  |
| Missing entirely     | npm/brew showing no temporal data in list output                          |
| No frequency context | Showing "last run: 5 hours ago" without indicating whether that's healthy |

## Recommendations for Vana CLI

### Status Output (Human)

```
Sources:
  github      synced    3 days ago   weekly recommended
  spotify     synced    12 hours ago daily recommended
  chatgpt     synced    2 weeks ago  weekly recommended  (overdue)
```

Use relative time (kubectl-style). Show frequency only when defined. Derive "overdue" from (elapsed > frequency).

### Status Output (JSON, for agents)

```json
{
  "source": "github",
  "lastCollectedAt": "2026-03-13T14:30:00Z",
  "exportFrequency": "weekly",
  "suggestedNextCollectionAt": "2026-03-20T14:30:00Z",
  "isOverdue": false
}
```

### Where Freshness Should Surface

| Context                 | Show?   | What                                             |
| ----------------------- | ------- | ------------------------------------------------ |
| `vana status`           | Yes     | Relative time + frequency + overdue flag         |
| `vana sources list`     | Minimal | Last collected relative time only                |
| `vana sources info <x>` | Full    | Absolute + relative + frequency + next suggested |
| `vana connect <x>`      | No      | Command is action-focused, not informational     |
| `--json` everywhere     | Yes     | ISO timestamps + frequency + computed fields     |

### Design Principles

1. Default to relative time for humans, absolute ISO for machines
2. Compact format (`3d`) over natural language (`3 days ago`) in tables
3. Show frequency context alongside timestamps -- bare timestamps are ambiguous
4. Right-align temporal columns, keep them rightmost
5. Never show sub-second precision in human output
