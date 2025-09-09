# Deployment Monitoring Plan for Railway

## Current Issues
- Deployments fail silently without automatic notification
- Manual checking required to detect failures
- Supabase environment variables errors not caught early
- No automated health checks after deployment

## Proposed Solution Architecture

### 1. Immediate Solutions (Using Current Tools)

#### A. Automated Deployment Check Script
```bash
#!/bin/bash
# deployment-monitor.sh

# Configuration
SERVICE_NAME="Loud & Clear"
DEPLOYMENT_URL="https://loud-and-clear-production.up.railway.app"
HEALTH_ENDPOINT="/api/health"
MAX_RETRIES=10
RETRY_DELAY=30

# Function to check deployment status
check_deployment() {
    response=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOYMENT_URL$HEALTH_ENDPOINT")
    if [ "$response" = "200" ]; then
        echo "✅ Deployment successful"
        return 0
    else
        echo "❌ Deployment failed or not ready (HTTP $response)"
        return 1
    fi
}

# Function to get latest deployment logs
get_deployment_logs() {
    railway logs -s "$SERVICE_NAME" 2>/dev/null | tail -50
}

# Main monitoring loop
monitor_deployment() {
    echo "Starting deployment monitoring..."
    
    for i in $(seq 1 $MAX_RETRIES); do
        echo "Check $i/$MAX_RETRIES..."
        
        if check_deployment; then
            echo "Deployment verified successfully!"
            exit 0
        fi
        
        if [ $i -eq $MAX_RETRIES ]; then
            echo "❌ DEPLOYMENT FAILED after $MAX_RETRIES attempts"
            echo "Latest logs:"
            get_deployment_logs
            exit 1
        fi
        
        echo "Waiting $RETRY_DELAY seconds before retry..."
        sleep $RETRY_DELAY
    done
}

monitor_deployment
```

#### B. Health Check Endpoint
Create a dedicated health check endpoint that validates all critical services:

```typescript
// app/api/health/route.ts
export async function GET() {
  const checks = {
    app: 'ok',
    database: 'unknown',
    supabase: 'unknown',
    timestamp: new Date().toISOString()
  };

  // Check database connection
  try {
    const db = await getDatabase();
    checks.database = db ? 'ok' : 'error';
  } catch (error) {
    checks.database = 'error';
  }

  // Check Supabase if enabled
  if (process.env.USE_SUPABASE === 'true') {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!url || !key) {
        checks.supabase = 'missing_credentials';
      } else {
        // Attempt a simple Supabase operation
        const { createClient } = await import('@/lib/supabase/client');
        const client = createClient();
        await client.from('users').select('count').limit(1);
        checks.supabase = 'ok';
      }
    } catch (error) {
      checks.supabase = 'error';
    }
  } else {
    checks.supabase = 'disabled';
  }

  const allOk = Object.values(checks).every(v => 
    v === 'ok' || v === 'disabled' || v instanceof Date
  );

  return Response.json(checks, { 
    status: allOk ? 200 : 503 
  });
}
```

### 2. Enhanced MCP Integration

#### A. Install Railway MCP Server
```bash
# Install the Railway MCP server for better monitoring
npx -y @smithery/cli@latest run @jason-tan-swe/railway-mcp \
  --config "{\"railwayApiToken\":\"$RAILWAY_API_TOKEN\"}"
```

#### B. Available MCP Monitoring Commands
- `deployment_list` - List recent deployments
- `deployment_status` - Check deployment status
- `deployment_logs` - Get deployment logs
- `deployment-health-check` - Check deployment health

### 3. Automated Monitoring Workflow

