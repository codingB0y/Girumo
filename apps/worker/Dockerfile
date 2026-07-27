# Build standalone (contexto = apps/worker): o worker não importa nenhum
# workspace irmão, então instala só as próprias deps. Mesmo padrão do
# hubflow-engine/Dockerfile.

FROM node:22.14.0-alpine3.21 AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22.14.0-alpine3.21 AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

FROM node:22.14.0-alpine3.21 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV WORKER_HEALTH_PORT=3002
RUN apk add --no-cache wget
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 3002
CMD ["node", "dist/index.js"]
