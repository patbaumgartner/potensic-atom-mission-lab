#!/usr/bin/env bash
set -Eeuo pipefail

# Consolidated, repeatable "My Atom" privacy patch for a decoded PotensicPro
# debug clone tree. Bundles every hand-applied source patch into one script so a
# fresh apktool decode can be reproduced end to end:
#
#   1. Rename the launcher label (default "My Atom") so the clone is spottable
#      and no longer ends in "DEBUG".
#   2. Remove the Tencent Bugly crash/analytics tracker init.
#   3. Disable Mapbox telemetry (force TelemetryEnabler state to DISABLED).
#   4. Disable the in-app self-update check (no update prompt / server call).
#   5. Disable the first-run beginner guide (getFirstEnterMain -> false) so the
#      guide dialog + highlight overlay never appear on a fresh install.
#   6. Add an in-app map.db importer: a home-screen "Import map.db" button that
#      copies /sdcard/Download/atom/map.db (cloud-synced) into the private
#      databases/map.db (+ All-files-access permission).
#
# It intentionally leaves drone/camera firmware upgrade flows and the Baidu/AMap
# location SDKs (needed for maps) untouched. Safe to rerun; each patch detects an
# already-patched tree.

DECODED_DIR=""
LABEL="My Atom"

usage() {
  cat <<'USAGE'
Usage: debug-clone-tools/patch-clone-privacy.sh [options]

Apply the consolidated "My Atom" privacy patch to a decoded PotensicPro debug
clone directory: rename the app, strip the Bugly and Mapbox telemetry trackers,
disable the in-app self-update check, disable the first-run beginner guide, and
add an in-app map.db importer button.

Options:
  --decoded-dir DIR   Decoded apktool directory. Default: latest
                      debuggable-apk/*/work/base-clone-decoded.
  --label TEXT        Launcher label to set. Default: "My Atom".
  -h, --help          Show this help.

After running this script, rebuild/sign the clone APK (or use
debug-clone-tools/make-potensicpro-debuggable.sh --clone-package debug
--privacy which runs this automatically).
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
    --decoded-dir)
      DECODED_DIR="${2:?missing value for --decoded-dir}"
      shift 2
      ;;
    --label)
      LABEL="${2:?missing value for --label}"
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

find_latest_decoded_dir() {
  find debuggable-apk -path '*/work/base-clone-decoded/AndroidManifest.xml' -printf '%h\n' 2>/dev/null | sort | tail -1
}

if [[ -z "$DECODED_DIR" ]]; then
  DECODED_DIR="$(find_latest_decoded_dir)"
fi

[[ -n "$DECODED_DIR" ]] || die "no decoded clone directory found; pass --decoded-dir DIR"
[[ -d "$DECODED_DIR" ]] || die "decoded directory does not exist: $DECODED_DIR"
[[ -f "$DECODED_DIR/AndroidManifest.xml" ]] || die "not an apktool decoded directory: $DECODED_DIR"

STRINGS_FILE="$DECODED_DIR/res/values/strings.xml"
APPLICATION_SMALI="$DECODED_DIR/smali_classes2/com/ipotensic/potensicpro/MyApplication.smali"
TELEMETRY_SMALI="$DECODED_DIR/smali_classes3/com/mapbox/android/telemetry/TelemetryEnabler.smali"
VIEWMODEL_SMALI="$DECODED_DIR/smali_classes2/com/ipotensic/potensicpro/models/MainViewModel.smali"
SPHELPER_SMALI="$DECODED_DIR/smali_classes2/com/ipotensic/baselib/utils/SPHelper.smali"
MAINACTIVITY_SMALI="$DECODED_DIR/smali_classes2/com/ipotensic/potensicpro/activities/MainActivity.smali"
MANIFEST_FILE="$DECODED_DIR/AndroidManifest.xml"
IMPORTER_SMALI="$DECODED_DIR/smali_classes2/com/ipotensic/potensicpro/MapDbImporter.smali"

for f in "$STRINGS_FILE" "$APPLICATION_SMALI" "$TELEMETRY_SMALI" "$VIEWMODEL_SMALI" "$SPHELPER_SMALI" "$MAINACTIVITY_SMALI" "$MANIFEST_FILE"; do
  [[ -f "$f" ]] || die "expected file not found (wrong tree?): $f"
done

# 1. Rename launcher label. Idempotent: value is set to $LABEL every run.
patch_label() {
  perl -0pi -e "s#(<string name=\"app_name_potensicpro\">)[^<]*(</string>)#\${1}$LABEL\${2}#" "$STRINGS_FILE"
  grep -q ">$(printf '%s' "$LABEL" | sed 's/[].[^$*\/]/\\&/g')<" "$STRINGS_FILE" \
    || die "failed to set launcher label to $LABEL"
  log "Label set to \"$LABEL\""
}

