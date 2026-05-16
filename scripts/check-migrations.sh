#!/usr/bin/env bash
# CI lint: block new migration files that introduce USING(true) without
# an explicit -- ALLOW-PERMISSIVE: <reason> marker in the same file.
#
# Only checks files that are NEW in the current push (git diff --diff-filter=A).
# This grandfathers existing migrations while catching future regressions.
#
# Called by: .github/workflows/supabase-migrations.yml
# Failure exit codes: 1 = permissive policy found without marker, 2 = git error
#
# See: https://github.com/your-org/rechnungstool/issues/SCH-833

set -euo pipefail

MIGRATIONS_DIR="supabase/migrations"
# Tables intentionally public-read — permissive SELECT policies are expected.
WHITELIST="public_videos|video_likes|video_saves"

# Detect newly added migration files in this push.
# In CI (push to master) use HEAD~1..HEAD; in PR runs use the base ref.
if [ -n "${GITHUB_BASE_REF:-}" ]; then
  BASE="origin/${GITHUB_BASE_REF}"
else
  BASE="${BASE_SHA:-HEAD~1}"
fi

mapfile -t NEW_FILES < <(
  git diff --diff-filter=A --name-only "${BASE}" HEAD -- "${MIGRATIONS_DIR}/*.sql" 2>/dev/null || true
)

if [ ${#NEW_FILES[@]} -eq 0 ]; then
  echo "check-migrations: no new migration files — skipping."
  exit 0
fi

echo "check-migrations: scanning ${#NEW_FILES[@]} new migration file(s)…"

FAILED=0

for file in "${NEW_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    continue
  fi

  # Find lines with a USING(true) policy clause (case-insensitive whitespace).
  while IFS= read -r line_num; do
    line_content=$(sed -n "${line_num}p" "$file")

    # Skip comment lines — the regex can appear in DROP/comment context.
    if echo "$line_content" | grep -qE '^\s*--'; then
      continue
    fi

    # Whitelisted table names: skip if the line (or nearby CREATE POLICY)
    # references a whitelisted table.
    if echo "$line_content" | grep -qE "$WHITELIST"; then
      continue
    fi

    # Check the 10 lines preceding this line for a -- ALLOW-PERMISSIVE: marker.
    start=$(( line_num > 10 ? line_num - 10 : 1 ))
    context=$(sed -n "${start},$((line_num - 1))p" "$file")

    if echo "$context" | grep -qE '^\s*--\s*ALLOW-PERMISSIVE\s*:'; then
      # Marker present — allowed.
      continue
    fi

    echo ""
    echo "::error file=${file},line=${line_num}::Permissive USING(true) policy found without -- ALLOW-PERMISSIVE: marker."
    echo "  File   : ${file}"
    echo "  Line   : ${line_num}"
    echo "  Content: ${line_content}"
    echo ""
    echo "  To allow an intentionally permissive policy, add this comment"
    echo "  on the line immediately above the CREATE POLICY statement:"
    echo ""
    echo "      -- ALLOW-PERMISSIVE: <reason why this table is intentionally public>"
    echo ""
    echo "  Whitelisted tables (no marker needed): ${WHITELIST}"
    echo "  Reference: SCH-833 — https://github.com/your-org/rechnungstool/issues/SCH-833"
    FAILED=1
  done < <(grep -nE 'USING\s*\(\s*true\s*\)' "$file" | cut -d: -f1)
done

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "check-migrations: FAILED — permissive RLS policies detected. See errors above."
  exit 1
fi

echo "check-migrations: all new migrations passed the permissive-policy check."
