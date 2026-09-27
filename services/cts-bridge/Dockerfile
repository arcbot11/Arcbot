FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY lib ./lib
COPY services/cts-bridge/server.ts ./services/cts-bridge/server.ts
COPY scripts/build-agent-bridge.mjs ./scripts/build-agent-bridge.mjs
RUN npm run agent-bridge:build && npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3102
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.agent-bridge ./.agent-bridge
USER node
EXPOSE 3102
CMD ["node", "--use-system-ca", ".agent-bridge/server.mjs"]
