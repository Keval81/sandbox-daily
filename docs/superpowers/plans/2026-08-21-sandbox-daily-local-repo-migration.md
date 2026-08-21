# Sandbox Daily Local Repository Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Sandbox Daily out of iCloud-managed Desktop storage, restore the local operator pages, and keep the old path as a rollback-safe compatibility symlink.

**Architecture:** Copy the complete dirty working tree to `/Users/sandboxsansan/Projects/sandbox-daily` without File Provider metadata, prove source and destination contents match, and only then cut over the filesystem and active configuration. Launchd continues to supervise the operator in webpack mode; the original repository is retained as a rollback directory throughout verification.

**Tech Stack:** macOS launchd, openrsync, Bash, Next.js 16, TypeScript, Node test runner, Tailscale Serve

**Spec:** `docs/superpowers/specs/2026-08-21-sandbox-daily-local-repo-migration-design.md`

## Global Constraints

- The real repository path is `/Users/sandboxsansan/Projects/sandbox-daily`.
- The compatibility path is `/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily`.
- The retained rollback path is `/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily.rollback-2026-08-21`.
- Preserve `.git`, all dirty tracked changes, all untracked files, permissions, and file contents.
- Do not preserve File Provider-only extended attributes or dataless flags.
- Do not delete the rollback repository or quarantined diagnostic artifacts during this work.
- Keep webpack mode, port `3000`, launch-agent labels, log paths, Tailscale proxy, and pipeline output paths unchanged.
- Add no dependencies and do not redesign the publishing pipeline.
- Do not rewrite historical documentation, backups, audits, or chat history.
- Repository-wide lint failures in `design-source` and other unrelated files are pre-existing and outside this migration.

## File Map

- `scripts/operator-server.sh`: use the real Projects repository and keep `next dev --webpack` as the supervised command.
- `scripts/operator-server.test.ts`: prove the wrapper targets the Projects path and both operator surfaces return HTTP 200 under webpack.
- `package.json`: retain the focused `test:operator-server` command already added with the wrapper test.
- `/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.operator-server.plist`: launch the wrapper from the Projects path.
- `/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.signals-keepalive.plist`: launch the signals script from the Projects path.
- `/Users/sandboxsansan/brain/Kevals OS.code-workspace`: make the active Sandbox Daily workspace folder use the Projects path.
- `/private/tmp/sandbox-daily-migration-2026-08-21/`: hold read-only comparison records; it is not part of either repository.

---

### Task 1: Copy and prove the working tree

**Files:**

- Create: `/Users/sandboxsansan/Projects/sandbox-daily/`
- Create: `/private/tmp/sandbox-daily-migration-2026-08-21/`
- Read: `/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily/`

**Interfaces:**

- Consumes: the stopped `com.sandboxdaily.operator-server` launch agent and the complete Desktop working tree.
- Produces: a content-equivalent Projects working tree with zero dataless files plus comparison records for the cutover gate.

- [ ] **Step 1: Prove all migration targets are unambiguous and unused**

Run:

```bash
test -d '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily'
test ! -L '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily'
test ! -e '/Users/sandboxsansan/Projects/sandbox-daily'
test ! -e '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily.rollback-2026-08-21'
test ! -e '/private/tmp/sandbox-daily-migration-2026-08-21'
if launchctl print gui/$(id -u)/com.sandboxdaily.operator-server >/dev/null 2>&1; then
  echo 'operator launch agent is still loaded' >&2
  exit 1
fi
test ! -e '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily/.git/index.lock'
```

Expected: every command exits `0`; the operator agent is not loaded.

- [ ] **Step 2: Capture the source baseline before copying**

Run:

