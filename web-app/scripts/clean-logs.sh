#!/bin/bash

# Clean up log files older than 7 days
echo "Cleaning up log files older than 7 days..."
find logs/ -name "server-*.log" -type f -mtime +7 -delete 2>/dev/null || true

# Keep only the 10 most recent logs
echo "Keeping only the 10 most recent logs..."
ls -t logs/server-*.log 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

echo "Log cleanup complete."