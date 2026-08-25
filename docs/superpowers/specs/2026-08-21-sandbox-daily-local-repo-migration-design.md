# Sandbox Daily Local Repository Migration Design

**Date:** 2026-08-21

**Status:** Approved architecture; migration pending

**Owner:** SanSan

## Problem

The always-on Sandbox Daily operator server intermittently returns HTTP 500 for
`/admin/radar` and `/review`. Both Turbopack and webpack fail while reading
ordinary Next.js files with macOS error `-11` (`Resource deadlock avoided`).

The repository currently lives under the iCloud-managed Desktop File Provider.
Inspection found:

- 2,886 dataless placeholder files in the repository;
- 2,537 dataless files inside `node_modules`;
- 81 dataless files inside `.next`;
- the exact webpack module that failed was marked `compressed,dataless`;
- the repository folder reports `isKeepDownloaded=0` and
  `isRecursivelyDownloaded=0`;
- File Provider reports that the iCloud account lacks upload quota.

Restarting Next, replacing the Turbopack cache, and switching to webpack did not
remove the underlying File Provider read failures. The development repository
must not live inside an evictable cloud-managed folder.

## Decision

Move the real repository to:

```text
/Users/sandboxsansan/Projects/sandbox-daily
```

Keep a compatibility symlink at the former path:

```text
/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily
  -> /Users/sandboxsansan/Projects/sandbox-daily
```

Launch agents and the VS Code workspace will use the real `~/Projects` path.
The symlink exists only to preserve old bookmarks and non-active references.

The operator server will continue using webpack mode. This avoids reintroducing
the persistent Turbopack database that amplified the original failure, while
removing File Provider is the actual root-cause fix.

## Migration Safety

The migration uses copy, verify, then cut over. It will not delete the current
repository.

1. Confirm the operator launch agent is stopped and the destination does not
   exist.
2. Copy the complete repository, including `.git`, dirty tracked files,
   untracked files, permissions, and file contents, to the destination. Reading
   the source during this copy materializes any dataless placeholders. Do not
   carry File Provider-only extended attributes or dataless flags into the
   destination.
3. Compare source and destination:
   - Git `HEAD`;
   - `git status --short`;
   - tracked-file checksums;
   - total file count;
   - dataless-file count at the destination (must be zero).
4. Rename the original directory to a timestamped rollback backup beside the
   old path.
5. Create the compatibility symlink at the old path.
6. Keep the rollback backup until the restored service and tests are verified.
   Do not delete it during this task.

If verification fails, stop the launch agents, remove the compatibility
symlink, rename the rollback directory to its original name, and restore the
old active configuration paths.

## Active Path Updates

Update only live configuration, not historical documentation:

- `scripts/operator-server.sh`: point `REPO` to `~/Projects/sandbox-daily`;
- `~/Library/LaunchAgents/com.sandboxdaily.operator-server.plist`: point to the
  wrapper at the new path;
- `~/Library/LaunchAgents/com.sandboxdaily.signals-keepalive.plist`: point to
  `keep-signals-warm.sh` at the new path;
- `~/brain/Kevals OS.code-workspace`: update the Sandbox Daily app folder to
  the new path.

The launch-agent labels, ports, log destinations, Tailscale proxy, pipeline
output paths, and public Vercel deployment remain unchanged.

## Service Cutover

1. Validate both launch-agent plists with `plutil`.
2. Bootstrap the signals keepalive job and the operator server from their
   updated plists.
3. Confirm launchd supervises `next dev --webpack --port 3000` from the new
   working tree.
4. Confirm no process uses the rollback path.

## Verification

From the real destination path:

- `npm run test:operator-server` passes;
- `npm run test:lib` passes;
- `npx eslint scripts/operator-server.test.ts` passes;
- `npx tsc --noEmit` passes;
- `/admin/radar` and `/review` return HTTP 200 locally;
- `/admin/radar` and `/review` return HTTP 200 through the Tailscale URL;
- repeated route requests do not add File Provider or error `-11` messages to
  the operator log;
- the destination contains zero dataless files.

Repository-wide lint currently has unrelated pre-existing failures in
`design-source` and other files. Those are outside this migration.

## Non-goals

- No dependency changes.
- No pipeline redesign.
- No public-site deployment.
- No deletion of the iCloud rollback copy or quarantined diagnostic artifacts.
- No rewriting of historical specs, plans, audits, backups, or chat history.

## Follow-up: the pipeline half (completed 2026-08-24)

The 2026-08-21 migration moved the app repository only. `~/Desktop/ssnn-outputs`
— the agent pipeline that feeds it — was left inside the iCloud File Provider
and failed the same way three days later.

Symptom: the event radar's last successful write was 2026-08-20 11:59. The
launchd loop kept cycling every 180 seconds and every agent died at process
start with errno `-11`, for roughly 480 cycles, without ever crashing the loop
or raising an alert.

Cause: identical. Boot disk at 94 percent, `optimize-storage` enabled, and
5,289 dataless files under `ssnn-outputs`.

Resolution: the same copy, verify, cut over procedure defined above.

- real tree: `/Users/sandboxsansan/Projects/ssnn-outputs`
- compatibility symlink: `/Users/sandboxsansan/Desktop/ssnn-outputs`
- rollback backup: `/Users/sandboxsansan/Desktop/ssnn-outputs.rollback-2026-08-24`

Two findings worth carrying forward:

1. `brctl download` does not materialize these files. It returns exit 0 and
   leaves the dataless count unchanged. Reading the file is what materializes
   it. A 16-way parallel read cleared 3,556 evictions in under ten minutes,
   against roughly 50 per minute for a serial `rsync`.
2. A single copy pass is not sufficient. The first `rsync` silently omitted
   four files under `articles/.processed/`, because the File Provider continues
   to mutate the source tree while it reconciles. Run the copy twice and
   compare the full path sets before cutting over.

Active path updates beyond those listed above: six launchd property lists, four
scripts in the pipeline tree, every agent's `src/config.ts`, and the app repo's
`src/lib/radar/paths.ts`, `src/lib/workflow/paths.ts`,
`src/lib/revision/paths.ts`, `scripts/radar-snapshot.mjs`,
`scripts/operator-server.sh`, `scripts/keep-signals-warm.sh` and
`scripts/operator-server.test.ts`.

Historical absolute paths recorded in `image-agent/image-state.json`,
`archive/*.archive.json` and `spotlight-references/*/manifest.json` were left
unchanged. Both compatibility symlinks keep them resolving.

**Status: migration complete.**
