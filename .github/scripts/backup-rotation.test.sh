#!/usr/bin/env bash
# Tests for backup-rotation.sh. Run: bash .github/scripts/backup-rotation.test.sh
set -uo pipefail

rotation="$(dirname "$0")/backup-rotation.sh"
fail=0

key() { echo "supabase/$1-06-00-00.tar.gz.age"; }

expect() {
  local name=$1 want=$2 got=$3
  if [ "$got" = "$want" ]; then
    echo "ok   $name"
  else
    printf 'FAIL %s\n  want: %s\n  got:  %s\n' "$name" "$want" "$got"
    fail=1
  fi
}

cutoff=supabase/2026-07-24

expect "deletes only keys older than the cutoff date" \
  "$(key 2026-07-23)" \
  "$(printf '%s\t%s\t%s\n' "$(key 2026-07-23)" "$(key 2026-07-24)" "$(key 2026-10-22)" \
    | bash "$rotation" "$cutoff" 1)"

expect "a backup from the cutoff day itself is kept" \
  "" \
  "$(printf '%s\n' "$(key 2026-07-24)" "$(key 2026-10-22)" | bash "$rotation" "$cutoff" 1)"

expect "ignores keys that are not backups" \
  "$(key 2026-07-01)" \
  "$(printf '%s\n' supabase/2026-07-01-notes.txt "$(key 2026-07-01)" "$(key 2026-10-22)" \
    | bash "$rotation" "$cutoff" 1)"

expect "unsorted listing is handled oldest first" \
  "$(printf '%s\n' "$(key 2026-07-01)" "$(key 2026-07-02)")" \
  "$(printf '%s\n' "$(key 2026-10-22)" "$(key 2026-07-02)" "$(key 2026-07-01)" \
    | bash "$rotation" "$cutoff" 1)"

# Resumed after a long stop: 20 backups older than the cutoff plus today's.
old=""; for d in $(seq 1 20); do old+="$(key "2026-06-$(printf '%02d' "$d")") "; done
want=""; for d in $(seq 1 7); do want+="$(key "2026-06-$(printf '%02d' "$d")")"$'\n'; done
expect "never leaves fewer than keep_min backups" \
  "${want%$'\n'}" \
  "$(echo "$old $(key 2026-10-22)" | bash "$rotation" "$cutoff" 14)"

expect "nothing to delete when at keep_min" \
  "" \
  "$(echo "$(key 2026-06-01) $(key 2026-10-22)" | bash "$rotation" "$cutoff" 2)"

expect "empty bucket listing (None) selects nothing" \
  "" \
  "$(echo None | bash "$rotation" "$cutoff" 14)"

for bad in "" "x" "-1" "0" "14 # comment"; do
  out=$(echo "$(key 2026-06-01) $(key 2026-10-22)" | bash "$rotation" "$cutoff" "$bad" 2>/dev/null)
  status=$?
  expect "keep_min '$bad' fails closed" "1:" "$status:$out"
done

for bad in "" "supabase/" "supabase/2026-07"; do
  out=$(echo "$(key 2026-06-01) $(key 2026-10-22)" | bash "$rotation" "$bad" 1 2>/dev/null)
  status=$?
  expect "cutoff '$bad' fails closed" "1:" "$status:$out"
done

exit $fail
