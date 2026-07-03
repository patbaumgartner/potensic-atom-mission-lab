#!/usr/bin/env bash
set -Eeuo pipefail

DEFAULT_ADB="/mnt/c/ProgramData/chocolatey/bin/adb.exe"
DEFAULT_PACKAGE="com.ipotensic.potensicpro"
DEFAULT_CLONE_PACKAGE="com.ipotensic.potensicpro.debug"
DEFAULT_CLONE_LABEL="My Atom"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

ADB="${ADB:-$DEFAULT_ADB}"
PACKAGE="${PACKAGE:-$DEFAULT_PACKAGE}"
CLONE_PACKAGE=""
CLONE_LABEL="$DEFAULT_CLONE_LABEL"
DEVICE="${ADB_DEVICE:-}"
APK_DIR=""
BASE_APK=""
OUT_DIR="debuggable-apk/potensicpro-debuggable-$(date '+%Y%m%d-%H%M%S')"
KEYSTORE=""
KEY_ALIAS="potensic-debug"
KEY_PASS="android"
BUILD_TOOLS=""
PULL_FROM_DEVICE=0
INSTALL=0
PRIVACY_PATCH=0

usage() {
  cat <<'USAGE'
Usage: debug-clone-tools/make-potensicpro-debuggable.sh [options]

Patch a local PotensicPro APK set so the base APK has android:debuggable="true",
then zipalign and sign the base APK plus split APKs with a generated local key.

This is for local research on your own device. Do not redistribute patched APKs.
The script does not bypass flight limits, geofencing, or app safety behavior.

Input options:
  --pull-from-device      Pull installed APK/split APK files from the connected phone first.
                          This is the default when no --apk-dir or --base-apk is given.
  --apk-dir DIR           Directory containing base.apk and optional split_config*.apk files.
  --base-apk FILE         Base APK file. If omitted, uses APK_DIR/base.apk.
  --clone-package NAME    Build a side-by-side monolithic debug clone with this package id.
                         Use "debug" for com.ipotensic.potensicpro.debug.
  --clone-label TEXT      App label for --clone-package builds. Default: My Atom.
  --privacy               Apply the consolidated "My Atom" privacy patch to a
                          side-by-side clone before rebuilding: rename the app,
                          strip Bugly and Mapbox telemetry trackers, and disable
                          the in-app self-update check.

ADB/device options:
  --adb PATH              ADB executable. Default: /mnt/c/ProgramData/chocolatey/bin/adb.exe
  --device SERIAL         ADB device serial, e.g. 192.168.1.29:44357
  --package NAME          Android package. Default: com.ipotensic.potensicpro
  --install               Attempt adb install after signing. Not enabled by default.

Signing/build options:
  --out DIR               Output directory.
  --keystore FILE         Keystore path. Default: debug-clone-tools/debug-clone.keystore
                          (stable across rebuilds so installs update in place).
  --alias NAME            Key alias. Default: potensic-debug
  --key-pass PASS         Keystore/key password. Default: android
  --build-tools DIR       Android build-tools dir containing zipalign and apksigner.
  -h, --help              Show this help.

Required tools:
  apktool, keytool, zipalign, apksigner, Java runtime.

Important install note:
  A re-signed APK normally cannot update the Play Store version because the
  signing certificate is different. Installing may require uninstalling the
  original app first, which deletes private app data. Back up everything you can
  before installing.

Side-by-side clone note:
  --clone-package builds a separate debuggable package. It can be installed next
  to the Play Store app, but Android gives it a separate private sandbox. It will
  not read /data/data/com.ipotensic.potensicpro/databases/map.db from the
  original app.
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
    --pull-from-device)
      PULL_FROM_DEVICE=1
      shift
      ;;
    --apk-dir)
      APK_DIR="${2:?missing value for --apk-dir}"
      shift 2
      ;;
    --base-apk)
      BASE_APK="${2:?missing value for --base-apk}"
      shift 2
      ;;
    --clone-package)
      CLONE_PACKAGE="${2:?missing value for --clone-package}"
      [[ "$CLONE_PACKAGE" == "debug" ]] && CLONE_PACKAGE="$DEFAULT_CLONE_PACKAGE"
      shift 2
      ;;
    --clone-label)
      CLONE_LABEL="${2:?missing value for --clone-label}"
      shift 2
      ;;
    --privacy)
      PRIVACY_PATCH=1
      shift
      ;;
    --adb)
      ADB="${2:?missing value for --adb}"
      shift 2
      ;;
    --device)
      DEVICE="${2:?missing value for --device}"
      shift 2
      ;;
    --package)
      PACKAGE="${2:?missing value for --package}"
      shift 2
      ;;
    --install)
      INSTALL=1
      shift
      ;;
    --out)
      OUT_DIR="${2:?missing value for --out}"
      shift 2
      ;;
    --keystore)
      KEYSTORE="${2:?missing value for --keystore}"
      shift 2
      ;;
    --alias)
      KEY_ALIAS="${2:?missing value for --alias}"
      shift 2
      ;;
    --key-pass)
      KEY_PASS="${2:?missing value for --key-pass}"
      shift 2
      ;;
    --build-tools)
      BUILD_TOOLS="${2:?missing value for --build-tools}"
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

