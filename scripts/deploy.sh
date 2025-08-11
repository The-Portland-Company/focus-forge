#!/bin/bash

# Automated Deployment Script with Monitoring
# Handles the complete deployment workflow with validation and monitoring

SERVICE_NAME="Loud & Clear"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}       Railway Automated Deployment Pipeline${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# Step 1: Validate environment variables
echo -e "${YELLOW}Step 1: Validating environment variables...${NC}"
if ! bash "$SCRIPT_DIR/validate-env.sh"; then
    echo -e "${RED}Environment validation failed. Fix the issues above and try again.${NC}"
    exit 1
fi
echo ""

# Step 2: Build locally to catch errors early
echo -e "${YELLOW}Step 2: Building locally to verify code...${NC}"
if ! npm run build; then
    echo -e "${RED}Local build failed. Fix the build errors and try again.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Local build successful${NC}"
echo ""

# Step 3: Deploy to Railway
echo -e "${YELLOW}Step 3: Deploying to Railway...${NC}"
deployment_output=$(railway up -s "$SERVICE_NAME" --detach 2>&1)
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to start deployment${NC}"
    echo "$deployment_output"
    exit 1
fi

echo -e "${GREEN}✅ Deployment started${NC}"
echo "$deployment_output"

# Extract build URL if available
build_url=$(echo "$deployment_output" | grep -o 'https://railway\.com/[^ ]*' | head -1)
if [ -n "$build_url" ]; then
    echo -e "${BLUE}Build logs: $build_url${NC}"
fi
echo ""

# Step 4: Wait for deployment to start
echo -e "${YELLOW}Step 4: Waiting for deployment to initialize...${NC}"
sleep 30
echo ""

# Step 5: Monitor deployment
echo -e "${YELLOW}Step 5: Monitoring deployment health...${NC}"
if ! bash "$SCRIPT_DIR/deployment-monitor.sh"; then
    echo ""
    echo -e "${RED}═══════════════════════════════════════════════════════${NC}"
    echo -e "${RED}           DEPLOYMENT FAILED${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Troubleshooting steps:"
    echo "1. Check the build logs: $build_url"
    echo "2. Verify environment variables: railway variables -s \"$SERVICE_NAME\""
    echo "3. Check recent logs: railway logs -s \"$SERVICE_NAME\""
    echo "4. Validate locally: npm run build && npm start"
    exit 1
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}           DEPLOYMENT SUCCESSFUL!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "🚀 Your application is live at:"
echo -e "${BLUE}https://loud-and-clear-production.up.railway.app${NC}"
echo ""
echo "Next steps:"
echo "• Test the application in your browser"
echo "• Check the health endpoint: curl https://loud-and-clear-production.up.railway.app/api/health | jq"
echo "• Monitor logs: railway logs -s \"$SERVICE_NAME\""
echo ""