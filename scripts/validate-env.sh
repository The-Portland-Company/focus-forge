#!/bin/bash

# Environment Variable Validation Script
# Checks Railway environment before deployment

SERVICE_NAME="Loud & Clear"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Validating Railway environment variables...${NC}"
echo "Service: $SERVICE_NAME"
echo ""

# Get current variables (use raw output without table formatting)
vars=$(railway variables -s "$SERVICE_NAME" --json 2>/dev/null)

if [ -z "$vars" ]; then
    echo -e "${RED}❌ Failed to fetch Railway variables${NC}"
    echo "Make sure you're logged in: railway login"
    echo "And linked to the project: railway link"
    exit 1
fi

# Required variables for production
REQUIRED_VARS=(
    "NEXT_PUBLIC_SUPABASE_URL"
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    "USE_SUPABASE"
)

# Optional but recommended variables
OPTIONAL_VARS=(
    "NODE_ENV"
    "PORT"
)

errors=0
warnings=0

echo "Required Variables:"
echo "==================="
for var in "${REQUIRED_VARS[@]}"; do
    value=$(echo "$vars" | jq -r ".$var // empty" 2>/dev/null)
    if [ -z "$value" ]; then
        echo -e "${RED}❌ $var is missing${NC}"
        errors=$((errors + 1))
    else
        # Validate specific variable formats
        case $var in
            NEXT_PUBLIC_SUPABASE_URL)
                if [[ ! "$value" =~ ^https://.*\.supabase\.co$ ]]; then
                    echo -e "${YELLOW}⚠️  $var may be invalid: $value${NC}"
                    warnings=$((warnings + 1))
                else
                    echo -e "${GREEN}✅ $var is set correctly${NC}"
                fi
                ;;
            NEXT_PUBLIC_SUPABASE_ANON_KEY)
                if [[ ${#value} -lt 50 ]]; then
                    echo -e "${YELLOW}⚠️  $var seems too short${NC}"
                    warnings=$((warnings + 1))
                else
                    echo -e "${GREEN}✅ $var is set (${#value} chars)${NC}"
                fi
                ;;
            USE_SUPABASE)
                if [[ "$value" != "true" && "$value" != "false" ]]; then
                    echo -e "${YELLOW}⚠️  $var should be 'true' or 'false', got: $value${NC}"
                    warnings=$((warnings + 1))
                else
                    echo -e "${GREEN}✅ $var = $value${NC}"
                fi
                ;;
            *)
                echo -e "${GREEN}✅ $var is set${NC}"
                ;;
        esac
    fi
done

echo ""
echo "Optional Variables:"
echo "==================="
for var in "${OPTIONAL_VARS[@]}"; do
    value=$(echo "$vars" | jq -r ".$var // empty" 2>/dev/null)
    if [ -z "$value" ]; then
        echo -e "${YELLOW}⚠️  $var is not set (using defaults)${NC}"
        warnings=$((warnings + 1))
    else
        echo -e "${GREEN}✅ $var = $value${NC}"
    fi
done

echo ""
echo "Summary:"
echo "========="
if [ $errors -gt 0 ]; then
    echo -e "${RED}❌ Validation failed with $errors errors${NC}"
    echo ""
    echo "To fix missing variables, run:"
    echo "railway variables --set \"VAR_NAME=value\" -s \"$SERVICE_NAME\""
    echo ""
    echo "Example for Supabase:"
    echo "railway variables --set \"NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\" \\"
    echo "                 --set \"NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key\" \\"
    echo "                 --set \"USE_SUPABASE=true\" \\"
    echo "                 -s \"$SERVICE_NAME\""
    exit 1
elif [ $warnings -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Validation passed with $warnings warnings${NC}"
    echo "Review the warnings above before deploying."
    exit 0
else
    echo -e "${GREEN}✅ All environment variables are properly configured!${NC}"
    exit 0
fi