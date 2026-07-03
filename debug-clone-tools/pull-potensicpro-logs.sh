#!/usr/bin/env bash
set -Eeuo pipefail

DEFAULT_ADB="/mnt/c/ProgramData/chocolatey/bin/adb.exe"
DEFAULT_PACKAGE="com.ipotensic.potensicpro"
DEFAULT_DEBUG_PACKAGE="com.ipotensic.potensicpro.debug"

ADB="${ADB:-$DEFAULT_ADB}"
PACKAGE="${PACKAGE:-$DEFAULT_PACKAGE}"
DEVICE="${ADB_DEVICE:-}"
CONNECT_TARGET=""
OUT_ROOT="acquisitions"

usage() {
  cat <<'USAGE'
Usage: debug-clone-tools/pull-potensicpro-logs.sh [options]

Read-only acquisition of accessible PotensicPro logs and metadata via ADB.

Options:
  --adb PATH          ADB executable. Default: /mnt/c/ProgramData/chocolatey/bin/adb.exe
  --device SERIAL     ADB device serial, e.g. 192.168.1.29:44357
  --connect HOST:PORT Connect to wireless ADB before pulling, e.g. 192.168.1.29:44357
  --package NAME      Android package. Default: com.ipotensic.potensicpro
  --debug-package     Shortcut for --package com.ipotensic.potensicpro.debug
  --out DIR           Output root directory. Default: acquisitions
  -h, --help          Show this help.

Environment variables:
  ADB=/path/to/adb
  ADB_DEVICE=serial
  PACKAGE=com.ipotensic.potensicpro

The script never writes to the Android device. It only reads shared app storage,
package metadata, and the private app sandbox when `run-as` is available.

Use --debug-package after installing the side-by-side debuggable clone. That
captures the clone's own shared storage and sandbox; it does not read the Play
Store app's private /data/data/com.ipotensic.potensicpro/databases/map.db.
USAGE
}

log() {
  printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --adb)
      ADB="${2:?missing value for --adb}"
      shift 2
      ;;
    --device)
      DEVICE="${2:?missing value for --device}"
      shift 2
      ;;
    --connect)
      CONNECT_TARGET="${2:?missing value for --connect}"
      shift 2
      ;;
    --package)
      PACKAGE="${2:?missing value for --package}"
      shift 2
      ;;
    --debug-package)
      PACKAGE="$DEFAULT_DEBUG_PACKAGE"
      shift
      ;;
    --out)
      OUT_ROOT="${2:?missing value for --out}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

[[ -x "$ADB" ]] || die "ADB is not executable: $ADB"

if [[ -n "$CONNECT_TARGET" ]]; then
  log "Connecting to wireless ADB target $CONNECT_TARGET"
  "$ADB" connect "$CONNECT_TARGET" | tr -d '\r' || true
  DEVICE="${DEVICE:-$CONNECT_TARGET}"
fi

if [[ -z "$DEVICE" ]]; then
  DEVICE="$(
    "$ADB" devices | tr -d '\r' | awk 'NR > 1 && $2 == "device" { print $1; exit }'
  )"
fi

[[ -n "$DEVICE" ]] || {
  "$ADB" devices -l | tr -d '\r' >&2 || true
  die "no connected ADB device found; use --connect HOST:PORT or --device SERIAL"
}

STAMP="$(date '+%Y%m%d-%H%M%S')"
PACKAGE_SLUG="$(printf '%s' "$PACKAGE" | tr -c 'A-Za-z0-9_.-' '-')"
OUT_DIR="$OUT_ROOT/$PACKAGE_SLUG-logs-$STAMP"
mkdir -p "$OUT_DIR" "$OUT_DIR/shared" "$OUT_DIR/sandbox" "$OUT_DIR/indexes"
printf '%s\n' "$OUT_DIR" > "$OUT_ROOT/latest-$PACKAGE_SLUG-logs.txt"
if [[ "$PACKAGE" == "$DEFAULT_PACKAGE" ]]; then
  printf '%s\n' "$OUT_DIR" > "$OUT_ROOT/latest-potensicpro-logs.txt"