# 2. Remove the Tencent Bugly crash/analytics init call in MyApplication.
patch_bugly() {
  if ! grep -q 'CrashReport;->initCrashReport' "$APPLICATION_SMALI"; then
    log "Bugly init already removed"
    return 0
  fi
  perl -0pi -e 's/\n[ \t]*invoke-static \{[^}]*\}, Lcom\/tencent\/bugly\/crashreport\/CrashReport;->initCrashReport\([^\n]*\n//g' "$APPLICATION_SMALI"
  ! grep -q 'CrashReport;->initCrashReport' "$APPLICATION_SMALI" \
    || die "failed to remove Bugly initCrashReport call"
  log "Removed Bugly (Tencent) tracker init"
}

# 3. Force Mapbox TelemetryEnabler.obtainTelemetryState() to return DISABLED.
#    Full-method replacement so it is state-agnostic and idempotent.
patch_mapbox_telemetry() {
  perl -0pi -e '
    s/\.method obtainTelemetryState\(\)Lcom\/mapbox\/android\/telemetry\/TelemetryEnabler\$State;.*?\.end method/.method obtainTelemetryState()Lcom\/mapbox\/android\/telemetry\/TelemetryEnabler\$State;\n    .locals 1\n\n    sget-object v0, Lcom\/mapbox\/android\/telemetry\/TelemetryEnabler\$State;->DISABLED:Lcom\/mapbox\/android\/telemetry\/TelemetryEnabler\$State;\n\n    return-object v0\n.end method/s
  ' "$TELEMETRY_SMALI"
  grep -q 'DISABLED:Lcom/mapbox/android/telemetry/TelemetryEnabler$State;' "$TELEMETRY_SMALI" \
    || die "failed to force Mapbox telemetry state to DISABLED"
  log "Disabled Mapbox telemetry (obtainTelemetryState -> DISABLED)"
}

# 4. Neutralize the in-app self-update check.
#    Full-method replacement so it is state-agnostic and idempotent.
patch_update_check() {
  perl -0pi -e '
    s/\.method public final checkAppVersionUpdate\(\)V.*?\.end method/.method public final checkAppVersionUpdate()V\n    .locals 0\n\n    return-void\n.end method/s
  ' "$VIEWMODEL_SMALI"
  log "Disabled in-app self-update check (checkAppVersionUpdate -> no-op)"
}

# 5. Disable the first-run beginner guide. getFirstEnterMain() gates both the
#    guide dialog (openGuide) and the highlight overlay (showMenuGuidePage);
#    forcing it false makes the guide never appear on a fresh install.
#    Full-method replacement so it is state-agnostic and idempotent.
patch_first_run_guide() {
  perl -0pi -e '
    s/\.method public getFirstEnterMain\(\)Z.*?\.end method/.method public getFirstEnterMain()Z\n    .locals 1\n\n    const\/4 v0, 0x0\n\n    return v0\n.end method/s
  ' "$SPHELPER_SMALI"
  log "Disabled first-run beginner guide (getFirstEnterMain -> false)"
}

