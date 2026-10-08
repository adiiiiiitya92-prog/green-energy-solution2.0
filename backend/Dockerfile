# ==============================================================================
# Ultra-lightweight, High-performance Dockerfile for Green Energy Solution Backend
# Optimized for Hostinger KVM VPS Multi-Tenancy (Minimal RAM & Instant CPU Bursts)
# ==============================================================================

FROM node:20-alpine AS production

# Install tzdata, curl, and tini (for PID 1 signal forwarding and zombie reaping)
RUN apk add --no-cache tzdata curl tini

# Set Indian Standard Time for accurate business logging
ENV TZ=Asia/Kolkata

WORKDIR /app

# Copy package manifests first for optimal Docker layer caching
COPY package.json package-lock.json* ./

# Install only production dependencies cleanly
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy all application code (files excluded via .dockerignore)
COPY . .

# Run as standard non-root node user for container security
USER node

# Expose internal backend port
EXPOSE 5050

# Docker native healthcheck: verifies backend responsiveness every 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:5050/api/health || exit 1

# Use tini as the PID 1 init process to forward signals and reap zombie processes cleanly
ENTRYPOINT ["/sbin/tini", "--"]

# Start Node with optimal V8 heap cap (512MB) to trigger timely garbage collection
CMD ["node", "--max-old-space-size=512", "server.js"]
