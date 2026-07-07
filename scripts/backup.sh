#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# LabCoop — PostgreSQL Backup Script
# Usage: ./scripts/backup.sh
# Environment variables (from .env):
#   DATABASE_URL          — PostgreSQL connection string
#   BACKUP_S3_BUCKET      — S3 bucket for offsite backup (optional)
#   BACKUP_RETENTION_DAYS — days to keep local backups (default 30)
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env if present
if [ -f "$PROJECT_DIR/backend/.env" ]; then
  set -a
  source "$PROJECT_DIR/backend/.env"
  set +a
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${PROJECT_DIR}/backups"
BACKUP_FILE="${BACKUP_DIR}/labcoop_${TIMESTAMP}.sql.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
LOG_FILE="${BACKUP_DIR}/backup.log"

mkdir -p "$BACKUP_DIR"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg" | tee -a "$LOG_FILE"
}

log "=== Backup started ==="

# Validate DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL is not set"
  exit 1
fi

# Run pg_dump
log "Dumping database to $BACKUP_FILE ..."
if ! pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > "$BACKUP_FILE"; then
  log "ERROR: pg_dump failed"
  exit 2
fi

# Verify backup
if [ ! -s "$BACKUP_FILE" ]; then
  log "ERROR: Backup file is empty"
  rm -f "$BACKUP_FILE"
  exit 3
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Upload to S3 (optional)
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  if command -v aws &>/dev/null; then
    log "Uploading to S3: s3://${BACKUP_S3_BUCKET}/postgres/ ..."
    aws s3 cp "$BACKUP_FILE" "s3://${BACKUP_S3_BUCKET}/postgres/$(basename "$BACKUP_FILE")" --only-show-errors
    log "S3 upload complete"
  else
    log "WARNING: aws-cli not found, skipping S3 upload"
  fi
fi

# Retention: remove backups older than RETENTION_DAYS
log "Pruning backups older than ${RETENTION_DAYS} days ..."
find "$BACKUP_DIR" -name 'labcoop_*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete

log "=== Backup completed successfully ==="
