#!/bin/sh
# CineFlow OS backups (the "backup" service in docker-compose.yml).
#   daemon          back up every night at BACKUP_TIME (default 03:00) in TZ
#   backup <name>   back up now into /backups/db/<name>, and mirror the files
#   restore <name>  put /backups/db/<name> back (the app must be stopped), if it passes verify
#   verify <name>   check /backups/db/<name> the way a restore needs it
#   disk-check      show free space; fails when below BACKUP_MIN_FREE_GB (default 5)
#   alert-test      ask the app to email the super-admins a test alert
#
# /backups/db/<name>/dev.db     the database, via SQLite's online backup (safe while the app runs)
# /backups/db/<name>/info.txt   env=<copy>, commit=<version it ran>, taken=<time>
# /backups/files/uploads|storage  a mirror of uploads and private files that only adds and
#                                 updates, so a file deleted in the app is still in the backup
set -eu

DB=/data/dev.db
ROOT=/backups
LATEST_CHANGE="SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1;"
TABLES="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# A backup is restorable when SQLite's full check passes, it records which database changes it
# has (prisma/migrations), and, when it's on the same version as the live database, it has the
# same tables. A live database that can't be read (the reason for a restore) is no reason to fail.
verify() {
  name="$1"
  copy="$ROOT/db/$name/dev.db"
  if [ ! -f "$copy" ]; then
    echo "There's no backup called $name."
    return 1
  fi
  result=$(sqlite3 "$copy" 'PRAGMA integrity_check;' 2>&1) || true
  if [ "$result" != "ok" ]; then
    echo "Backup $name is damaged. SQLite's check said:"
    echo "$result" | head -n 20
    return 1
  fi
  if ! version=$(sqlite3 "$copy" "$LATEST_CHANGE" 2>&1) || [ -z "$version" ]; then
    echo "Backup $name doesn't record its database changes (_prisma_migrations), so it can't be restored safely."
    return 1
  fi
  if [ -f "$DB" ]; then
    live=$(sqlite3 -cmd ".timeout 15000" "$DB" "$LATEST_CHANGE" 2>/dev/null) || live=""
    if [ "$version" = "$live" ]; then
      if live_tables=$(sqlite3 -cmd ".timeout 15000" "$DB" "$TABLES" 2>/dev/null) \
        && [ "$(sqlite3 "$copy" "$TABLES")" != "$live_tables" ]; then
        echo "Backup $name doesn't have the same tables as the live database."
        return 1
      fi
    elif [ -n "$live" ]; then
      echo "Backup $name is from an older database version ($version); restoring it also puts back the app version it ran."
    fi
  fi
  echo "Backup $name checked: it can be restored."
}

backup() {
  name="$1"
  if [ ! -f "$DB" ]; then
    echo "No database yet, so nothing to back up."
    return 0
  fi
  dest="$ROOT/db/$name"
  mkdir -p "$dest"
  # SQLite's online backup, waiting up to 15 s for a write in progress to finish; then check the
  # copy could be restored (verify). A failed copy is removed, never kept as if it were a backup.
  # Failures are handled explicitly: `set -e` doesn't apply inside a function called with `||`.
  if ! sqlite3 -cmd ".timeout 15000" "$DB" ".backup '$dest/dev.db'"; then
    rm -rf "$dest"
    echo "Backup $name failed: the database couldn't be copied."
    return 1
  fi
  if ! verify "$name"; then
    rm -rf "$dest"
    echo "Backup $name failed: the copy couldn't be restored, so it was removed."
    return 1
  fi

  commit=unknown
  if [ -f /project/.cineflow-deployed.json ]; then
    found=$(sed -n 's/.*"commit": *"\([0-9a-f]*\)".*/\1/p' /project/.cineflow-deployed.json | head -n 1)
    [ -n "$found" ] && commit="$found"
  fi
  printf 'env=%s\ncommit=%s\ntaken=%s\n' "${APP_ENV:-development}" "$commit" "$(date -Iseconds)" > "$dest/info.txt"

  mkdir -p "$ROOT/files/uploads" "$ROOT/files/storage"
  if ! rsync -a /uploads/ "$ROOT/files/uploads/" || ! rsync -a /storage/ "$ROOT/files/storage/"; then
    echo "Backup $name failed: the database was copied, but copying uploads or private files didn't finish."
    return 1
  fi
  # Every current file must now be in the mirror: a dry run lists any it would still copy
  # (folders, which end in /, aside).
  missing=$( { rsync -a --dry-run --out-format='%n' /uploads/ "$ROOT/files/uploads/" \
    && rsync -a --dry-run --out-format='%n' /storage/ "$ROOT/files/storage/"; } 2>&1 | grep -v '/$' || true)
  if [ -n "$missing" ]; then
    echo "Backup $name failed: these files aren't in the backup folder after copying:"
    echo "$missing" | head -n 20
    return 1
  fi

  # Old snapshots are removed only after a backup that fully worked.
  find "$ROOT/db" -mindepth 1 -maxdepth 1 -type d -mtime +"${BACKUP_KEEP_DAYS:-14}" -exec rm -rf {} +
  echo "Backup $name done"
}

