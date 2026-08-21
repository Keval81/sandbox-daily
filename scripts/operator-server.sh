#!/bin/bash
# The operator server: the only place /admin/radar, /admin/workflow and /review
# exist.
#
# Those surfaces cannot be deployed. /admin/radar writes research-leads/ into
# ~/Desktop/ssnn-outputs (the ONLY thing that feeds the research agent), and
# /review drives the reviser agent — both need this machine's filesystem and its
# Claude CLI. So the pipeline's controls live here and are reached privately
# over Tailscale, while Vercel serves the public paper with the operator
# surfaces gated off (SANDBOX_ADMIN is set here and nowhere on Vercel).
#
# Running under launchd rather than by hand also fixes a documented recurring
# failure: the promote button is the only writer of research-leads/, so whenever
# `next dev` was not running, the pipeline silently idled with "no leads" and
# nothing published. Keeping this up means that cannot happen again.
#
# bash, not zsh, with the script path passed as its own argv element. This keeps
# launchd invocation predictable and avoids shell parsing around repository paths.

set -u

# launchd starts with a near-empty PATH; node and npm are Homebrew's.
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="${HOME}/Projects/sandbox-daily"
LOG="${HOME}/Desktop/ssnn-outputs/operator-server.log"
PORT="${SD_OPERATOR_PORT:-3000}"

# The flag that makes the operator surfaces exist at all. Set here as well as in
# .env.local so the job is self-contained: someone who deletes .env.local gets a
# working public site and a still-working operator server, not a mystery 404.
export SANDBOX_ADMIN=1

cd "$REPO" || {
  printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ') FATAL cannot cd to ${REPO}" >> "$LOG"
  exit 1
}

printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ') starting operator server on :${PORT}" >> "$LOG"

# exec, so launchd supervises node itself rather than a wrapper that has already
# exited — otherwise KeepAlive would restart a shell in a loop while the real
# server sat orphaned.
exec npm run dev -- --webpack --port "$PORT" >> "$LOG" 2>&1