#### A. Post-Deployment Hook
```bash
#!/bin/bash
# post-deploy.sh

# 1. Trigger deployment
railway up -s "Loud & Clear" --detach

# 2. Wait for deployment to start
sleep 10

# 3. Monitor deployment status
./deployment-monitor.sh

# 4. If failed, collect diagnostics
if [ $? -ne 0 ]; then
    echo "Collecting diagnostics..."
    railway variables -s "Loud & Clear" > deployment-vars.txt
    railway logs -s "Loud & Clear" > deployment-logs.txt
    
    # Check for common issues
    if grep -q "Supabase" deployment-logs.txt; then
        echo "⚠️ Supabase configuration issue detected"
        echo "Current variables:"
        railway variables -s "Loud & Clear" | grep SUPABASE
    fi
fi
```

#### B. GitHub Actions Integration
```yaml
# .github/workflows/railway-deploy.yml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Railway CLI
        run: npm i -g @railway/cli
      
      - name: Deploy to Railway
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          railway up --service "Loud & Clear" --detach
      
      - name: Wait for deployment
        run: sleep 120
      
      - name: Health check
        run: |
          for i in {1..10}; do
            response=$(curl -s -o /dev/null -w "%{http_code}" https://loud-and-clear-production.up.railway.app/api/health)
            if [ "$response" = "200" ]; then
              echo "Deployment successful!"
              exit 0
            fi
            echo "Attempt $i failed, waiting..."
            sleep 30
          done
          echo "Deployment health check failed!"
          exit 1
```

### 4. Environment Variable Validation

#### A. Pre-deployment Check Script
```bash
#!/bin/bash
# validate-env.sh

echo "Validating environment variables..."

# Required variables
REQUIRED_VARS=(
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
)

# Check Railway variables
for var in "${REQUIRED_VARS[@]}"; do
  value=$(railway variables -s "Loud & Clear" | grep "^$var=" | cut -d'=' -f2)
  if [ -z "$value" ]; then
    echo "❌ Missing required variable: $var"
    exit 1
  else
    echo "✅ $var is set"
  fi
done

echo "All required variables are set!"
```

### 5. Alternative MCP Servers to Consider

#### For Better Monitoring:
1. **Datadog MCP** - Full APM and logging
2. **Grafana MCP** - Metrics and dashboards
3. **Sentry MCP** - Error tracking and performance
4. **HyperDX MCP** - Unified observability platform

#### For Deployment Management:
1. **Vercel MCP** - Alternative deployment platform with better monitoring
2. **Netlify MCP** - Simpler deployments with automatic previews
3. **Fly.io MCP** - Better health checks and scaling

### 6. Implementation Priority

1. **Immediate** (Today):
   - ✅ Add health check endpoint
   - ✅ Create deployment monitor script
   - ✅ Set up environment variable validation

2. **Short-term** (This Week):
   - Install Railway MCP server
   - Set up GitHub Actions workflow
   - Add Sentry for error tracking

3. **Long-term** (This Month):
   - Evaluate alternative deployment platforms
   - Implement full observability stack
   - Set up alerts and notifications

## Usage

### Manual Deployment with Monitoring:
```bash
# 1. Validate environment
./validate-env.sh

# 2. Deploy and monitor
./post-deploy.sh

# 3. Check health
curl https://loud-and-clear-production.up.railway.app/api/health
```

### Automated via Git Push:
```bash
git add .
git commit -m "Deploy with monitoring"
git push origin main
# GitHub Actions will handle deployment and monitoring
```

## Common Issues and Solutions

| Issue | Detection | Solution |
|-------|-----------|----------|
| Missing Supabase credentials | Health check returns 503 | Run `railway variables --set` with credentials |
| Build failure | Deployment logs show npm errors | Check TypeScript errors locally |
| Runtime crash | Health check times out | Check logs for uncaught exceptions |
| Port mismatch | 404 on all routes | Ensure PORT env var is used |

## Monitoring Dashboard

Consider setting up a simple monitoring dashboard:
- Deployment status
- Health check results
- Error logs
- Performance metrics
- Environment variable status

This can be built into the admin UI or use external services like Better Uptime or Pingdom.