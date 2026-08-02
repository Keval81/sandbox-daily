#!/bin/bash
# Keeps the reader-signals Supabase project out of the free plan's pause.
#
# Supabase pauses a Free plan project after ~7 days of low activity
# (https://supabase.com/docs/guides/platform/free-project-pausing): "typically a
# few user requests to the database each day over the previous week is enough to
# keep the project from being paused". Pausing never loses data — restore is one
# click within 90 days — but while paused the like and view counts vanish from
# every article, so this exists to make that never happen quietly.
#
# The site would normally keep itself awake, EXCEPT that the homepage makes no
# Supabase requests at all (cards carry a thumb with no count). Only an article
# page touches the database, so a week of homepage-only traffic would still let
# the project pause. Hence one deliberate ping a day.
#
# Deliberately hits production over HTTP rather than the database directly: it
# exercises the whole path a reader uses — Vercel route handler, PostgREST, the
# signal_counts view — so a failure here is a real failure, not a synthetic one.
#
# bash, not zsh: launchd-spawned processes need macOS Full Disk Access to read
# anything under ~/Desktop, and on this machine /bin/bash has that grant (the
# pipeline jobs rely on it) while /bin/zsh does not — a zsh job here failed with
# "can't open input file" no matter how the path was quoted.
#
# Installed as launchd com.sandboxdaily.signals-keepalive (daily 07:12).

set -u

ENDPOINT="https://sandbox-daily.vercel.app/api/signals"
LOG="${HOME}/Desktop/ssnn-outputs/signals-keepalive.log"
# Three reads, because the docs say "a few requests", not one. Slugs need only
# be well-formed — an unknown slug still queries the view, and reading nothing
# is the point: this job must never write a row and inflate a real count.
SLUGS=("keepalive-probe" "keepalive-probe-two" "keepalive-probe-three")

stamp() { date -u "+%Y-%m-%dT%H:%M:%SZ"; }

ping_once() {
  curl -sS --max-time 20 "${ENDPOINT}?slugs=$1" 2>&1
}

ok=0
for slug in "${SLUGS[@]}"; do
  body="$(ping_once "$slug")"
  if [[ "$body" == *'"ok":true'* ]]; then
    ok=$((ok + 1))
  else
    # One retry: a transient network drop should not read as a paused project.
    sleep 20
    body="$(ping_once "$slug")"
    [[ "$body" == *'"ok":true'* ]] && ok=$((ok + 1))
  fi
  sleep 3
done

if (( ok == ${#SLUGS[@]} )); then
  printf '%s\n' "$(stamp) ok ${ok}/${#SLUGS[@]} — supabase reachable, pause clock reset" >> "$LOG"
else
  # `"ok":false` means the route reached Vercel but could not read Supabase —
  # the project may already be paused, or the key may have rotated.
  printf '%s\n' "$(stamp) FAIL ${ok}/${#SLUGS[@]} — last response: ${body}" >> "$LOG"
fi

# The log is a heartbeat, not an archive: keep the last 400 lines.
if [[ -f "$LOG" ]]; then
  tail -n 400 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi
