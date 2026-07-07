#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# LabCoop — Health Check Monitor
# Usage: ./scripts/health-check.sh
# Environment:
#   HEALTH_URL        — URL to check (default http://localhost:3000/api/health)
#   ALERT_WEBHOOK_URL — Slack/Discord webhook for alerts (optional)
#   ALERT_EMAIL       — Email address for alerts (optional, requires sendmail)
# ============================================================

URL="${HEALTH_URL:-http://localhost:3000/api/health}"
TIMEOUT=10
LOG_FILE="/tmp/labcoop-health.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

send_alert() {
  local subject="$1"
  local message="$2"

  # Webhook alert (Slack / Discord)
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    curl -s -X POST "$ALERT_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"[LabCoop] ${subject}: ${message}\"}" \
      &>/dev/null || true
  fi

  # Email alert
  if [ -n "${ALERT_EMAIL:-}" ] && command -v sendmail &>/dev/null; then
    {
      echo "Subject: [LabCoop] ${subject}"
      echo "To: ${ALERT_EMAIL}"
      echo ""
      echo "${message}"
    } | sendmail -t &>/dev/null || true
  fi
}

log "Checking health at ${URL} ..."

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$URL" || echo "000")
HTTP_BODY=$(curl -s --max-time "$TIMEOUT" "$URL" || echo "")

if [ "$HTTP_CODE" = "200" ]; then
  log "OK — HTTP $HTTP_CODE"
  exit 0
else
  log "FAIL — HTTP $HTTP_CODE"
  send_alert "Health check failed" "URL: ${URL}\nHTTP: ${HTTP_CODE}\nBody: ${HTTP_BODY}"
  exit 1
fi