fi

adb_shell() {
  "$ADB" -s "$DEVICE" shell "$@"
}

adb_exec_out() {
  "$ADB" -s "$DEVICE" exec-out "$@"
}

write_device_info() {
  log "Recording device and app metadata"
  {
    echo "acquired_at=$STAMP"
    echo "adb=$ADB"
    echo "device=$DEVICE"
    echo "package=$PACKAGE"
    "$ADB" -s "$DEVICE" devices -l
    adb_shell getprop ro.product.model
    adb_shell getprop ro.build.version.release
    adb_shell getprop ro.build.version.sdk
    adb_shell pm path "$PACKAGE"
    adb_shell dumpsys package "$PACKAGE" | grep -E 'versionName|versionCode|firstInstallTime|lastUpdateTime|dataDir|pkg=|userId=' || true
  } | tr -d '\r' > "$OUT_DIR/device-and-app-info.txt" 2>&1
}

pull_remote_dir_as_tar() {
  local remote_dir="$1"
  local output_name="$2"
  local tar_b64="$OUT_DIR/$output_name.tar.b64"
  local tar_file="$OUT_DIR/$output_name.tar"
  local extract_dir="$OUT_DIR/$output_name"

  log "Archiving $remote_dir"
  adb_exec_out sh -c "if [ -d '$remote_dir' ]; then cd '$remote_dir' && tar -cf - . 2>/dev/null | base64; fi" > "$tar_b64" || true

  if [[ -s "$tar_b64" ]]; then
    base64 -d "$tar_b64" > "$tar_file"
    mkdir -p "$extract_dir"
    tar -xf "$tar_file" -C "$extract_dir" 2>/dev/null || true
  else
    rm -f "$tar_b64"
  fi
}

write_indexes() {
  log "Indexing likely shared-storage log locations"
  {
    echo '--- shared Android/data package tree ---'
    adb_shell find "/sdcard/Android/data/$PACKAGE" -maxdepth 10 -type f 2>/dev/null | sort || true
    echo '--- shared Android/media package tree ---'
    adb_shell find "/sdcard/Android/media/$PACKAGE" -maxdepth 10 -type f 2>/dev/null | sort || true
    echo '--- broad likely drone/log files ---'
    adb_shell find /sdcard -maxdepth 8 -type f \
      \( -iname '*potensic*' -o -iname '*drone*' -o -iname '*flight*' -o -iname '*atom*' \
      -o -iname '*.bin' -o -iname '*.fc' -o -iname '*.fc2' -o -iname '*.log' -o -iname '*.db' -o -iname '*.zip' \
      \) 2>/dev/null | sort | head -3000 || true
  } | tr -d '\r' > "$OUT_DIR/indexes/device-file-search.txt" 2>&1
}

try_run_as_sandbox_logs() {
  log "Checking run-as access for private sandbox"
  {
    echo '--- run-as id ---'
    adb_shell run-as "$PACKAGE" id
    echo '--- run-as file inventory ---'
    adb_shell run-as "$PACKAGE" sh -c 'pwd; find . -maxdepth 5 -type f 2>/dev/null | sort | head -1000'
  } | tr -d '\r' > "$OUT_DIR/sandbox/run-as-inventory.txt" 2>&1 || true

  if grep -q 'uid=' "$OUT_DIR/sandbox/run-as-inventory.txt"; then
    log "run-as works; archiving sandbox databases/files/shared_prefs/no_backup"
    adb_exec_out run-as "$PACKAGE" sh -c 'tar -cf - databases files shared_prefs no_backup 2>/dev/null | base64' > "$OUT_DIR/sandbox/sandbox-data.tar.b64" || true
    if [[ -s "$OUT_DIR/sandbox/sandbox-data.tar.b64" ]]; then
      base64 -d "$OUT_DIR/sandbox/sandbox-data.tar.b64" > "$OUT_DIR/sandbox/sandbox-data.tar"
      mkdir -p "$OUT_DIR/sandbox/sandbox-data"
      tar -xf "$OUT_DIR/sandbox/sandbox-data.tar" -C "$OUT_DIR/sandbox/sandbox-data" 2>/dev/null || true
    fi
  else
    echo "run-as did not work; private sandbox data unavailable without debuggable app/root" > "$OUT_DIR/sandbox/run-as-unavailable.txt"
  fi
}

