# Build from the repository root: docker build -f apps/web/Dockerfile -t uday-web .
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/web ./apps/web
COPY db ./db
RUN npm ci --no-audit --no-fund && NEXT_TELEMETRY_DISABLED=1 npm run build -w @uday/web

FROM node:20-alpine
WORKDIR /repo
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo /repo
USER node
EXPOSE 3000
CMD ["sh", "-c", "node db/migrate.mjs && npm run start -w @uday/web"]
