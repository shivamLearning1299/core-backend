# -------- Stage 1: Build --------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

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

# Install only production dependencies
RUN npm ci --only=production

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Workers typically don't expose ports (background processing)
# If your worker needs to expose a port, add: EXPOSE <port>

# Start the worker application
CMD ["node", "dist/main.js"]