```bash
mkdir '/private/tmp/sandbox-daily-migration-2026-08-21'
git -C '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily' rev-parse HEAD > '/private/tmp/sandbox-daily-migration-2026-08-21/source-head.txt'
git -C '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily' status --short --untracked-files=all > '/private/tmp/sandbox-daily-migration-2026-08-21/source-status.txt'
find '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily' -print | wc -l > '/private/tmp/sandbox-daily-migration-2026-08-21/source-file-count.txt'
find '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily' -flags +dataless -print > '/private/tmp/sandbox-daily-migration-2026-08-21/source-dataless-files.txt'
```

Expected: `source-head.txt` contains commit `b1f1b8e` or a later intentional commit; `source-status.txt` records all existing user and operator-server changes; `source-dataless-files.txt` is non-empty and documents the File Provider condition.

- [ ] **Step 3: Copy without File Provider extended attributes**

Run with approval because the destination is outside the current writable roots:

```bash
mkdir '/Users/sandboxsansan/Projects/sandbox-daily'
/usr/bin/rsync -a --itemize-changes --stats '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily/' '/Users/sandboxsansan/Projects/sandbox-daily/' > '/private/tmp/sandbox-daily-migration-2026-08-21/rsync-copy.txt'
```

Expected: rsync exits `0`. Do not add `--extended-attributes`; openrsync's `-a` preserves ordinary metadata but does not carry the File Provider extended attributes that created dataless placeholders.

- [ ] **Step 4: Verify Git identity and dirty state**

Run:

```bash
git -C '/Users/sandboxsansan/Projects/sandbox-daily' rev-parse HEAD > '/private/tmp/sandbox-daily-migration-2026-08-21/destination-head.txt'
git -C '/Users/sandboxsansan/Projects/sandbox-daily' status --short --untracked-files=all > '/private/tmp/sandbox-daily-migration-2026-08-21/destination-status.txt'
cmp '/private/tmp/sandbox-daily-migration-2026-08-21/source-head.txt' '/private/tmp/sandbox-daily-migration-2026-08-21/destination-head.txt'
cmp '/private/tmp/sandbox-daily-migration-2026-08-21/source-status.txt' '/private/tmp/sandbox-daily-migration-2026-08-21/destination-status.txt'
git -C '/Users/sandboxsansan/Projects/sandbox-daily' fsck --full
```

Expected: both `cmp` commands are silent and exit `0`; `git fsck --full` reports no repository corruption.

- [ ] **Step 5: Verify all file contents and counts**

Run:

```bash
/usr/bin/rsync -anrc --delete --itemize-changes '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily/' '/Users/sandboxsansan/Projects/sandbox-daily/' > '/private/tmp/sandbox-daily-migration-2026-08-21/rsync-content-diff.txt'
test ! -s '/private/tmp/sandbox-daily-migration-2026-08-21/rsync-content-diff.txt'
find '/Users/sandboxsansan/Projects/sandbox-daily' -print | wc -l > '/private/tmp/sandbox-daily-migration-2026-08-21/destination-file-count.txt'
cmp '/private/tmp/sandbox-daily-migration-2026-08-21/source-file-count.txt' '/private/tmp/sandbox-daily-migration-2026-08-21/destination-file-count.txt'
test "$(find '/Users/sandboxsansan/Projects/sandbox-daily' -flags +dataless -print | wc -l | tr -d ' ')" = '0'
```

Expected: checksum dry-run produces an empty diff, file counts match, and the destination dataless count is exactly `0`. Stop without cutting over if any assertion fails.

### Task 2: Lock the operator wrapper to the real path

**Files:**

- Modify: `/Users/sandboxsansan/Projects/sandbox-daily/scripts/operator-server.test.ts:10-14,85-103`
- Modify: `/Users/sandboxsansan/Projects/sandbox-daily/scripts/operator-server.sh:17-19,26`
- Verify: `/Users/sandboxsansan/Projects/sandbox-daily/package.json:11`

**Interfaces:**

- Consumes: the verified Projects working tree from Task 1.
- Produces: a regression-tested wrapper that starts webpack from `/Users/sandboxsansan/Projects/sandbox-daily` and a focused Git commit containing only the operator-server reliability changes.

