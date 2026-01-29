#!/bin/bash

# Deployment Monitor Script
# Automatically checks deployment status and health after Railway deployment

# Configuration
SERVICE_NAME="Command Center"
DEPLOYMENT_URL="https://loud-and-clear-production.up.railway.app"
HEALTH_ENDPOINT="/api/health"
MAX_RETRIES=20
RETRY_DELAY=15

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check deployment status
check_deployment() {
    response=$(curl -s "$DEPLOYMENT_URL$HEALTH_ENDPOINT")
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOYMENT_URL$HEALTH_ENDPOINT")
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ Deployment successful${NC}"
        echo "Response: $response"
        return 0
    elif [ "$http_code" = "503" ]; then
        echo -e "${YELLOW}⚠️  Service unhealthy (HTTP 503)${NC}"
        echo "Response: $response"
        
        # Check for specific issues
        if echo "$response" | grep -q "missing_credentials"; then
            echo -e "${RED}❌ Supabase credentials missing!${NC}"
            echo "Run: railway variables --set \"NEXT_PUBLIC_SUPABASE_URL=<url>\" --set \"NEXT_PUBLIC_SUPABASE_ANON_KEY=<key>\" -s \"$SERVICE_NAME\""
        fi
        return 1
    else
        echo -e "${RED}❌ Deployment not ready (HTTP $http_code)${NC}"
        return 1
    fi
}

# Function to get latest deployment logs
get_deployment_logs() {
    echo -e "${YELLOW}Fetching deployment logs...${NC}"
    railway logs -s "$SERVICE_NAME" 2>/dev/null | tail -100
}

# Function to check Railway variables
check_variables() {
    echo -e "${YELLOW}Checking Railway environment variables...${NC}"
    
    # Check for required variables
    vars=$(railway variables -s "$SERVICE_NAME" 2>/dev/null)
    
    required_vars=(
        "NEXT_PUBLIC_SUPABASE_URL"
        "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        "USE_SUPABASE"
    )
    
    for var in "${required_vars[@]}"; do
        if echo "$vars" | grep -q "^$var="; then
            echo -e "${GREEN}✅ $var is set${NC}"
        else
            echo -e "${RED}❌ $var is missing${NC}"
        fi
    done
}

# Main monitoring loop
monitor_deployment() {
    echo -e "${GREEN}Starting deployment monitoring...${NC}"
    echo "URL: $DEPLOYMENT_URL"
    echo "Service: $SERVICE_NAME"
    echo "Max retries: $MAX_RETRIES"
    echo "Retry delay: $RETRY_DELAY seconds"
    echo ""
    
    for i in $(seq 1 $MAX_RETRIES); do
        echo -e "${YELLOW}Check $i/$MAX_RETRIES...${NC}"
        
        if check_deployment; then
            echo -e "${GREEN}🎉 Deployment verified successfully!${NC}"
            exit 0
        fi
        
        if [ $i -eq $MAX_RETRIES ]; then
            echo -e "${RED}❌ DEPLOYMENT FAILED after $MAX_RETRIES attempts${NC}"
            echo ""
            echo "Diagnostics:"
            echo "============"
            check_variables
            echo ""
            echo "Latest logs:"
            echo "============"
            get_deployment_logs
            exit 1
        fi
        
        echo "Waiting $RETRY_DELAY seconds before retry..."
        sleep $RETRY_DELAY
        echo ""
    done
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --url)
            DEPLOYMENT_URL="$2"
            shift 2
            ;;
        --service)
            SERVICE_NAME="$2"
            shift 2
            ;;
        --max-retries)
            MAX_RETRIES="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --url URL           Deployment URL to check (default: $DEPLOYMENT_URL)"
            echo "  --service NAME      Railway service name (default: $SERVICE_NAME)"
            echo "  --max-retries N     Maximum retry attempts (default: $MAX_RETRIES)"
            echo "  --help              Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run the monitor
monitor_deployment