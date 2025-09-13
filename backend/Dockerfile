# Use the official Node.js runtime as the base image
FROM node:18-alpine AS builder

# Install OpenSSL and other required libraries for Prisma
RUN apk add --no-cache openssl libc6-compat

# Set the working directory in the container
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy Prisma schema
COPY prisma ./prisma

# Copy source code
COPY src ./src

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install dumb-init and OpenSSL libraries for Prisma
RUN apk add --no-cache dumb-init openssl libc6-compat

# Create a non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S cloudcare -u 1001

# Set the working directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy Prisma schema and generate client for production
COPY prisma ./prisma
RUN npx prisma generate

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy additional necessary files for production
COPY --chown=cloudcare:nodejs database ./database

# Create and copy logs directory
RUN mkdir -p logs && chown -R cloudcare:nodejs logs

# Create and copy uploads directory  
RUN mkdir -p uploads && chown -R cloudcare:nodejs uploads

# Switch to non-root user
USER cloudcare

# Expose the port the app runs on
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node dist/utils/healthcheck.js

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/server.js"]