- [ ] **Step 1: Add the failing repository-path assertion**

In `scripts/operator-server.test.ts`, add a path constant beside `logPath`:

```ts
const operatorScriptPath = "scripts/operator-server.sh";
```

Then add these lines at the start of the test callback, before reading `logOffset` or spawning the server:

```ts
const operatorScript = await readFile(operatorScriptPath, "utf8");
assert.match(operatorScript, /REPO="\$\{HOME\}\/Projects\/sandbox-daily"/);
```

- [ ] **Step 2: Run the focused test to prove the old path is rejected**

Run:

```bash
cd '/Users/sandboxsansan/Projects/sandbox-daily'
npm run test:operator-server
```

Expected: FAIL at the new `assert.match` because the wrapper still contains `Desktop/Sandbox Daily/sandbox-daily`; no test server is spawned.

- [ ] **Step 3: Point the wrapper at Projects and correct the stale comment**

Change the wrapper assignment to:

```bash
REPO="${HOME}/Projects/sandbox-daily"
```

Replace lines 17-19 with:

```bash
# bash, not zsh, with the script path passed as its own argv element. This keeps
# launchd invocation predictable and avoids shell parsing around repository paths.
```

Keep the final command exactly:

```bash
exec npm run dev -- --webpack --port "$PORT" >> "$LOG" 2>&1
```

- [ ] **Step 4: Run the focused test to prove both routes start from Projects**

Run:

```bash
cd '/Users/sandboxsansan/Projects/sandbox-daily'
npm run test:operator-server
```

Expected: PASS; `/review` and `/admin/radar` both return HTTP 200 on test port `3101`, and the appended log identifies webpack.

- [ ] **Step 5: Commit only the operator-server reliability files**

Run:

```bash
cd '/Users/sandboxsansan/Projects/sandbox-daily'
git diff --check
git add package.json scripts/operator-server.sh scripts/operator-server.test.ts
git diff --cached --name-only
git commit -m "fix: harden local operator server startup"
```

Expected: the staged-name check lists exactly `package.json`, `scripts/operator-server.sh`, and `scripts/operator-server.test.ts`; user article/image changes remain unstaged.

### Task 3: Cut over the filesystem and active path configuration

**Files:**

- Move: `/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily` to `/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily.rollback-2026-08-21`
- Create symlink: `/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily` to `/Users/sandboxsansan/Projects/sandbox-daily`
- Modify: `/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.operator-server.plist:6-12`
- Modify: `/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.signals-keepalive.plist:6-12`
- Modify: `/Users/sandboxsansan/brain/Kevals OS.code-workspace:5`

**Interfaces:**

- Consumes: the content-verified destination and passing operator wrapper from Tasks 1-2.
- Produces: a reversible filesystem cutover where all active configuration uses Projects and only compatibility traffic uses the Desktop symlink.

- [ ] **Step 1: Unload the scheduled signals job before changing its path**

Run:

```bash
launchctl bootout gui/$(id -u) '/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.signals-keepalive.plist'
if launchctl print gui/$(id -u)/com.sandboxdaily.operator-server >/dev/null 2>&1; then
  echo 'operator launch agent unexpectedly loaded' >&2
  exit 1
fi
```

Expected: signals unloads cleanly and the operator remains unloaded.

- [ ] **Step 2: Rename the source and create the compatibility symlink**

Run with approval and explicit paths:

```bash
mv '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily' '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily.rollback-2026-08-21'
ln -s '/Users/sandboxsansan/Projects/sandbox-daily' '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily'
test "$(readlink '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily')" = '/Users/sandboxsansan/Projects/sandbox-daily'
```

Expected: the rollback directory is a real directory and the former active path is a symlink to Projects. Do not remove either path.

- [ ] **Step 3: Update the operator launch-agent plist**