restore() {
  name="$1"
  src="$ROOT/db/$name/dev.db"
  if [ ! -f "$src" ]; then
    echo "There's no backup called $name."
    exit 1
  fi
  if ! verify "$name"; then
    echo "Not restoring it: the current database is untouched. Pick another backup."
    exit 1
  fi
  # Leftover write-ahead files belong to the old database: remove them with it.
  rm -f "$DB" "$DB-wal" "$DB-shm" "$DB-journal"
  cp "$src" "$DB"
  [ -d "$ROOT/files/uploads" ] && rsync -a "$ROOT/files/uploads/" /uploads/
  [ -d "$ROOT/files/storage" ] && rsync -a "$ROOT/files/storage/" /storage/
  echo "Restored $name"
}

# Asks the app to email every super-admin (app/api/ops/alert). The key proves the request is ours:
# sha256 of AUTH_SECRET and a label, as lib/ops-alert.ts expects; the secret itself never travels.
# alert <kind> <backup name> [file with what the backup printed]
alert() {
  kind="$1"
  name="${2:-}"
  detail="${3:-/dev/null}"
  key=$(printf '%s' "${AUTH_SECRET}:backup-alert" | sha256sum | cut -d' ' -f1)
  curl -sS --max-time 60 --fail-with-body \
    -H "x-cineflow-alert-key: $key" -H "Content-Type: text/plain" \
    --data-binary "@$detail" \
    "http://app:3000/api/ops/alert?kind=$kind&backup=$name"
  echo
}

# Free space where backups go and on Docker's own disk (the database, uploads and app versions).
disk_check() {
  min_gb="${BACKUP_MIN_FREE_GB:-5}"
  case "$min_gb" in ''|*[!0-9]*) min_gb=5 ;; esac
  low=0
  for spot in "/backups|the backup folder (BACKUP_DIR)" "/data|Docker's disk (database, uploads, app versions)"; do
    dir="${spot%%|*}"
    label="${spot#*|}"
    free_kb=$(df -Pk "$dir" | awk 'NR==2 {print $4}')
    echo "Free space on $label: $(awk -v k="$free_kb" 'BEGIN { printf "%.1f", k / 1048576 }') GB"
    [ "$free_kb" -lt $((min_gb * 1048576)) ] && low=1
  done
  if [ "$low" -eq 1 ]; then
    echo "That's below ${min_gb} GB (BACKUP_MIN_FREE_GB)."
    return 1
  fi
}

daemon() {
  at="${BACKUP_TIME:-03:00}"
  echo "Nightly backups at $at ($(date +%Z)), kept ${BACKUP_KEEP_DAYS:-14} days."
  while true; do
    now=$(date +%s)
    next=$(date -d "$(date +%Y-%m-%d) $at" +%s)
    [ "$next" -le "$now" ] && next=$((next + 86400))
    sleep $((next - now))
    # Its own process, so any unexpected error stops that backup (set -e) instead of being ignored.
    name=$(date +%Y-%m-%d_%H%M%S)
    if /backup.sh backup "$name" > /tmp/backup.log 2>&1; then
      cat /tmp/backup.log
    else
      cat /tmp/backup.log
      echo "NIGHTLY BACKUP FAILED; emailing the super-admins, and trying again tomorrow."
      alert backup-failed "$name" /tmp/backup.log || echo "Couldn't send the alert email either (is the app running?)."
    fi
    if disk_check > /tmp/disk.log 2>&1; then
      cat /tmp/disk.log
    else
      cat /tmp/disk.log
      echo "LOW DISK SPACE; emailing the super-admins."
      alert disk-low "" /tmp/disk.log || echo "Couldn't send the alert email (is the app running?)."
    fi
  done
}

case "${1:-}" in
  daemon) daemon ;;
  backup) backup "${2:?backup needs a name}" ;;
  restore) restore "${2:?restore needs a name}" ;;
  verify) verify "${2:?verify needs a name}" ;;
  disk-check) disk_check ;;
  alert-test) alert test "" ;;
  *) echo "Use: daemon | backup <name> | restore <name> | verify <name> | disk-check | alert-test"; exit 1 ;;
esac
