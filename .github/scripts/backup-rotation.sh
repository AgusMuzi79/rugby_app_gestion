#!/usr/bin/env bash
# Prints, one per line, the backup keys that rotation should delete.
#
# Usage: backup-rotation.sh <cutoff> <keep_min> < keys
#   keys      object keys separated by whitespace (as `aws s3api list-objects-v2 --output
#             text` prints them; its "None" for an empty bucket is ignored)
#   cutoff    PREFIX + UTC date (e.g. supabase/2026-07-24); older keys are candidates
#   keep_min  never select so many that fewer than keep_min backups would remain
#
# Keys are PREFIX followed by the UTC timestamp, and cutoff carries the same PREFIX, so
# comparing strings compares dates. Only *.tar.gz.age keys count as backups.
#
# Fails closed: with a bad argument it prints nothing (deletes nothing) and exits 1.
set -uo pipefail

cutoff=${1:-}
keep_min=${2:-}

if ! [[ "$keep_min" =~ ^[0-9]+$ ]] || [ "$keep_min" -lt 1 ]; then
  echo "backup-rotation: keep_min must be an integer >= 1, got '$keep_min'" >&2
  exit 1
fi
if ! [[ "$cutoff" =~ ^.*[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "backup-rotation: cutoff must end in YYYY-MM-DD, got '$cutoff'" >&2
  exit 1
fi

backups=$(tr -s '[:space:]' '\n' | grep -E '\.tar\.gz\.age$' | sort)
remaining=$(printf '%s\n' "$backups" | grep -c .)

for key in $backups; do
  [[ "$key" < "$cutoff" ]] || break
  [ "$remaining" -le "$keep_min" ] && break
  echo "$key"
  remaining=$((remaining - 1))
done