# 6. In-app map.db importer + home-screen button. Writes MapDbImporter.smali,
#    hooks MainActivity.onCreate to add the "Import map.db" button (below the
#    logo, left), and adds All-files-access so it can read the cloud-synced
#    /sdcard/Download/atom/map.db into the private databases/map.db.
patch_mapdb_importer() {
  cat > "$IMPORTER_SMALI" <<'SMALI'
.class public final Lcom/ipotensic/potensicpro/MapDbImporter;
.super Ljava/lang/Object;
.implements Landroid/view/View$OnClickListener;
.source "MapDbImporter.java"


# Imports a map.db that a cloud app (Dropbox/Drive) synced into
# /sdcard/Download/atom/map.db, copying it into this app's private
# databases/map.db. Adds a floating "Import map.db" button to the home screen.

.field private final activity:Landroid/app/Activity;


.method private constructor <init>(Landroid/app/Activity;)V
    .locals 0

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p1, p0, Lcom/ipotensic/potensicpro/MapDbImporter;->activity:Landroid/app/Activity;

    return-void
.end method

.method private static copy(Ljava/io/File;Ljava/io/File;)J
    .locals 7

    new-instance v0, Ljava/io/FileInputStream;

    invoke-direct {v0, p0}, Ljava/io/FileInputStream;-><init>(Ljava/io/File;)V

    new-instance v1, Ljava/io/FileOutputStream;

    invoke-direct {v1, p1}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V

    const/16 v2, 0x2000

    new-array v2, v2, [B

    const-wide/16 v3, 0x0

    :loop
    invoke-virtual {v0, v2}, Ljava/io/InputStream;->read([B)I

    move-result v5

    const/4 v6, -0x1

    if-eq v5, v6, :done

    const/4 v6, 0x0

    invoke-virtual {v1, v2, v6, v5}, Ljava/io/OutputStream;->write([BII)V

    int-to-long v5, v5

    add-long/2addr v3, v5

    goto :loop

    :done
    invoke-virtual {v1}, Ljava/io/OutputStream;->flush()V

    invoke-virtual {v0}, Ljava/io/InputStream;->close()V

    invoke-virtual {v1}, Ljava/io/OutputStream;->close()V

    return-wide v3
.end method

.method private static toast(Landroid/content/Context;Ljava/lang/String;)V
    .locals 1

    const/4 v0, 0x1

    invoke-static {p0, p1, v0}, Landroid/widget/Toast;->makeText(Landroid/content/Context;Ljava/lang/CharSequence;I)Landroid/widget/Toast;

    move-result-object v0

    invoke-virtual {v0}, Landroid/widget/Toast;->show()V

    return-void
.end method

.method public static install(Landroid/app/Activity;)V
    .locals 4

    new-instance v0, Landroid/widget/Button;

    invoke-direct {v0, p0}, Landroid/widget/Button;-><init>(Landroid/content/Context;)V

    const-string v1, "Import map.db"

    invoke-virtual {v0, v1}, Landroid/widget/Button;->setText(Ljava/lang/CharSequence;)V

    new-instance v1, Lcom/ipotensic/potensicpro/MapDbImporter;

    invoke-direct {v1, p0}, Lcom/ipotensic/potensicpro/MapDbImporter;-><init>(Landroid/app/Activity;)V

    invoke-virtual {v0, v1}, Landroid/widget/Button;->setOnClickListener(Landroid/view/View$OnClickListener;)V

    new-instance v1, Landroid/widget/FrameLayout$LayoutParams;

    const/4 v2, -0x2

    const/4 v3, -0x2

    invoke-direct {v1, v2, v3}, Landroid/widget/FrameLayout$LayoutParams;-><init>(II)V

    const/16 v2, 0x33

    iput v2, v1, Landroid/widget/FrameLayout$LayoutParams;->gravity:I

    const/16 v2, 0xec

    iput v2, v1, Landroid/view/ViewGroup$MarginLayoutParams;->topMargin:I

    const/16 v2, 0x3c

    iput v2, v1, Landroid/view/ViewGroup$MarginLayoutParams;->leftMargin:I

    invoke-virtual {p0, v0, v1}, Landroid/app/Activity;->addContentView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V

    return-void
.end method

.method public static importNow(Landroid/app/Activity;)V
    .locals 8

    invoke-static {}, Landroid/os/Environment;->isExternalStorageManager()Z

    move-result v0

    if-nez v0, :perm_ok

    new-instance v0, Landroid/content/Intent;

    const-string v1, "android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION"

    invoke-direct {v0, v1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V

    new-instance v1, Ljava/lang/StringBuilder;

    invoke-direct {v1}, Ljava/lang/StringBuilder;-><init>()V

    const-string v2, "package:"

    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v1

    invoke-virtual {p0}, Landroid/content/Context;->getPackageName()Ljava/lang/String;

    move-result-object v2

    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v1

    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v1

    invoke-static {v1}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;

    move-result-object v1

    invoke-virtual {v0, v1}, Landroid/content/Intent;->setData(Landroid/net/Uri;)Landroid/content/Intent;

    invoke-virtual {p0, v0}, Landroid/app/Activity;->startActivity(Landroid/content/Intent;)V

    const-string v0, "Grant All files access to My Atom, then tap Import again"

    invoke-static {p0, v0}, Lcom/ipotensic/potensicpro/MapDbImporter;->toast(Landroid/content/Context;Ljava/lang/String;)V

    return-void

    :perm_ok
    sget-object v0, Landroid/os/Environment;->DIRECTORY_DOWNLOADS:Ljava/lang/String;

    invoke-static {v0}, Landroid/os/Environment;->getExternalStoragePublicDirectory(Ljava/lang/String;)Ljava/io/File;

    move-result-object v0

    new-instance v1, Ljava/io/File;

    const-string v2, "atom/map.db"

    invoke-direct {v1, v0, v2}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    invoke-virtual {v1}, Ljava/io/File;->exists()Z

    move-result v0

    if-nez v0, :have_src

    invoke-virtual {v1}, Ljava/io/File;->getParentFile()Ljava/io/File;

    move-result-object v0

    if-eqz v0, :no_src_toast

    invoke-virtual {v0}, Ljava/io/File;->mkdirs()Z

    :no_src_toast
    const-string v0, "Created Download/atom. Put map.db there, then tap Import."

    invoke-static {p0, v0}, Lcom/ipotensic/potensicpro/MapDbImporter;->toast(Landroid/content/Context;Ljava/lang/String;)V

    return-void

    :have_src
    const-string v0, "map.db"

    invoke-virtual {p0, v0}, Landroid/content/Context;->getDatabasePath(Ljava/lang/String;)Ljava/io/File;

    move-result-object v2

    :try_start
    invoke-virtual {v2}, Ljava/io/File;->getParentFile()Ljava/io/File;

    move-result-object v3

    if-eqz v3, :skip_mkdir

    invoke-virtual {v3}, Ljava/io/File;->mkdirs()Z

    :skip_mkdir
    invoke-virtual {v2}, Ljava/io/File;->exists()Z

    move-result v3

    if-eqz v3, :skip_backup

    new-instance v3, Ljava/io/File;

    invoke-virtual {v2}, Ljava/io/File;->getParentFile()Ljava/io/File;

    move-result-object v4

    const-string v5, "map.db.bak"

    invoke-direct {v3, v4, v5}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    invoke-static {v2, v3}, Lcom/ipotensic/potensicpro/MapDbImporter;->copy(Ljava/io/File;Ljava/io/File;)J

    :skip_backup
    invoke-static {v1, v2}, Lcom/ipotensic/potensicpro/MapDbImporter;->copy(Ljava/io/File;Ljava/io/File;)J

    move-result-wide v3

    new-instance v5, Ljava/io/File;

    invoke-virtual {v1}, Ljava/io/File;->getParentFile()Ljava/io/File;

    move-result-object v6

    const-string v7, "map.db.imported"

    invoke-direct {v5, v6, v7}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    invoke-virtual {v1, v5}, Ljava/io/File;->renameTo(Ljava/io/File;)Z

    new-instance v5, Ljava/lang/StringBuilder;

    invoke-direct {v5}, Ljava/lang/StringBuilder;-><init>()V

    const-string v6, "Imported map.db ("

    invoke-virtual {v5, v6}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v5

    invoke-virtual {v5, v3, v4}, Ljava/lang/StringBuilder;->append(J)Ljava/lang/StringBuilder;

    move-result-object v5

    const-string v6, " bytes). Reopen the mission list."

    invoke-virtual {v5, v6}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v5

    invoke-virtual {v5}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v5

    invoke-static {p0, v5}, Lcom/ipotensic/potensicpro/MapDbImporter;->toast(Landroid/content/Context;Ljava/lang/String;)V
    :try_end

    return-void

    :catch
    move-exception v0

    new-instance v1, Ljava/lang/StringBuilder;

    invoke-direct {v1}, Ljava/lang/StringBuilder;-><init>()V

    const-string v2, "Import failed: "

    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v1

    invoke-virtual {v0}, Ljava/lang/Throwable;->toString()Ljava/lang/String;

    move-result-object v0

    invoke-virtual {v1, v0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v0

    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v0

    invoke-static {p0, v0}, Lcom/ipotensic/potensicpro/MapDbImporter;->toast(Landroid/content/Context;Ljava/lang/String;)V

    return-void

    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :catch
.end method

.method public onClick(Landroid/view/View;)V
    .locals 1

    iget-object v0, p0, Lcom/ipotensic/potensicpro/MapDbImporter;->activity:Landroid/app/Activity;

    invoke-static {v0}, Lcom/ipotensic/potensicpro/MapDbImporter;->importNow(Landroid/app/Activity;)V

    return-void
.end method
SMALI

  if ! grep -q 'MapDbImporter;->install' "$MAINACTIVITY_SMALI"; then
    perl -0pi -e 's/(invoke-virtual \{p0, p1\}, Lcom\/ipotensic\/potensicpro\/activities\/MainActivity;->setContentView\(I\)V\n)/${1}\n    invoke-static {p0}, Lcom\/ipotensic\/potensicpro\/MapDbImporter;->install(Landroid\/app\/Activity;)V\n/s' "$MAINACTIVITY_SMALI"
    grep -q 'MapDbImporter;->install' "$MAINACTIVITY_SMALI" || die "failed to hook MainActivity.onCreate for importer"
  fi

  if ! grep -q 'android.permission.MANAGE_EXTERNAL_STORAGE' "$MANIFEST_FILE"; then
    perl -0pi -e 's/(<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"\/>)/${1}\n    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE"\/>/s' "$MANIFEST_FILE"
    grep -q 'MANAGE_EXTERNAL_STORAGE' "$MANIFEST_FILE" || die "failed to add MANAGE_EXTERNAL_STORAGE permission"
  fi

  log "Added in-app map.db importer + home-screen button (source: /sdcard/Download/atom/map.db)"
}

log "Patching decoded clone: $DECODED_DIR"
patch_label
patch_bugly
patch_mapbox_telemetry
patch_update_check
patch_first_run_guide
patch_mapdb_importer
log "Privacy patch complete: $DECODED_DIR"