find_build_tool() {
  local name="$1"
  if [[ -n "$BUILD_TOOLS" && -x "$BUILD_TOOLS/$name" ]]; then
    printf '%s\n' "$BUILD_TOOLS/$name"
    return 0
  fi
  if [[ -n "$BUILD_TOOLS" && -x "$BUILD_TOOLS/$name.exe" ]]; then
    printf '%s\n' "$BUILD_TOOLS/$name.exe"
    return 0
  fi
  if [[ -n "$BUILD_TOOLS" && -f "$BUILD_TOOLS/$name.bat" ]]; then
    printf '%s\n' "$BUILD_TOOLS/$name.bat"
    return 0
  fi

  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi
  if command -v "$name.exe" >/dev/null 2>&1; then
    command -v "$name.exe"
    return 0
  fi

  local choco_bin="/mnt/c/ProgramData/chocolatey/bin"
  if [[ -x "$choco_bin/$name.exe" ]]; then
    printf '%s\n' "$choco_bin/$name.exe"
    return 0
  fi
  if [[ -f "$choco_bin/$name.bat" ]]; then
    printf '%s\n' "$choco_bin/$name.bat"
    return 0
  fi

  local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  local candidates=()
  [[ -n "$sdk" ]] && candidates+=("$sdk")
  candidates+=("$HOME/Android/Sdk")
  candidates+=("/mnt/c/Android/android-sdk")
  candidates+=("/mnt/c/Users/$USER/AppData/Local/Android/Sdk")
  candidates+=("/mnt/c/Users/$USER/AppData/Local/Android/android-sdk")

  local sdk_dir tool
  for sdk_dir in "${candidates[@]}"; do
    [[ -d "$sdk_dir/build-tools" ]] || continue
    tool="$(find "$sdk_dir/build-tools" -maxdepth 2 -type f \( -name "$name" -o -name "$name.exe" -o -name "$name.bat" \) 2>/dev/null | sort -V | tail -1)"
    if [[ -n "$tool" && ( -x "$tool" || "$tool" == *.bat ) ]]; then
      printf '%s\n' "$tool"
      return 0
    fi
  done

  return 1
}

run_apktool() {
  if [[ -n "${APKTOOL:-}" ]]; then
    if [[ "$APKTOOL" == *.jar ]]; then
      java -jar "$APKTOOL" "$@"
    else
      "$APKTOOL" "$@"
    fi
  elif [[ -f "/mnt/c/ProgramData/chocolatey/lib/apktool/tools/apktool.jar" ]]; then
    java -jar "/mnt/c/ProgramData/chocolatey/lib/apktool/tools/apktool.jar" "$@"
  elif command -v apktool >/dev/null 2>&1; then
    apktool "$@"
  elif command -v apktool.exe >/dev/null 2>&1; then
    apktool.exe "$@"
  elif [[ -x "/mnt/c/ProgramData/chocolatey/bin/apktool.exe" ]]; then
    "/mnt/c/ProgramData/chocolatey/bin/apktool.exe" "$@"
  else
    die "apktool not found. Install apktool or set APKTOOL=/path/to/apktool.jar"
  fi
}

run_build_tool() {
  local tool="$1"
  shift
  if [[ "$tool" == *.bat ]]; then
    cmd.exe /c "$(wslpath -w "$tool")" "$@"
  else
    "$tool" "$@"
  fi
}

require_tools() {
  command -v java >/dev/null 2>&1 || die "java is required"
  command -v keytool >/dev/null 2>&1 || die "keytool is required"
  ZIPALIGN="$(find_build_tool zipalign)" || die "zipalign not found. Install Android build-tools or pass --build-tools DIR"
  APKSIGNER="$(find_build_tool apksigner)" || die "apksigner not found. Install Android build-tools or pass --build-tools DIR"
  run_apktool --version >/dev/null
}

