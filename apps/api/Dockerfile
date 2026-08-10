# Build stage
FROM node:20-slim AS build
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# All workspace package.jsons so `npm install` (workspaces) resolves; deps
# hoist to the repo-root node_modules.
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx prisma generate && npm run build

# Runtime stage
FROM node:20-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# node_modules is hoisted to the repo root — copy that (there is no
# apps/api/node_modules). Node resolution from /app/apps/api walks up to it.
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/api/prisma /app/apps/api/prisma
COPY --from=build /app/apps/api/package.json /app/apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 5000
CMD npx prisma migrate deploy && node dist/main.js
