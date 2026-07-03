#!/usr/bin/env bash
set -Eeuo pipefail

# Push a generated map.db into the PotensicPro debug clone sandbox.
#
# Modes:
#   (default)  --map FILE   Push one explicit map.db.
#   --latest   [--dir DIR]  Push the newest *.db in DIR (default ~/Downloads).
#   --watch    [--dir DIR]  Watch DIR and auto-push each new/changed *.db as the
#                           web app exports it (the "sync" loop).
#
# Safety model (applies to every push):
#   * Always backs up the current on-device map.db first.
#   * Force-stops the app so it is not holding the database open.
#   * Removes a stale -journal before writing.
#   * Writes binary-safely via base64 (no raw bytes through the shell).
#   * Verifies the written size and SHA256 against the local file.
#
# It targets the debuggable clone (run-as required). It never touches the Play
# Store package's private data.

DEFAULT_ADB="/mnt/c/ProgramData/chocolatey/bin/adb.exe"
DEFAULT_PACKAGE="com.ipotensic.potensicpro.debug"

ADB="${ADB:-$DEFAULT_ADB}"
PACKAGE="${PACKAGE:-$DEFAULT_PACKAGE}"
DEVICE="${ADB_DEVICE:-}"
MAP_FILE=""
OUT_ROOT="acquisitions/mapdb-push"
ASSUME_YES=0
MODE="single"
SRC_DIR=""
WATCH_INTERVAL=2

usage() {
  cat <<'USAGE'
Usage: debug-clone-tools/push-mapdb-to-clone.sh [--map PATH | --latest | --watch] [options]

Backup-first upload of a generated map.db into the PotensicPro debug clone.

Source selection (pick one):
  --map PATH          Push one explicit local map.db (default mode).
  --latest            Push the newest *.db found in --dir.
  --watch             Watch --dir and auto-push each new/changed *.db (sync loop).

Options:
  --dir DIR           Folder to scan for --latest/--watch. Default: ~/Downloads
                      (WSL tip: point at the Windows folder your browser saves to,
                      e.g. --dir /mnt/c/Users/YOU/Downloads).
  --interval SECONDS  Poll interval for --watch. Default: 2.
  --adb PATH          ADB executable. Default: /mnt/c/ProgramData/chocolatey/bin/adb.exe
  --device SERIAL     ADB device serial, e.g. 192.168.1.29:39033
  --package NAME      Target package. Default: com.ipotensic.potensicpro.debug
  --out DIR           Backup output root. Default: acquisitions/mapdb-push
  -y, --yes           Do not prompt before overwriting the on-device map.db.
                      (--watch implies --yes; a backup is still taken every push.)
  -h, --help          Show this help.

The target package MUST be debuggable (run-as must work). This never writes to
the non-debuggable Play Store package com.ipotensic.potensicpro.
USAGE
}

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --map) MAP_FILE="${2:?missing value for --map}"; shift 2 ;;
    --latest) MODE="latest"; shift ;;
    --watch) MODE="watch"; shift ;;
    --dir) SRC_DIR="${2:?missing value for --dir}"; shift 2 ;;
    --interval) WATCH_INTERVAL="${2:?missing value for --interval}"; shift 2 ;;
    --adb) ADB="${2:?missing value for --adb}"; shift 2 ;;
    --device) DEVICE="${2:?missing value for --device}"; shift 2 ;;
    --package) PACKAGE="${2:?missing value for --package}"; shift 2 ;;
    --out) OUT_ROOT="${2:?missing value for --out}"; shift 2 ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ -x "$ADB" ]] || die "ADB is not executable: $ADB"

if [[ "$PACKAGE" == "com.ipotensic.potensicpro" ]]; then
  die "refusing to write to the non-debuggable Play Store package"
fi

# Resolve the scan directory for --latest/--watch. Prefer an explicit --dir, then
# ~/Downloads, then the Windows Downloads folder when running under WSL.
resolve_src_dir() {
  if [[ -n "$SRC_DIR" ]]; then
    [[ -d "$SRC_DIR" ]] || die "scan directory not found: $SRC_DIR"
    return
  fi
  local candidates=("$HOME/Downloads" "/mnt/c/Users/$USER/Downloads")
  local d
  for d in "${candidates[@]}"; do
    if [[ -d "$d" ]]; then SRC_DIR="$d"; return; fi
  done
  die "no scan directory; pass --dir DIR"
}

