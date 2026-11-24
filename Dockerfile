# Stage 1: Build TypeScript source
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json postman_collection.json ./
RUN npm ci

COPY tsconfig*.json vite.config.ts ./
COPY src ./src
COPY client ./client
RUN npm run build

# Stage 2: Production runtime image
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json postman_collection.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
