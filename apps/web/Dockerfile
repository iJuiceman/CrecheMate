# Build stage
FROM node:20-slim AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm install
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npm run build

# Runtime stage — Next.js standalone output
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
WORKDIR /app/apps/web
# Drop root — the standalone server needs no write access.
USER node
CMD ["node", "server.js"]
