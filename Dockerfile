FROM node:22-alpine AS deps
WORKDIR /app
COPY data/package.json data/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY data/package.json ./
COPY data/server.js    ./
COPY data/public       ./public

RUN chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production \
    PAPERLESS_URL=https://paperless.b.eumel.de

EXPOSE 3000

CMD ["node", "server.js"]