find_latest_db() {
  # Newest *.db by mtime; handles browser names map.db and <slug>.map.db.
  ls -t "$SRC_DIR"/*.db 2>/dev/null | head -1
}

if [[ "$MODE" == "single" ]]; then
  [[ -n "$MAP_FILE" ]] || { usage; die "--map is required (or use --latest/--watch)"; }
  [[ -f "$MAP_FILE" ]] || die "map file not found: $MAP_FILE"
else
  resolve_src_dir
fi
[[ "$MODE" != "watch" ]] || ASSUME_YES=1

if [[ -z "$DEVICE" ]]; then
  DEVICE="$("$ADB" devices | tr -d '\r' | awk 'NR > 1 && $2 == "device" { print $1; exit }')"
fi
[[ -n "$DEVICE" ]] || die "no connected ADB device; pass --device SERIAL"

# Run a full command string on the device. The single-argument form is
# essential: passing multiple args lets adb join them with spaces so the remote
# default shell re-parses quotes and redirects in the wrong context.
remote() { "$ADB" -s "$DEVICE" shell "$1"; }
remote_out() { "$ADB" -s "$DEVICE" exec-out "$1"; }
# Run a command as the target app user. $1 must not contain single quotes.
run_as() { remote "run-as $PACKAGE sh -c '$1'"; }
run_as_out() { remote_out "run-as $PACKAGE sh -c '$1'"; }

# Confirm run-as works for the target package.
if ! remote "run-as $PACKAGE id" 2>/dev/null | tr -d '\r' | grep -q 'uid='; then
  die "run-as failed for $PACKAGE (package not debuggable or not installed)"
fi

REMOTE_DB="databases/map.db"
REMOTE_JOURNAL="databases/map.db-journal"

# Push one local map.db to the clone. Returns non-zero on failure (so --watch can
# continue) instead of aborting the whole process.
push_map_file() {
  local map_file="$1"

  if ! head -c 16 "$map_file" | grep -q 'SQLite format 3'; then
    printf 'ERROR: local file is not a SQLite database: %s\n' "$map_file" >&2
    return 1
  fi

  local stamp backup_dir
  stamp="$(date '+%Y%m%d-%H%M%S')"
  backup_dir="$OUT_ROOT/$stamp"
  mkdir -p "$backup_dir"

  # 1. Backup current on-device map.db, if present.
  if [[ "$(run_as "if [ -f $REMOTE_DB ]; then echo yes; fi" | tr -d '\r')" == "yes" ]]; then
    log "Backing up current on-device map.db"
    run_as_out "cat $REMOTE_DB" > "$backup_dir/map.db.backup"
    if head -c 16 "$backup_dir/map.db.backup" | grep -q 'SQLite format 3'; then
      ( cd "$backup_dir" && sha256sum map.db.backup > map.db.backup.sha256 )
      log "Backup saved: $backup_dir/map.db.backup ($(wc -c < "$backup_dir/map.db.backup") bytes)"
    else
      printf 'ERROR: backup did not look like a SQLite database; aborting this push\n' >&2
      return 1
    fi
  else
    log "No existing on-device map.db; nothing to back up"
  fi

  # 2. Confirm before overwriting.
  if [[ "$ASSUME_YES" -ne 1 ]]; then
    printf 'Overwrite %s on device %s from %s? [y/N] ' "$REMOTE_DB" "$DEVICE" "$map_file"
    read -r reply
    [[ "$reply" =~ ^[Yy]$ ]] || { log "skipped by user"; return 1; }
  fi

  # 3. Force-stop the app and clear a stale journal.
  log "Force-stopping $PACKAGE"
  remote "am force-stop $PACKAGE" >/dev/null 2>&1 || true
  run_as "mkdir -p databases; rm -f $REMOTE_JOURNAL" >/dev/null 2>&1 || true

  # 4. Binary-safe write via base64.
  local local_sha local_size
  local_sha="$(sha256sum "$map_file" | awk '{print $1}')"
  local_size="$(wc -c < "$map_file")"
  log "Writing map.db ($local_size bytes) to $PACKAGE"
  base64 -w0 "$map_file" | run_as "base64 -d > $REMOTE_DB"

  # 5. Verify size and hash on device.
  local remote_size remote_sha
  remote_size="$(run_as_out "wc -c < $REMOTE_DB" | tr -d '\r ')"
  remote_sha="$(run_as_out "sha256sum $REMOTE_DB" | tr -d '\r' | awk '{print $1}')"

  log "Local  size=$local_size sha256=$local_sha"
  log "Remote size=$remote_size sha256=$remote_sha"

  if [[ "$local_size" == "$remote_size" && "$local_sha" == "$remote_sha" ]]; then
    log "SUCCESS: on-device map.db matches the local file."
    if [[ -f "$backup_dir/map.db.backup" ]]; then
      log "Restore with: base64 -w0 '$backup_dir/map.db.backup' | $ADB -s $DEVICE shell \"run-as $PACKAGE sh -c 'base64 -d > $REMOTE_DB'\""
    fi
    return 0
  fi
  printf 'ERROR: verification failed: on-device file does not match. Restore from %s/map.db.backup\n' "$backup_dir" >&2
  return 1
}

case "$MODE" in
  single)
    push_map_file "$MAP_FILE" || die "push failed"
    ;;
  latest)
    latest="$(find_latest_db)"
    [[ -n "$latest" ]] || die "no *.db found in $SRC_DIR"
    log "Latest map.db in $SRC_DIR: $latest"
    push_map_file "$latest" || die "push failed"
    ;;
  watch)
    log "Watching $SRC_DIR for new *.db (interval ${WATCH_INTERVAL}s). Ctrl-C to stop."
    log "Export a map.db from the Atom mission app and it will auto-push to the clone."
    last_key=""
    while true; do
      newest="$(find_latest_db)"
      if [[ -n "$newest" ]]; then
        key="$newest:$(sha256sum "$newest" | awk '{print $1}')"
        if [[ "$key" != "$last_key" ]] && head -c 16 "$newest" | grep -q 'SQLite format 3'; then
          log "Detected new map.db: $newest"
          if push_map_file "$newest"; then
            last_key="$key"
          fi
        fi
      fi
      sleep "$WATCH_INTERVAL"
    done
    ;;
esac
