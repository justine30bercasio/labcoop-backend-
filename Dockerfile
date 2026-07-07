FROM node:18-alpine AS builder
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production && cp -r node_modules /prod_modules
COPY backend/ .

FROM node:18-alpine AS production
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /prod_modules ./node_modules
COPY --from=builder /app .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
USER appuser
CMD ["node", "src/index.js"]
