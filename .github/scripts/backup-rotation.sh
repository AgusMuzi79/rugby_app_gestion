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
set -uo pipefail

cutoff=$1
keep_min=$2

backups=$(tr -s '[:space:]' '\n' | grep -E '\.tar\.gz\.age$' | sort)
remaining=$(printf '%s\n' "$backups" | grep -c .)

for key in $backups; do
  [[ "$key" < "$cutoff" ]] || break
  [ "$remaining" -le "$keep_min" ] && break
  echo "$key"
  remaining=$((remaining - 1))
done
