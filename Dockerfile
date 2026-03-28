# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY shared shared
COPY client client
COPY server server
RUN npm run build

FROM node:22-bookworm-slim AS production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/shared/dist /app/shared/dist
COPY --from=build /app/server/dist /app/server/dist
COPY --from=build /app/client/dist /app/client/dist
ENV NODE_ENV=production
ENV DB_PATH=/data/push-rummy.db
EXPOSE 8787
WORKDIR /app/server
CMD ["node", "dist/index.js"]