select_device_if_needed() {
  [[ -x "$ADB" ]] || die "ADB is not executable: $ADB"
  if [[ -z "$DEVICE" ]]; then
    DEVICE="$("$ADB" devices | tr -d '\r' | awk 'NR > 1 && $2 == "device" { print $1; exit }')"
  fi
  [[ -n "$DEVICE" ]] || die "no connected ADB device found; pass --device SERIAL"
}

pull_apks_from_device() {
  select_device_if_needed
  APK_DIR="$OUT_DIR/original-apks"
  mkdir -p "$APK_DIR"

  log "Pulling installed APK paths for $PACKAGE from $DEVICE"
  "$ADB" -s "$DEVICE" shell pm path "$PACKAGE" | tr -d '\r' > "$OUT_DIR/package-paths.txt"
  grep -q '^package:' "$OUT_DIR/package-paths.txt" || die "package not found on device: $PACKAGE"

  local apk_paths remote name
  mapfile -t apk_paths < <(sed -n 's/^package://p' "$OUT_DIR/package-paths.txt")
  for remote in "${apk_paths[@]}"; do
    [[ -n "$remote" ]] || continue
    name="$(basename "$remote")"
    log "Pulling $name"
    "$ADB" -s "$DEVICE" exec-out sh -c "base64 '$remote'" > "$APK_DIR/$name.b64"
    base64 -d "$APK_DIR/$name.b64" > "$APK_DIR/$name"
  done
}

patch_manifest_debuggable() {
  local manifest="$1"
  [[ -f "$manifest" ]] || die "AndroidManifest.xml not found after apktool decode"

  if grep -q 'android:debuggable=' "$manifest"; then
    perl -0pi -e 's/android:debuggable="[^"]*"/android:debuggable="true"/s' "$manifest"
  else
    perl -0pi -e 's/<application\b/<application android:debuggable="true"/s' "$manifest"
  fi

  grep -q 'android:debuggable="true"' "$manifest" || die "failed to set android:debuggable=true"
}

patch_manifest_clone() {
  local manifest="$1"
  local clone_package="$2"
  [[ -f "$manifest" ]] || die "AndroidManifest.xml not found after apktool decode"

  perl -0pi -e "s/package=\"\Q$PACKAGE\E\"/package=\"$clone_package\"/g; s/android:name=\"\Q$PACKAGE\E\.permission\.JPUSH_MESSAGE\"/android:name=\"$clone_package.permission.JPUSH_MESSAGE\"/g; s/android:authorities=\"\Q$PACKAGE\E\./android:authorities=\"$clone_package./g; s/android:requiredSplitTypes=\"[^\"]*\"\s*//g; s/android:splitTypes=\"[^\"]*\"\s*//g; s/android:debuggable=\"[^\"]*\"/android:debuggable=\"true\"/g; s/android:extractNativeLibs=\"false\"/android:extractNativeLibs=\"true\"/g" "$manifest"
  perl -0pi -e 's/<application\b(?![^>]*android:debuggable=)/<application android:debuggable="true"/s; s/\s*<meta-data android:name="com\.android\.vending\.splits\.required"[^>]*>\s*<\/meta-data>//g; s/\s*<meta-data android:name="com\.android\.vending\.splits"[^>]*>\s*<\/meta-data>//g' "$manifest"

  grep -q "package=\"$clone_package\"" "$manifest" || die "failed to set clone package=$clone_package"
  grep -q 'android:debuggable="true"' "$manifest" || die "failed to set android:debuggable=true"
}

patch_clone_label() {
  local decoded_dir="$1"
  local strings_file="$decoded_dir/res/values/strings.xml"
  [[ -f "$strings_file" ]] || die "strings.xml not found after apktool decode"

  perl -0pi -e "s#(<string name=\"app_name_potensicpro\">)[^<]*(</string>)#\${1}$CLONE_LABEL\${2}#" "$strings_file"
  grep -q ">$(printf '%s' "$CLONE_LABEL" | sed 's/[].[^$*\/]/\\&/g')<" "$strings_file" || die "failed to set clone label=$CLONE_LABEL"
}