write_summary() {
  log "Writing summary and checksums"
  find "$OUT_DIR" -type f -printf '%p\t%s bytes\n' | sort > "$OUT_DIR/file-list.txt"
  grep -Ei 'map\.db|flight|drone|atom|\.bin$|\.fc2?$|\.log$|\.db$|\.zip$|sacc|geo_cal' "$OUT_DIR/file-list.txt" > "$OUT_DIR/candidate-log-files.txt" || true
  sha256sum "$OUT_DIR"/*.tar "$OUT_DIR"/shared/*.tar "$OUT_DIR"/sandbox/*.tar 2>/dev/null | sort > "$OUT_DIR/SHA256SUMS.txt" || true

  local shared_log_count thumbnail_count sandbox_available total_bytes
  shared_log_count="$(find "$OUT_DIR/shared" -type f \( -iname '*.log' -o -iname '*sacc*' -o -iname 'Geo_Cal*' -o -iname '*.txt' \) 2>/dev/null | wc -l | tr -d ' ')"
  thumbnail_count="$(find "$OUT_DIR/shared" -type f -iname '*.THM' 2>/dev/null | wc -l | tr -d ' ')"
  total_bytes="$(du -sb "$OUT_DIR" | awk '{print $1}')"
  if [[ -f "$OUT_DIR/sandbox/run-as-unavailable.txt" ]]; then
    sandbox_available="no"
  else
    sandbox_available="yes"
  fi

  cat > "$OUT_DIR/SUMMARY.md" <<SUMMARY
# PotensicPro Log Acquisition Summary

- Acquisition directory: \`$OUT_DIR\`
- Device: \`$DEVICE\`
- Package: \`$PACKAGE\`
- Total archived bytes: \`$total_bytes\`
- Shared log/diagnostic files found locally: \`$shared_log_count\`
- Thumbnail files found locally: \`$thumbnail_count\`
- Private sandbox available through run-as: \`$sandbox_available\`

## Captured

- Device/app metadata: \`device-and-app-info.txt\`
- Shared storage archives/extracts under \`shared/\`
- Device file search index: \`indexes/device-file-search.txt\`
- Candidate local log list: \`candidate-log-files.txt\`
- Checksums: \`SHA256SUMS.txt\`

## Notes

- This script is read-only and does not write to the Android device.
- If \`run-as\` is unavailable, private files such as \`/data/data/$PACKAGE/databases/map.db\` cannot be read without root or a debuggable app build.
- Shared logs usually appear under \`/sdcard/Android/data/$PACKAGE/files/PotensicPro/Logs/\` when retained by Android/PotensicPro.
SUMMARY
}

main() {
  log "Using ADB: $ADB"
  log "Using device: $DEVICE"
  log "Output: $OUT_DIR"
  write_device_info
  write_indexes
  pull_remote_dir_as_tar "/sdcard/Android/data/$PACKAGE/files/PotensicPro/Logs" "shared/potensicpro-logs"
  pull_remote_dir_as_tar "/sdcard/Android/data/$PACKAGE/files/PotensicPro" "shared/potensicpro-files"
  pull_remote_dir_as_tar "/sdcard/Android/data/$PACKAGE" "shared/android-data-package"
  pull_remote_dir_as_tar "/sdcard/Android/media/$PACKAGE" "shared/android-media-package"
  try_run_as_sandbox_logs
  write_summary
  log "Done: $OUT_DIR"
  cat "$OUT_DIR/SUMMARY.md"
}

main