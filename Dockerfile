# Use Node.js 18 as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files for backend
COPY backend/package*.json ./backend/
WORKDIR /app/backend

# Install backend dependencies
RUN npm ci --only=production

# Copy backend source code
COPY backend ./

# Build backend
RUN npm run build

# Copy data directory
COPY data ../data/

# Expose port
EXPOSE 5001

# Set environment to production
ENV NODE_ENV=production

# Start command
CMD ["npm", "start"]
