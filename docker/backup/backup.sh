#!/bin/sh
# CineFlow OS backups (the "backup" service in docker-compose.yml).
#   daemon          back up every night at BACKUP_TIME (default 03:00) in TZ
#   backup <name>   back up now into /backups/db/<name>, and mirror the files
#   restore <name>  put /backups/db/<name> back (the app must be stopped)
#
# /backups/db/<name>/dev.db     the database, via SQLite's online backup (safe while the app runs)
# /backups/db/<name>/info.txt   commit=<version it ran>, taken=<time>
# /backups/files/uploads|storage  a mirror of uploads and private files that only adds and
#                                 updates, so a file deleted in the app is still in the backup
set -eu

DB=/data/dev.db
ROOT=/backups

backup() {
  name="$1"
  if [ ! -f "$DB" ]; then
    echo "No database yet, so nothing to back up."
    return 0
  fi
  dest="$ROOT/db/$name"
  mkdir -p "$dest"
  # SQLite's online backup, waiting up to 15 s for a write in progress to finish; then make sure
  # the copy is a sound database. A failed copy is removed, never kept as if it were a backup.
  # Failures are handled explicitly: `set -e` doesn't apply inside a function called with `||`.
  if ! sqlite3 -cmd ".timeout 15000" "$DB" ".backup '$dest/dev.db'" \
    || [ "$(sqlite3 "$dest/dev.db" 'PRAGMA quick_check;' 2>&1)" != "ok" ]; then
    rm -rf "$dest"
    echo "Backup $name failed: the database couldn't be copied, or the copy didn't pass SQLite's check."
    return 1
  fi

  commit=unknown
  if [ -f /project/.cineflow-deployed.json ]; then
    found=$(sed -n 's/.*"commit": *"\([0-9a-f]*\)".*/\1/p' /project/.cineflow-deployed.json | head -n 1)
    [ -n "$found" ] && commit="$found"
  fi
  printf 'commit=%s\ntaken=%s\n' "$commit" "$(date -Iseconds)" > "$dest/info.txt"

  mkdir -p "$ROOT/files/uploads" "$ROOT/files/storage"
  if ! rsync -a /uploads/ "$ROOT/files/uploads/" || ! rsync -a /storage/ "$ROOT/files/storage/"; then
    echo "Backup $name failed: the database was copied, but copying uploads or private files didn't finish."
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
  # Leftover write-ahead files belong to the old database: remove them with it.
  rm -f "$DB" "$DB-wal" "$DB-shm" "$DB-journal"
  cp "$src" "$DB"
  [ -d "$ROOT/files/uploads" ] && rsync -a "$ROOT/files/uploads/" /uploads/
  [ -d "$ROOT/files/storage" ] && rsync -a "$ROOT/files/storage/" /storage/
  echo "Restored $name"
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
    /backup.sh backup "$(date +%Y-%m-%d_%H%M%S)" || echo "NIGHTLY BACKUP FAILED; trying again tomorrow."
  done
}

case "${1:-}" in
  daemon) daemon ;;
  backup) backup "${2:?backup needs a name}" ;;
  restore) restore "${2:?restore needs a name}" ;;
  *) echo "Use: daemon | backup <name> | restore <name>"; exit 1 ;;
esac