Apply this exact change to `/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.operator-server.plist`:

```xml
  <!-- /bin/bash, and the script path as its own argv element, keeps launchd
       invocation independent of an interactive shell. -->
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/sandboxsansan/Projects/sandbox-daily/scripts/operator-server.sh</string>
  </array>
```

Leave its label, `RunAtLoad`, `KeepAlive`, throttle interval, working directory, and log destinations unchanged.

- [ ] **Step 4: Update the signals launch-agent plist**

Apply this exact change to `/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.signals-keepalive.plist`:

```xml
  <!-- The script path is its own argv element, independent of interactive-shell
       quoting or PATH configuration. -->
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/sandboxsansan/Projects/sandbox-daily/scripts/keep-signals-warm.sh</string>
  </array>
```

Leave its label, `StartCalendarInterval` (`07:12`), working directory, and log destinations unchanged.

- [ ] **Step 5: Update the active VS Code workspace folder**

In `/Users/sandboxsansan/brain/Kevals OS.code-workspace`, replace only the Sandbox Daily app entry with:

```json
{ "name": "📰 Sandbox Daily (app)", "path": "/Users/sandboxsansan/Projects/sandbox-daily" },
```

Expected: the pipeline entry still points to `/Users/sandboxsansan/Desktop/ssnn-outputs`; all other workspace entries are unchanged.

- [ ] **Step 6: Validate all active paths before bootstrap**

Run:

```bash
plutil -lint '/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.operator-server.plist'
plutil -lint '/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.signals-keepalive.plist'
rg -n '/Users/sandboxsansan/Projects/sandbox-daily' '/Users/sandboxsansan/Projects/sandbox-daily/scripts/operator-server.sh' '/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.operator-server.plist' '/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.signals-keepalive.plist' '/Users/sandboxsansan/brain/Kevals OS.code-workspace'
```

Expected: both plists report `OK`; all four active configurations contain the real Projects path.

### Task 4: Bootstrap and verify the restored services

**Files:**

- Read: `/Users/sandboxsansan/Desktop/ssnn-outputs/operator-server.log`
- Read: `/Users/sandboxsansan/Desktop/ssnn-outputs/operator-server.runner.log`
- Read: `/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.operator-server.plist`
- Read: `/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.signals-keepalive.plist`
- Create: `/private/tmp/sandbox-daily-migration-2026-08-21/operator-log-delta.txt`

**Interfaces:**

- Consumes: the validated launch-agent plists and completed path cutover from Task 3.
- Produces: supervised operator and signals jobs, healthy local/Tailscale operator pages, passing focused/full tests, and retained rollback evidence.

- [ ] **Step 1: Bootstrap both launch agents from their updated plists**

Run:

```bash
launchctl bootstrap gui/$(id -u) '/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.signals-keepalive.plist'
launchctl bootstrap gui/$(id -u) '/Users/sandboxsansan/Library/LaunchAgents/com.sandboxdaily.operator-server.plist'
launchctl print gui/$(id -u)/com.sandboxdaily.signals-keepalive
launchctl print gui/$(id -u)/com.sandboxdaily.operator-server
```

Expected: both labels are loaded; signals is waiting for its `07:12` calendar trigger; operator has an active PID and its program argument uses the Projects wrapper.

- [ ] **Step 2: Prove launchd supervises webpack from Projects**

Run:

```bash
ps -axo pid=,command= | rg '[n]ext dev --webpack --port 3000'
pgrep -f 'next dev --webpack --port 3000' > '/private/tmp/sandbox-daily-migration-2026-08-21/operator-pids.txt'
while read -r operator_pid; do lsof -a -p "$operator_pid" -d cwd -Fn; done < '/private/tmp/sandbox-daily-migration-2026-08-21/operator-pids.txt'
```

Expected: the command contains `next dev --webpack --port 3000`; the Next process working directory is `/Users/sandboxsansan/Projects/sandbox-daily`.

