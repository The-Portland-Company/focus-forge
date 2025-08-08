# Use Node.js 20
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Build the application
RUN npm run build

# Expose port (Railway will provide the PORT environment variable)
EXPOSE $PORT

# Start the application using our custom server
CMD ["node", "server.js"]