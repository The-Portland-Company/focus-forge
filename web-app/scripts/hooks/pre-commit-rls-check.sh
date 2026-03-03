#!/bin/bash

# RLS Recursion Prevention Hook
# Checks for self-referential patterns in SQL files that could cause infinite recursion

echo "Checking for RLS recursion patterns..."

# Get staged SQL files
STAGED_SQL=$(git diff --cached --name-only --diff-filter=ACM | grep '\.sql$')

if [ -n "$STAGED_SQL" ]; then
  for file in $STAGED_SQL; do
    # Check for self-referential user_organizations policies
    if grep -q "ON user_organizations" "$file" && grep -q "FROM user_organizations" "$file"; then
      # More specific check - look for policy definition that references same table
      if grep -A 20 "ON user_organizations" "$file" | grep -q "FROM user_organizations"; then
        echo "ERROR: Potential RLS recursion detected in $file"
        echo "  -> Policy on user_organizations appears to query user_organizations"
        echo "  -> Use user_belongs_to_org() SECURITY DEFINER function instead"
        exit 1
      fi
    fi

    # Generic check for any table policy that queries itself
    # Extract table names from CREATE POLICY statements and check for self-reference
    while IFS= read -r line; do
      if [[ $line =~ "CREATE POLICY".*"ON "([a-zA-Z_]+) ]]; then
        table="${BASH_REMATCH[1]}"
        # Check if the policy body references the same table
        policy_block=$(sed -n "/CREATE POLICY.*ON $table/,/;/p" "$file" 2>/dev/null)
        if echo "$policy_block" | grep -q "FROM $table\|JOIN $table"; then
          echo "WARNING: Potential RLS recursion in $file"
          echo "  -> Policy on '$table' may query '$table' directly"
          echo "  -> Consider using a SECURITY DEFINER function"
        fi
      fi
    done < "$file"
  done
fi

echo "RLS recursion check passed."
exit 0