generate_keystore_if_needed() {
  # Default to a stable keystore in the tools dir (outside the disposable
  # debuggable-apk/ output) so every rebuild is signed with the SAME key and can
  # update a previous install with `adb install -r` (no uninstall / data loss).
  KEYSTORE="${KEYSTORE:-$SCRIPT_DIR/debug-clone.keystore}"
  if [[ -f "$KEYSTORE" ]]; then
    log "Using existing keystore $KEYSTORE"
    return
  fi

  log "Generating local debug keystore $KEYSTORE"
  keytool -genkeypair \
    -keystore "$KEYSTORE" \
    -storepass "$KEY_PASS" \
    -keypass "$KEY_PASS" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=Local Potensic Debug,O=Local Research,C=XX" >/dev/null
}

sign_apk() {
  local input_apk="$1"
  local output_apk="$2"
  local aligned_apk="$output_apk.aligned.apk"

  run_build_tool "$ZIPALIGN" -f -p 4 "$input_apk" "$aligned_apk" >/dev/null
  run_build_tool "$APKSIGNER" sign \
    --ks "$KEYSTORE" \
    --ks-key-alias "$KEY_ALIAS" \
    --ks-pass "pass:$KEY_PASS" \
    --key-pass "pass:$KEY_PASS" \
    --out "$output_apk" \
    "$aligned_apk" >/dev/null
  rm -f "$aligned_apk"
}

