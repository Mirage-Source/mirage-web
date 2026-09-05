FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
RUN addgroup --system mirage && adduser --system --ingroup mirage mirage
WORKDIR /app
ENV NODE_ENV=production
# next.config.mjs sets output: "standalone" -- this copies only the pruned
# server bundle Next produces from it, not the full node_modules tree.
COPY --from=builder --chown=mirage:mirage /app/.next/standalone ./
COPY --from=builder --chown=mirage:mirage /app/.next/static ./.next/static
USER mirage
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
