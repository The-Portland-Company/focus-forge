#!/bin/bash

# Create logs directory if it doesn't exist
mkdir -p logs

# Generate timestamp for log file
TIMESTAMP=$(date +'%Y%m%d-%H%M%S')
LOG_FILE="logs/server-${TIMESTAMP}.log"

# Create a symbolic link to the latest log
ln -sf "server-${TIMESTAMP}.log" logs/latest.log

echo "Starting Next.js development server..."
echo "Logs will be written to: ${LOG_FILE}"
echo "Latest log symlink: logs/latest.log"
echo "----------------------------------------"

# Start the development server with logging
exec next dev --turbo -p 3244 2>&1 | tee "${LOG_FILE}"