merge_split_native_libs() {
  local decoded_dir="$1"
  local split
  [[ -n "$APK_DIR" ]] || return 0
  command -v unzip >/dev/null 2>&1 || die "unzip is required for --clone-package"

  for split in "$APK_DIR"/*.apk; do
    [[ -f "$split" ]] || continue
    [[ "$(basename "$split")" == "base.apk" ]] && continue
    if unzip -l "$split" 'lib/*' >/dev/null 2>&1; then
      log "Merging native libraries from $(basename "$split")"
      unzip -q "$split" 'lib/*' -d "$decoded_dir"
    fi
  done
}

apply_privacy_patch() {
  local decoded_dir="$1"
  local privacy_script="$SCRIPT_DIR/patch-clone-privacy.sh"
  [[ -x "$privacy_script" ]] || die "missing executable privacy patch script: $privacy_script"

  log "Applying \"My Atom\" privacy patch (de-track + disable self-update)"
  "$privacy_script" --decoded-dir "$decoded_dir" --label "$CLONE_LABEL"
}

build_clone_package() {
  local work_dir decoded_dir unsigned_apk signed_dir signed_apk
  work_dir="$OUT_DIR/work"
  decoded_dir="$work_dir/base-clone-decoded"
  unsigned_apk="$work_dir/potensicpro-debug-clone-unsigned.apk"
  signed_dir="$OUT_DIR/signed"
  signed_apk="$signed_dir/potensicpro-debug-clone.apk"
  mkdir -p "$work_dir" "$signed_dir"

  log "Decoding base APK for side-by-side clone $CLONE_PACKAGE"
  rm -rf "$decoded_dir"
  run_apktool d -f "$BASE_APK" -o "$decoded_dir" >/dev/null

  merge_split_native_libs "$decoded_dir"

  log "Patching clone manifest to package=$CLONE_PACKAGE and android:debuggable=true"
  patch_manifest_clone "$decoded_dir/AndroidManifest.xml" "$CLONE_PACKAGE"

  log "Setting clone app label to $CLONE_LABEL"
  patch_clone_label "$decoded_dir"

  if [[ "$PRIVACY_PATCH" -eq 1 ]]; then
    apply_privacy_patch "$decoded_dir"
  fi

  log "Rebuilding side-by-side clone APK"
  run_apktool b "$decoded_dir" -o "$unsigned_apk" >/dev/null

  log "Signing side-by-side clone APK"
  sign_apk "$unsigned_apk" "$signed_apk"

  {
    echo "# PotensicPro Debuggable Clone Build"
    echo
    echo "- Source package: \`$PACKAGE\`"
    echo "- Clone package: \`$CLONE_PACKAGE\`"
    echo "- Clone label: \`$CLONE_LABEL\`"
    echo "- Privacy patch: \`$([[ "$PRIVACY_PATCH" -eq 1 ]] && echo enabled || echo disabled)\`"
    echo "- Base APK: \`$BASE_APK\`"
    echo "- Output directory: \`$OUT_DIR\`"
    echo "- Signed APK: \`$signed_apk\`"
    echo "- Keystore: \`$KEYSTORE\`"
    echo
    echo "## Install"
    echo
    echo '```bash'
    printf 'adb install -r %q\n' "$signed_apk"
    echo '```'
    echo
    echo "This clone installs side-by-side as \`$CLONE_LABEL\` and does not replace the Play Store app. It has its own private sandbox at \`/data/data/$CLONE_PACKAGE\`, so it cannot read the original app's \`/data/data/$PACKAGE/databases/map.db\`."
    echo
    echo "On recent Android builds you may see an Android App Compatibility warning about 16 KB native-library alignment. That warning is expected for this debug clone because it preserves the vendor native libraries from the original APK."
    echo
    echo "## Pull Debug Clone Data"
    echo
    echo '```bash'
    printf 'debug-clone-tools/pull-potensicpro-logs.sh --package %q --device DEVICE --adb %q\n' "$CLONE_PACKAGE" "$ADB"
    echo '```'
  } > "$OUT_DIR/README.md"

  sha256sum "$signed_apk" > "$OUT_DIR/SHA256SUMS.txt"

  if [[ "$INSTALL" -eq 1 ]]; then
    select_device_if_needed
    log "Installing side-by-side clone to $DEVICE"
    "$ADB" -s "$DEVICE" install -r "$signed_apk"
  fi

  log "Done: $OUT_DIR"
  cat "$OUT_DIR/README.md"
}

main() {
  mkdir -p "$OUT_DIR"
  require_tools

  if [[ "$PULL_FROM_DEVICE" -eq 0 && -z "$APK_DIR" && -z "$BASE_APK" ]]; then
    PULL_FROM_DEVICE=1
  fi

  if [[ "$PULL_FROM_DEVICE" -eq 1 ]]; then
    pull_apks_from_device
  fi

  [[ -n "$APK_DIR" || -n "$BASE_APK" ]] || die "provide --apk-dir DIR, --base-apk FILE, or --pull-from-device"
  [[ -n "$BASE_APK" ]] || BASE_APK="$APK_DIR/base.apk"
  [[ -f "$BASE_APK" ]] || die "base APK not found: $BASE_APK"

  generate_keystore_if_needed

  if [[ -n "$CLONE_PACKAGE" ]]; then
    build_clone_package
    return
  fi

  local work_dir unsigned_base signed_dir decoded_dir
  work_dir="$OUT_DIR/work"
  decoded_dir="$work_dir/base-decoded"
  unsigned_base="$work_dir/base-debuggable-unsigned.apk"
  signed_dir="$OUT_DIR/signed"
  mkdir -p "$work_dir" "$signed_dir"

  log "Decoding base APK"
  rm -rf "$decoded_dir"
  run_apktool d -f "$BASE_APK" -o "$decoded_dir" >/dev/null

  log "Patching AndroidManifest.xml to android:debuggable=true"
  patch_manifest_debuggable "$decoded_dir/AndroidManifest.xml"

  log "Rebuilding patched base APK"
  run_apktool b "$decoded_dir" -o "$unsigned_base" >/dev/null

  log "Signing patched base APK"
  sign_apk "$unsigned_base" "$signed_dir/base-debuggable.apk"

  local split signed_split name
  if [[ -n "$APK_DIR" ]]; then
    for split in "$APK_DIR"/*.apk; do
      [[ -f "$split" ]] || continue
      [[ "$(basename "$split")" == "base.apk" ]] && continue
      name="$(basename "$split")"
      signed_split="$signed_dir/$name"
      log "Signing split APK $name"
      sign_apk "$split" "$signed_split"
    done
  fi

  {
    echo "# PotensicPro Debuggable APK Build"
    echo
    echo "- Package: \`$PACKAGE\`"
    echo "- Base APK: \`$BASE_APK\`"
    echo "- Output directory: \`$OUT_DIR\`"
    echo "- Signed APK directory: \`$signed_dir\`"
    echo "- Keystore: \`$KEYSTORE\`"
    echo
    echo "## Install"
    echo
    echo '```bash'
    printf 'adb install-multiple -r'
    for signed_split in "$signed_dir"/*.apk; do
      printf ' %q' "$signed_split"
    done
    echo
    echo '```'
    echo
    echo "If install fails with a signature mismatch, the original app must be uninstalled first, which deletes private app data. Back up shared files and anything accessible before doing that."
  } > "$OUT_DIR/README.md"

  sha256sum "$signed_dir"/*.apk > "$OUT_DIR/SHA256SUMS.txt"

  if [[ "$INSTALL" -eq 1 ]]; then
    select_device_if_needed
    log "Installing signed APK set to $DEVICE"
    "$ADB" -s "$DEVICE" install-multiple -r "$signed_dir"/*.apk
  fi

  log "Done: $OUT_DIR"
  cat "$OUT_DIR/README.md"
}

main