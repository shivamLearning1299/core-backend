# -------- Stage 1: Build --------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Copy prisma schema (needed before npm ci: the postinstall script runs
# `prisma generate`, which requires the schema to already be present)
COPY prisma ./prisma

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY . .

# Build NestJS application
RUN npm run build


# -------- Stage 2: Runtime --------
FROM node:20-alpine AS production

WORKDIR /app

# Ensure production runtime behavior
ENV NODE_ENV=production

# Copy dependency manifests
COPY package*.json ./

# Copy prisma schema (needed before npm ci: the postinstall script runs
# `prisma generate`, which requires the schema to already be present)
COPY prisma ./prisma

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Expose API port
EXPOSE 3000

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Start the application with migrations
ENTRYPOINT ["docker-entrypoint.sh"]