# Stub Dockerfile — full multi-stage build (Angular build + nginx serve)
# defined in the Infra + Deploy sub-project. This is a placeholder so the
# monorepo tree matches the spec; it is not used for anything yet.
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npx", "ng", "serve", "--host", "0.0.0.0"]
