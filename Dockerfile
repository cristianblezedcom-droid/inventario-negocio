FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY client ./client
COPY public ./public
COPY src ./src
COPY test ./test
COPY e2e ./e2e
COPY playwright.config.ts ./
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir data && chown node:node data
COPY --from=builder /app/dist ./dist
COPY src ./src
ENV HOST=0.0.0.0 PORT=4317
USER node
EXPOSE 4317
CMD ["npm", "start"]
