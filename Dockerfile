# Use Node.js 20
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the Next.js application
RUN npm run build

# Remove devDependencies to reduce image size
RUN npm ci --only=production && npm cache clean --force

# Set environment to production
ENV NODE_ENV=production

# Expose port (Railway will set this)
EXPOSE 3000

# Start the application using our custom server
CMD ["node", "server.js"]