- [ ] **Step 3: Verify both routes locally and through Tailscale**

Run:

```bash
curl --retry 20 --retry-delay 1 --retry-connrefused -fsS -o /dev/null -w 'local review %{http_code}\n' 'http://127.0.0.1:3000/review'
curl --retry 20 --retry-delay 1 --retry-connrefused -fsS -o /dev/null -w 'local radar %{http_code}\n' 'http://127.0.0.1:3000/admin/radar'
curl -fsS -o /dev/null -w 'tailscale review %{http_code}\n' 'https://sandboxs-mac-mini.tailcb630f.ts.net:8443/review'
curl -fsS -o /dev/null -w 'tailscale radar %{http_code}\n' 'https://sandboxs-mac-mini.tailcb630f.ts.net:8443/admin/radar'
```

Expected: all four commands print HTTP `200`.

- [ ] **Step 4: Stress both routes and inspect only new log output**

Run:

```bash
operator_log_start=$(stat -f %z '/Users/sandboxsansan/Desktop/ssnn-outputs/operator-server.log')
for request_number in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS -o /dev/null 'http://127.0.0.1:3000/review'
  curl -fsS -o /dev/null 'http://127.0.0.1:3000/admin/radar'
done
tail -c +$((operator_log_start + 1)) '/Users/sandboxsansan/Desktop/ssnn-outputs/operator-server.log' > '/private/tmp/sandbox-daily-migration-2026-08-21/operator-log-delta.txt'
if rg -n 'Resource deadlock avoided|os error 11|File Provider|Turbopack' '/private/tmp/sandbox-daily-migration-2026-08-21/operator-log-delta.txt'; then
  echo 'File Provider or Turbopack failure returned' >&2
  exit 1
fi
```

Expected: 20 route requests succeed and the new log section contains none of the prior failure signatures.

- [ ] **Step 5: Run the complete migration verification suite**

Run:

```bash
cd '/Users/sandboxsansan/Projects/sandbox-daily'
npm run test:operator-server
npm run test:lib
npx eslint scripts/operator-server.test.ts
npx tsc --noEmit
test "$(find '/Users/sandboxsansan/Projects/sandbox-daily' -flags +dataless -print | wc -l | tr -d ' ')" = '0'
```

Expected: operator test passes, all library tests pass, focused ESLint passes, TypeScript passes, and the destination still has zero dataless files. Do not use the unrelated repository-wide lint result as this migration's gate.

- [ ] **Step 6: Prove rollback safety and user-change preservation**

Run:

```bash
test -d '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily.rollback-2026-08-21/.git'
test -L '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily'
test "$(readlink '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily')" = '/Users/sandboxsansan/Projects/sandbox-daily'
if lsof +D '/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily.rollback-2026-08-21' > '/private/tmp/sandbox-daily-migration-2026-08-21/rollback-open-files.txt' 2>&1; then
  cat '/private/tmp/sandbox-daily-migration-2026-08-21/rollback-open-files.txt'
  exit 1
fi
git -C '/Users/sandboxsansan/Projects/sandbox-daily' status --short --untracked-files=all
```

Expected: the rollback repository exists, compatibility symlink resolves to Projects, no process holds the rollback path open, and the final Git status still lists the user's article/image deletions and untracked images while the committed operator-server files are clean.

## Rollback Procedure

Use this only if a post-cutover gate fails and the operator cannot be restored from Projects:

1. Boot out both updated launch agents.
2. Unlink only `/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily` after proving it is a symlink.
3. Rename `/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily.rollback-2026-08-21` back to `/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily`.
4. Restore the three active configuration files to their former Desktop paths and validate both plists.
5. Bootstrap signals and leave the operator stopped to avoid recreating the File Provider panic loop.
6. Retain `/Users/sandboxsansan/Projects/sandbox-daily`; do not delete it during rollback.
